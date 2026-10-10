-- Full schema: clients, cases, parties, hearings, billing, invoices.
-- Safe to re-run (all CREATE IF NOT EXISTS).

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ─── Clients ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS clients (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  email        TEXT,
  phone        TEXT,
  company      TEXT,
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clients_name ON clients (name);

-- ─── Cases ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cases (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id         UUID REFERENCES clients (id) ON DELETE SET NULL,
  case_no           TEXT NOT NULL UNIQUE,
  cnr_number        TEXT,                        -- 16-char CNR for eCourts lookup
  case_year         INT,
  case_title        TEXT,
  court             TEXT DEFAULT 'Delhi High Court',
  case_type         TEXT,                        -- W.P.(C), CRL.A., etc.
  status            TEXT DEFAULT 'Pending',
  filing_date       DATE,
  next_hearing_date DATE,
  last_hearing_date DATE,
  source_url        TEXT,                        -- URL fetched from
  last_fetched_at   TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cases_case_no    ON cases (case_no);
CREATE INDEX IF NOT EXISTS idx_cases_year       ON cases (case_year);
CREATE INDEX IF NOT EXISTS idx_cases_client_id  ON cases (client_id);
CREATE INDEX IF NOT EXISTS idx_cases_cnr        ON cases (cnr_number);

-- ─── Parties ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS parties (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id   UUID NOT NULL REFERENCES cases (id) ON DELETE CASCADE,
  name      TEXT NOT NULL,
  role      TEXT NOT NULL CHECK (role IN ('petitioner', 'respondent'))
);

CREATE INDEX IF NOT EXISTS idx_parties_case_id   ON parties (case_id);
CREATE INDEX IF NOT EXISTS idx_parties_name_trgm ON parties USING GIN (name gin_trgm_ops);

-- ─── Hearings (full history, one row per hearing) ─────────────────────────────
CREATE TABLE IF NOT EXISTS hearings (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id     UUID NOT NULL REFERENCES cases (id) ON DELETE CASCADE,
  date        DATE NOT NULL,
  purpose     TEXT,
  outcome     TEXT,                              -- adjourned / decided / order passed
  next_date   DATE,                              -- court noted next date
  notes       TEXT,
  source      TEXT DEFAULT 'cause_list',
  order_url   TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_hearings_case_date ON hearings (case_id, date);
CREATE INDEX IF NOT EXISTS idx_hearings_case_id ON hearings (case_id);
CREATE INDEX IF NOT EXISTS idx_hearings_date    ON hearings (date);

-- ─── Billing entries (per hearing / per task) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS billing_entries (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id      UUID NOT NULL REFERENCES cases (id) ON DELETE CASCADE,
  client_id    UUID REFERENCES clients (id) ON DELETE SET NULL,
  hearing_id   UUID REFERENCES hearings (id) ON DELETE SET NULL,
  description  TEXT NOT NULL,
  entry_date   DATE NOT NULL DEFAULT CURRENT_DATE,
  hours        NUMERIC(6,2) DEFAULT 0,
  rate         NUMERIC(10,2) DEFAULT 0,          -- per hour rate
  amount       NUMERIC(10,2) NOT NULL,           -- hours * rate or flat fee
  entry_type   TEXT DEFAULT 'hearing'            -- hearing | drafting | filing | misc
    CHECK (entry_type IN ('hearing','drafting','filing','misc','retainer')),
  is_billed    BOOLEAN DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_billing_case_id   ON billing_entries (case_id);
CREATE INDEX IF NOT EXISTS idx_billing_client_id ON billing_entries (client_id);

-- ─── Invoices ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS invoices (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number TEXT NOT NULL UNIQUE,           -- INV-2026-0001
  client_id      UUID NOT NULL REFERENCES clients (id) ON DELETE CASCADE,
  case_id        UUID REFERENCES cases (id) ON DELETE SET NULL,
  issue_date     DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date       DATE,
  subtotal       NUMERIC(10,2) NOT NULL DEFAULT 0,
  tax_pct        NUMERIC(5,2)  DEFAULT 18,       -- GST 18%
  tax_amount     NUMERIC(10,2) DEFAULT 0,
  total          NUMERIC(10,2) NOT NULL DEFAULT 0,
  status         TEXT DEFAULT 'draft'
    CHECK (status IN ('draft','sent','paid','overdue','cancelled')),
  notes          TEXT,
  ai_summary     TEXT,                           -- AI-generated summary of work done
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invoices_client_id ON invoices (client_id);
CREATE INDEX IF NOT EXISTS idx_invoices_case_id   ON invoices (case_id);

-- ─── Invoice line items ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS invoice_items (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id   UUID NOT NULL REFERENCES invoices (id) ON DELETE CASCADE,
  billing_id   UUID REFERENCES billing_entries (id) ON DELETE SET NULL,
  description  TEXT NOT NULL,
  quantity     NUMERIC(6,2) DEFAULT 1,
  unit_price   NUMERIC(10,2) NOT NULL,
  amount       NUMERIC(10,2) NOT NULL
);

-- ─── Case events (audit trail for changes) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS case_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id     UUID NOT NULL REFERENCES cases (id) ON DELETE CASCADE,
  event_type  TEXT NOT NULL,    -- hearing_added | date_changed | status_changed | fetched
  old_value   TEXT,
  new_value   TEXT,
  source      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_case_events_case_id ON case_events (case_id);

-- ─── Orders (downloaded court PDFs + extracted text) ─────────────────────────
CREATE TABLE IF NOT EXISTS orders (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id      UUID NOT NULL REFERENCES cases (id) ON DELETE CASCADE,
  order_date   DATE NOT NULL,
  order_type   TEXT DEFAULT 'Order',
  court_no     TEXT,
  bench        TEXT,
  pdf_url      TEXT,
  local_path   TEXT,
  file_size    INT,
  text_content TEXT,
  source       TEXT DEFAULT 'dhc_history',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_case_date ON orders (case_id, order_date);
CREATE INDEX IF NOT EXISTS idx_orders_case_id ON orders (case_id);
CREATE INDEX IF NOT EXISTS idx_orders_date ON orders (order_date DESC);
CREATE INDEX IF NOT EXISTS idx_orders_text ON orders USING GIN (to_tsvector('english', COALESCE(text_content, '')));
