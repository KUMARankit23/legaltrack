/**
 * Database Migration Runner
 * Applies all schema migrations in order: schema.sql + phase migrations
 * Usage: npm run migrate
 */
import * as fs from "fs";
import * as path from "path";
import { pool } from "./client";

async function migrate() {
  const client = await pool.connect();
  try {
    console.log("[migrate] Starting database migrations...");

    // Step 0: Enable extensions
    await client.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);
    await client.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);
    console.log("[migrate] Extensions enabled");

    // Step 1: Apply main schema
    const schemaPath = path.join(__dirname, "schema.sql");
    const schemaSql = fs.readFileSync(schemaPath, "utf-8");
    await client.query(schemaSql);
    console.log("[migrate] ✓ schema.sql applied");

    // Step 2: Apply phase migrations
    const migrationDir = path.join(__dirname, "migrations");
    const migrationFiles = [
      "001_create_court_registry.sql",
      "002_phase2_ecourts_adapters.sql",
      "003_phase3_high_courts.sql",
      "004_phase4_tribunals.sql",
      "005_phase5_production.sql",
    ];

    for (const file of migrationFiles) {
      const filePath = path.join(migrationDir, file);
      if (!fs.existsSync(filePath)) {
        console.warn(`[migrate] ⚠ ${file} not found, skipping`);
        continue;
      }
      try {
        const sql = fs.readFileSync(filePath, "utf-8");
        await client.query(sql);
        console.log(`[migrate] ✓ ${file} applied`);
      } catch (err) {
        const msg = (err as Error).message;
        // Ignore "already exists" errors
        if (!msg.includes("already exists") && !msg.includes("duplicate key")) {
          throw err;
        }
        console.log(`[migrate] ℹ ${file} already applied (skipped)`);
      }
    }

    // Step 3: Add any missing columns to existing tables
    const alterStatements = [
      `ALTER TABLE cases ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id) ON DELETE SET NULL`,
      `ALTER TABLE cases ADD COLUMN IF NOT EXISTS source_court_id VARCHAR(100)`,
      `ALTER TABLE cases ADD COLUMN IF NOT EXISTS adapter_used VARCHAR(100)`,
      `ALTER TABLE cases ADD COLUMN IF NOT EXISTS cnr_number TEXT`,
      `ALTER TABLE cases ADD COLUMN IF NOT EXISTS case_type TEXT`,
      `ALTER TABLE cases ADD COLUMN IF NOT EXISTS filing_date DATE`,
      `ALTER TABLE cases ADD COLUMN IF NOT EXISTS source_url TEXT`,
      `ALTER TABLE cases ADD COLUMN IF NOT EXISTS last_fetched_at TIMESTAMPTZ`,
      `ALTER TABLE cases ADD COLUMN IF NOT EXISTS last_adapter_used VARCHAR(100)`,
      `ALTER TABLE cases ADD COLUMN IF NOT EXISTS adapter_error_count INT DEFAULT 0`,
      `ALTER TABLE cases ADD COLUMN IF NOT EXISTS last_adapter_error TEXT`,
      `CREATE INDEX IF NOT EXISTS idx_cases_client_id ON cases (client_id)`,
      `CREATE INDEX IF NOT EXISTS idx_cases_cnr ON cases (cnr_number)`,
      `CREATE INDEX IF NOT EXISTS idx_cases_source_court ON cases (source_court_id)`,
      `CREATE INDEX IF NOT EXISTS idx_cases_adapter ON cases (adapter_used)`,
      `ALTER TABLE hearings ADD COLUMN IF NOT EXISTS outcome TEXT`,
      `ALTER TABLE hearings ADD COLUMN IF NOT EXISTS next_date DATE`,
      `ALTER TABLE hearings ADD COLUMN IF NOT EXISTS notes TEXT`,
      `ALTER TABLE hearings ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'cause_list'`,
      `ALTER TABLE hearings ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()`,
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_hearings_case_date ON hearings (case_id, date)`,
    ];

    for (const stmt of alterStatements) {
      try {
        await client.query(stmt);
      } catch (err) {
        const msg = (err as Error).message;
        if (!msg.includes("already exists") && !msg.includes("duplicate")) {
          console.warn(`[migrate] Warning:`, msg);
        }
      }
    }
    console.log("[migrate] ✓ Schema alterations applied");

    console.log("[migrate] ✅ All migrations completed successfully");
  } catch (err) {
    console.error("[migrate] ❌ Failed:", (err as Error).message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
