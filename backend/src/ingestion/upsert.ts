/**
 * Step 4: Upsert parsed cases into Postgres.
 *
 * Idempotent on case_no — re-running the same data updates rather than duplicates.
 * Uses a DB transaction so a partial failure doesn't leave orphaned party rows.
 */
import { PoolClient } from "pg";
import { pool } from "../db/client";
import { ParsedCase } from "./parser";

export interface UpsertResult {
  inserted: number;
  updated: number;
  errors: number;
}

/**
 * Upsert a single ParsedCase into the DB within a provided client (transaction).
 */
async function upsertOneCase(
  client: PoolClient,
  parsed: ParsedCase
): Promise<"inserted" | "updated"> {
  // Upsert the cases row
  const caseResult = await client.query(
    `
    INSERT INTO cases (case_no, case_year, case_title, status, next_hearing_date, last_hearing_date)
    VALUES ($1, $2, $3, 'Pending', $4, NULL)
    ON CONFLICT (case_no) DO UPDATE
      SET case_year         = EXCLUDED.case_year,
          case_title        = COALESCE(EXCLUDED.case_title, cases.case_title),
          last_hearing_date = CASE
            WHEN cases.next_hearing_date IS NOT NULL
              AND EXCLUDED.next_hearing_date IS NOT NULL
              AND EXCLUDED.next_hearing_date != cases.next_hearing_date
            THEN cases.next_hearing_date   -- old hearing becomes last_hearing
            ELSE cases.last_hearing_date
          END,
          next_hearing_date = EXCLUDED.next_hearing_date,
          updated_at        = NOW()
    RETURNING id, xmax  -- xmax=0 means INSERT, xmax>0 means UPDATE
    `,
    [
      parsed.case_no,
      parsed.case_year,
      buildCaseTitle(parsed),
      parsed.next_hearing_date ?? null,
    ]
  );

  const row = caseResult.rows[0];
  const caseId: string = row.id;
  const wasInsert = row.xmax === "0";

  // Upsert parties — delete existing and re-insert so we stay in sync
  // (cause lists may correct a party name spelling)
  if (parsed.petitioner || parsed.respondent) {
    await client.query(`DELETE FROM parties WHERE case_id = $1`, [caseId]);

    if (parsed.petitioner) {
      await client.query(
        `INSERT INTO parties (case_id, name, role) VALUES ($1, $2, 'petitioner')`,
        [caseId, parsed.petitioner]
      );
    }
    if (parsed.respondent) {
      await client.query(
        `INSERT INTO parties (case_id, name, role) VALUES ($1, $2, 'respondent')`,
        [caseId, parsed.respondent]
      );
    }
  }

  // Upsert hearing: one row per (case_id, date)
  if (parsed.next_hearing_date) {
    await client.query(
      `
      INSERT INTO hearings (case_id, date, purpose)
      VALUES ($1, $2, 'Hearing (from cause list)')
      ON CONFLICT DO NOTHING
      `,
      [caseId, parsed.next_hearing_date]
    );
  }

  return wasInsert ? "inserted" : "updated";
}

function buildCaseTitle(parsed: ParsedCase): string {
  const parts = [parsed.petitioner, parsed.respondent].filter(Boolean);
  return parts.length > 0 ? parts.join(" v. ") : parsed.case_no;
}

/**
 * Upsert a batch of ParsedCases, wrapping each in its own transaction so one
 * bad record doesn't roll back the entire batch.
 */
export async function upsertCases(parsedCases: ParsedCase[]): Promise<UpsertResult> {
  const result: UpsertResult = { inserted: 0, updated: 0, errors: 0 };

  for (const parsed of parsedCases) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const outcome = await upsertOneCase(client, parsed);
      await client.query("COMMIT");
      result[outcome]++;
    } catch (err) {
      await client.query("ROLLBACK");
      result.errors++;
      console.error(
        `[upsert] Error on case_no="${parsed.case_no}":`,
        (err as Error).message
      );
    } finally {
      client.release();
    }
  }

  return result;
}
