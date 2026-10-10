-- Migration: Create Court Registry Tables
-- Version: 001
-- Description: Add tables for nationwide court registry, case type mappings, advocates, and audit logging
-- 
-- This migration extends the existing schema (cases, parties, hearings, orders) with:
-- - Court & bench metadata
-- - Case type mappings (source code -> normalized category)
-- - Advocate registry
-- - Fetch job tracking
-- - Source verification snapshots
-- - Comprehensive audit logs

-- ─────────────────────────────────────────────────────────────────────────────
-- Courts Table (Master registry of all courts, tribunals, commissions)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS courts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(50) NOT NULL UNIQUE,                    -- "delhi_hc", "bombay_hc", "nclt", etc.
  name TEXT NOT NULL,
  court_type VARCHAR(50) NOT NULL,                     -- high_court, district, tribunal, commission, supreme_court
  institution_type VARCHAR(50) NOT NULL,               -- court, tribunal, commission, regulatory_authority
  state_ut VARCHAR(2),                                 -- State/UT code ("DL", "MH", "UP", etc.)
  district VARCHAR(100),                               -- District name (null for HC/SCI/tribunal)
  official_website TEXT,
  high_court_id UUID REFERENCES courts(id) ON DELETE SET NULL,  -- Appellate HC (if applicable)
  jurisdiction VARCHAR(50) DEFAULT 'state',            -- state, national, regional
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_courts_code ON courts(code);
CREATE INDEX idx_courts_state_ut ON courts(state_ut);
CREATE INDEX idx_courts_type ON courts(court_type);
CREATE INDEX idx_courts_hc ON courts(high_court_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Court Benches (Benches within each court, e.g., Mumbai Bench of Bombay HC)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS court_benches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  court_id UUID NOT NULL REFERENCES courts(id) ON DELETE CASCADE,
  bench_code VARCHAR(50) NOT NULL,                     -- "BHHCMB", "BHHCNP", etc.
  bench_name TEXT NOT NULL,                            -- "Mumbai Bench", "Nagpur Bench"
  location TEXT,                                       -- "Mumbai", "Nagpur", etc.
  judge_count INT,
  official_website TEXT,
  case_status_url TEXT,
  orders_url TEXT,
  cause_list_url TEXT,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_court_benches_code ON court_benches(court_id, bench_code);
CREATE INDEX idx_court_benches_court_id ON court_benches(court_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Court Sources (Data sources & adapters for each court)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS court_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  court_id UUID NOT NULL REFERENCES courts(id) ON DELETE CASCADE,
  adapter_id VARCHAR(100) NOT NULL,                    -- "ecourts_hc", "delhi_hc", "nclt", etc.
  source_url TEXT NOT NULL,
  search_methods TEXT[],                               -- ["case_number", "cnr", "party_name"]
  supported_data_fields TEXT[],                        -- ["status", "parties", "hearing_history", "orders"]
  requires_captcha BOOLEAN DEFAULT FALSE,
  requires_authentication BOOLEAN DEFAULT FALSE,
  rate_limit_per_hour INT DEFAULT 100,
  session_timeout_minutes INT DEFAULT 30,
  last_verified_at TIMESTAMP,
  verification_status VARCHAR(50) DEFAULT 'unverified', -- verified, unverified, broken
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_court_sources_court_id ON court_sources(court_id);
CREATE INDEX idx_court_sources_adapter ON court_sources(adapter_id);
CREATE INDEX idx_court_sources_status ON court_sources(verification_status);

-- ─────────────────────────────────────────────────────────────────────────────
-- Case Type Mappings (Source code -> Normalized category)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS case_type_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_code VARCHAR(100) NOT NULL,                   -- "W.P.(C)", "CC", "CP", "ITA", etc.
  source_court_id UUID REFERENCES courts(id) ON DELETE SET NULL,
  normalized_category VARCHAR(100) NOT NULL,          -- constitutional_writ, criminal_case, insolvency, etc.
  full_name TEXT,                                      -- "Writ Petition (Civil)", "Criminal Case", etc.
  is_appellate BOOLEAN DEFAULT FALSE,
  parent_case_type_id UUID REFERENCES case_type_mappings(id) ON DELETE SET NULL,
  alternate_codes TEXT[],                              -- ["WPC", "W.P.C", "WP(C)"] for fuzzy matching
  case_number_format TEXT,                             -- Pattern/regex for case number
  jurisdiction VARCHAR(50),                            -- high_court, district, tribunal, commission
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_case_type_mappings_code ON case_type_mappings(source_code);
CREATE INDEX idx_case_type_mappings_category ON case_type_mappings(normalized_category);
CREATE INDEX idx_case_type_mappings_court ON case_type_mappings(source_court_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Advocates (Bar registry / advocate details)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS advocates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  bar_registration_number VARCHAR(100),
  state_bar VARCHAR(100),                              -- "Bar Council of Delhi", etc.
  enrolled_year INT,
  practice_areas TEXT[],                               -- ["criminal", "commercial", "constitutional"]
  contact_email TEXT,
  contact_phone TEXT,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_advocates_name ON advocates(name);
CREATE INDEX idx_advocates_bar_registration ON advocates(bar_registration_number);
CREATE INDEX idx_advocates_state_bar ON advocates(state_bar);

-- ─────────────────────────────────────────────────────────────────────────────
-- Case-Advocate Junction (Links advocates to cases & parties)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS case_advocates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  advocate_id UUID REFERENCES advocates(id) ON DELETE SET NULL,
  party_represented VARCHAR(50),                       -- petitioner, respondent, accused, complainant
  role VARCHAR(100),                                   -- "Senior Advocate", "Lead Counsel", etc.
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_case_advocates_case_id ON case_advocates(case_id);
CREATE INDEX idx_case_advocates_advocate_id ON case_advocates(advocate_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Fetch Jobs (Track background fetch attempts for cases)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS fetch_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  adapter_id VARCHAR(100) NOT NULL,
  status VARCHAR(50) NOT NULL,                         -- pending, running, success, failed, captcha, rate_limited
  attempts INT DEFAULT 0,
  last_attempted_at TIMESTAMP,
  next_retry_at TIMESTAMP,
  error_message TEXT,
  result_summary TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_fetch_jobs_case_id ON fetch_jobs(case_id);
CREATE INDEX idx_fetch_jobs_adapter ON fetch_jobs(adapter_id);
CREATE INDEX idx_fetch_jobs_status ON fetch_jobs(status);
CREATE INDEX idx_fetch_jobs_next_retry ON fetch_jobs(next_retry_at) WHERE status IN ('pending', 'failed');

-- ─────────────────────────────────────────────────────────────────────────────
-- Source Snapshots (Version history of raw data from sources)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS source_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  fetch_job_id UUID REFERENCES fetch_jobs(id) ON DELETE SET NULL,
  source_url TEXT,
  source_data JSONB,                                   -- Raw response from source
  normalized_data JSONB,                               -- Normalized by adapter
  fetch_timestamp TIMESTAMP,
  parser_version VARCHAR(20),
  parser_notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_source_snapshots_case_id ON source_snapshots(case_id);
CREATE INDEX idx_source_snapshots_fetch_job ON source_snapshots(fetch_job_id);
CREATE INDEX idx_source_snapshots_timestamp ON source_snapshots(fetch_timestamp DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- Audit Logs (Comprehensive change tracking)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  entity_type VARCHAR(50),                             -- case, hearing, order, party, advocate
  entity_id UUID,                                      -- ID of changed entity
  event_type VARCHAR(100) NOT NULL,                    -- created, updated, deleted, fetched, verified
  old_value TEXT,
  new_value TEXT,
  source VARCHAR(50),                                  -- ecourts_hc, delhi_hc, manual_upload, api, etc.
  adapter_id VARCHAR(100),
  changed_by UUID,                                     -- User ID (null for automated fetches)
  change_reason TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_case_id ON audit_logs(case_id);
CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_logs_event ON audit_logs(event_type);
CREATE INDEX idx_audit_logs_source ON audit_logs(source);
CREATE INDEX idx_audit_logs_timestamp ON audit_logs(created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- Connected Cases (Track appeals, revisions, transfers between cases)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS connected_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  to_case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  relationship_type VARCHAR(50) NOT NULL,              -- appeal_of, revision_of, transferred_to, transferred_from
  high_court_from_id UUID REFERENCES courts(id) ON DELETE SET NULL,
  high_court_to_id UUID REFERENCES courts(id) ON DELETE SET NULL,
  verified BOOLEAN DEFAULT FALSE,
  verification_date TIMESTAMP,
  verified_by_adapter VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_connected_cases_pair ON connected_cases(from_case_id, to_case_id, relationship_type);
CREATE INDEX idx_connected_cases_from ON connected_cases(from_case_id);
CREATE INDEX idx_connected_cases_to ON connected_cases(to_case_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Enhancements to existing cases table
-- ─────────────────────────────────────────────────────────────────────────────

-- Add new columns to cases table if they don't exist
ALTER TABLE cases ADD COLUMN IF NOT EXISTS court_code VARCHAR(50);
ALTER TABLE cases ADD COLUMN IF NOT EXISTS bench_id UUID REFERENCES court_benches(id) ON DELETE SET NULL;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS case_category VARCHAR(100);
ALTER TABLE cases ADD COLUMN IF NOT EXISTS source_adapter VARCHAR(100);
ALTER TABLE cases ADD COLUMN IF NOT EXISTS data_quality_score INT DEFAULT 0;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS last_fetch_job_id UUID REFERENCES fetch_jobs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_cases_court_code ON cases(court_code);
CREATE INDEX IF NOT EXISTS idx_cases_category ON cases(case_category);
CREATE INDEX IF NOT EXISTS idx_cases_adapter ON cases(source_adapter);

-- ─────────────────────────────────────────────────────────────────────────────
-- Create triggerfor audit logging (simple version)
-- ─────────────────────────────────────────────────────────────────────────────

-- Function to log updates to cases table
CREATE OR REPLACE FUNCTION log_case_update() RETURNS TRIGGER AS $$
BEGIN
  IF (NEW.status IS DISTINCT FROM OLD.status) OR
     (NEW.next_hearing_date IS DISTINCT FROM OLD.next_hearing_date) OR
     (NEW.case_title IS DISTINCT FROM OLD.case_title) THEN
    INSERT INTO audit_logs (
      case_id, entity_type, entity_id, event_type, old_value, new_value, source, created_at
    ) VALUES (
      NEW.id,
      'case',
      NEW.id,
      'updated',
      row_to_json(OLD),
      row_to_json(NEW),
      'system',
      NOW()
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists (avoid errors)
DROP TRIGGER IF NOT EXISTS cases_audit_trigger ON cases;

-- Create trigger (if not already present)
CREATE TRIGGER cases_audit_trigger
  AFTER UPDATE ON cases
  FOR EACH ROW
  EXECUTE FUNCTION log_case_update();

-- ─────────────────────────────────────────────────────────────────────────────
-- Initial Data: Supreme Court & Key Tribunals (to be expanded in Phase 2+)
-- ─────────────────────────────────────────────────────────────────────────────

-- Note: Bulk court data will be loaded via TypeScript courtRegistry.ts
-- This migration creates the schema; data population happens in application code

-- Example: Insert Supreme Court (will be duplicated if run multiple times, so use INSERT...ON CONFLICT)

INSERT INTO courts (code, name, court_type, institution_type, official_website, jurisdiction)
VALUES (
  'supreme_court_india',
  'Supreme Court of India',
  'supreme_court',
  'court',
  'https://www.sci.gov.in/',
  'national'
)
ON CONFLICT (code) DO NOTHING;

INSERT INTO courts (code, name, court_type, institution_type, official_website, jurisdiction)
VALUES (
  'nclt',
  'National Company Law Tribunal',
  'tribunal',
  'tribunal',
  'https://www.nclt.gov.in/',
  'national'
)
ON CONFLICT (code) DO NOTHING;

INSERT INTO courts (code, name, court_type, institution_type, official_website, jurisdiction)
VALUES (
  'itat',
  'Income Tax Appellate Tribunal',
  'tribunal',
  'tribunal',
  'https://www.itat.gov.in/',
  'national'
)
ON CONFLICT (code) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- Migration complete
-- ─────────────────────────────────────────────────────────────────────────────
