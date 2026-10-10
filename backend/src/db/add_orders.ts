/**
 * Migration: add orders table for PDF storage and text extraction.
 * Run once: node --require tsx/cjs src/db/add_orders.ts
 */
import { pool } from "./client";

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        case_id     UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
        order_date  DATE NOT NULL,
        order_type  TEXT DEFAULT 'Order',   -- Order | Judgment | Notice | Interim
        court_no    TEXT,
        bench       TEXT,
        pdf_url     TEXT,                   -- original Delhi HC URL
        local_path  TEXT,                   -- saved file path under /uploads
        file_size   INT,
        text_content TEXT,                  -- extracted text from pdf-parse
        source      TEXT DEFAULT 'dhc_history',
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_case_date ON orders (case_id, order_date)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_orders_case_id ON orders (case_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_orders_date ON orders (order_date DESC)`);

    // Full-text search on order text
    await client.query(`CREATE INDEX IF NOT EXISTS idx_orders_text ON orders USING GIN (to_tsvector('english', COALESCE(text_content,'')))`);

    console.log("[migrate] orders table created/verified");
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch(e => { console.error(e.message); process.exit(1); });
