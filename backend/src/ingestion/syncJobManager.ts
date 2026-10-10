/**
 * Sync Job Manager (Phase 5 Production)
 * 
 * Manages background fetch jobs across all court adapters:
 * - Queue management (in-process & persistent)
 * - Retry logic with exponential backoff
 * - Rate limiting and concurrency control
 * - Error tracking and recovery
 * - Audit logging of fetch operations
 * 
 * This service coordinates all court data fetches for LexFlow nationwide coverage.
 */

import { pool } from "../db/client";
import { ICourtSourceAdapter, NormalizedCaseDetails } from "../adapters/adapter.interface";
import { selectAdapter, initializeAdapters, getAvailableAdapters } from "../adapters/adapterDispatcher";

interface FetchJobConfig {
  case_id: string;
  case_number: string;
  court_id: string;
  adapter_id: string;
  priority: "high" | "normal" | "low";
  max_retries: number;
  timeout_ms: number;
}

interface FetchJobResult {
  status: "success" | "failed" | "captcha" | "rate_limited";
  case_id: string;
  data?: NormalizedCaseDetails;
  error?: string;
  retry_after_seconds?: number;
  attempts: number;
}

/**
 * Sync Job Manager
 * 
 * Orchestrates fetch jobs with:
 * - In-memory queue for active jobs
 * - Database persistence for retry tracking
 * - Adapter selection and routing
 * - Rate limiting and backoff
 * - Error recovery
 */
export class SyncJobManager {
  private activeJobs: Map<string, FetchJobConfig> = new Map();
  private jobQueue: FetchJobConfig[] = [];
  private maxConcurrentJobs = 5;
  private adapterMap: Map<string, ICourtSourceAdapter>;

  constructor() {
    // Initialize adapter map with ALL available adapters
    initializeAdapters();
    const allAdapters = getAvailableAdapters();
    this.adapterMap = allAdapters;

    // Start job processor
    this.startJobProcessor();
  }

  /**
   * Submit a new fetch job
   */
  async submitJob(
    case_id: string,
    case_number: string,
    court_id: string,
    adapter_id: string = "auto"
  ): Promise<void> {
    // Auto-detect adapter if not specified
    let resolved_adapter_id = adapter_id;
    if (adapter_id === "auto") {
      resolved_adapter_id = await this.detectAdapter(court_id);
    }

    const job: FetchJobConfig = {
      case_id,
      case_number,
      court_id,
      adapter_id: resolved_adapter_id,
      priority: "normal",
      max_retries: 3,
      timeout_ms: 30_000,
    };

    // Insert into database for persistence
    await pool.query(
      `INSERT INTO fetch_jobs (case_id, adapter_id, status, attempts, created_at, updated_at)
       VALUES ($1, $2, 'pending', 0, NOW(), NOW())
       ON CONFLICT (case_id) DO UPDATE SET
         status = CASE WHEN fetch_jobs.status IN ('success') THEN fetch_jobs.status ELSE 'pending' END,
         updated_at = NOW()
       RETURNING id`,
      [case_id, resolved_adapter_id]
    );

    // Add to queue
    this.jobQueue.push(job);
    console.log(
      `[sync] Job queued: ${case_number} via ${resolved_adapter_id}`
    );
  }

  /**
   * Process job queue
   */
  private async startJobProcessor(): Promise<void> {
    setInterval(async () => {
      try {
        await this.processQueue();
      } catch (err) {
        console.error(`[sync] Job processor error: ${(err as Error).message}`);
      }
    }, 5000); // Check every 5 seconds
  }

  /**
   * Process queued jobs
   */
  private async processQueue(): Promise<void> {
    while (
      this.jobQueue.length > 0 &&
      this.activeJobs.size < this.maxConcurrentJobs
    ) {
      const job = this.jobQueue.shift();
      if (!job) break;

      this.activeJobs.set(job.case_id, job);

      // Process without awaiting (background job)
      this.processJob(job).finally(() => {
        this.activeJobs.delete(job.case_id);
      });
    }
  }

  /**
   * Process a single job
   */
  private async processJob(job: FetchJobConfig): Promise<FetchJobResult> {
    const adapter = this.adapterMap.get(job.adapter_id);
    if (!adapter) {
      return {
        status: "failed",
        case_id: job.case_id,
        error: `No adapter found for ${job.adapter_id}`,
        attempts: 0,
      };
    }

    let attempts = 0;

    try {
      // Get job record from DB
      const jobRecord = await pool.query(
        "SELECT attempts FROM fetch_jobs WHERE case_id = $1",
        [job.case_id]
      );

      if (jobRecord.rows.length === 0) {
        return {
          status: "failed",
          case_id: job.case_id,
          error: "Job not found in database",
          attempts: 0,
        };
      }

      attempts = (jobRecord.rows[0].attempts || 0) + 1;

      if (attempts > job.max_retries) {
        await pool.query(
          `UPDATE fetch_jobs SET status = 'failed', attempts = $1, updated_at = NOW()
           WHERE case_id = $2`,
          [attempts, job.case_id]
        );

        return {
          status: "failed",
          case_id: job.case_id,
          error: "Max retries exceeded",
          attempts,
        };
      }

      // Update job status to running
      await pool.query(
        `UPDATE fetch_jobs SET status = 'running', last_attempted_at = NOW(), attempts = $1
         WHERE case_id = $2`,
        [attempts, job.case_id]
      );

      // Fetch case details via adapter
      const data = await adapter.getCaseDetails(
        job.case_number,
        job.court_id
      );

      // Upsert case data
      await this.upsertCaseData(job.case_id, data);

      // Mark job as success
      await pool.query(
        `UPDATE fetch_jobs SET
         status = 'success',
         result_summary = $1,
         attempts = $2,
         updated_at = NOW()
         WHERE case_id = $3`,
        [
          `Successfully fetched: ${data.case_number}`,
          attempts,
          job.case_id,
        ]
      );

      // Log audit event
      await pool.query(
        `INSERT INTO audit_logs (case_id, event_type, source, adapter_id, new_value, created_at)
         VALUES ($1, 'fetched', $2, $3, $4, NOW())`,
        [
          job.case_id,
          "sync_job",
          job.adapter_id,
          JSON.stringify({
            status: data.status,
            parties: data.parties.length,
            hearings: data.hearing_history.length,
            orders: data.orders.length,
          }),
        ]
      );

      console.log(
        `[sync] ✓ Job completed: ${job.case_number} via ${job.adapter_id}`
      );

      return {
        status: "success",
        case_id: job.case_id,
        data,
        attempts,
      };
    } catch (err) {
      const errMsg = (err as Error).message;

      // Handle CAPTCHA
      if (errMsg.includes("CAPTCHA") || errMsg.includes("captcha")) {
        await pool.query(
          `UPDATE fetch_jobs
           SET status = 'captcha', error_message = $1, updated_at = NOW()
           WHERE case_id = $2`,
          [errMsg, job.case_id]
        );

        console.warn(`[sync] CAPTCHA required for ${job.case_id}`);
        return {
          status: "captcha",
          case_id: job.case_id,
          error: errMsg,
          attempts: (await pool.query("SELECT attempts FROM fetch_jobs WHERE case_id = $1", [job.case_id])).rows[0]?.attempts || 0,
        };
      }

      // Handle rate limiting
      if (errMsg.includes("rate") || errMsg.includes("429")) {
        const retryAfter = parseInt(
          errMsg.match(/\d+/)?.[0] || "60",
          10
        );

        await pool.query(
          `UPDATE fetch_jobs
           SET status = 'rate_limited', next_retry_at = NOW() + INTERVAL '${retryAfter} seconds',
               error_message = $1, updated_at = NOW()
           WHERE case_id = $2`,
          [errMsg, job.case_id]
        );

        console.warn(
          `[sync] Rate limited for ${job.case_id}, retry in ${retryAfter}s`
        );

        // Re-queue job after delay
        setTimeout(() => {
          this.jobQueue.push(job);
        }, retryAfter * 1000);

        return {
          status: "rate_limited",
          case_id: job.case_id,
          error: errMsg,
          retry_after_seconds: retryAfter,
          attempts: (await pool.query("SELECT attempts FROM fetch_jobs WHERE case_id = $1", [job.case_id])).rows[0]?.attempts || 0,
        };
      }

      // Generic failure
      const nextRetry = Math.min(
        300,
        Math.pow(2, attempts - 1) * 30
      );

      await pool.query(
        `UPDATE fetch_jobs
         SET status = 'failed', next_retry_at = NOW() + INTERVAL '${nextRetry} seconds',
             error_message = $1, updated_at = NOW()
         WHERE case_id = $2`,
        [errMsg.slice(0, 500), job.case_id]
      );

      console.error(
        `[sync] Job failed for ${job.case_id}: ${errMsg} (will retry in ${nextRetry}s)`
      );

      // Re-queue for retry if attempts < max
      if (attempts < job.max_retries) {
        setTimeout(() => {
          this.jobQueue.push(job);
        }, nextRetry * 1000);
      }

      return {
        status: "failed",
        case_id: job.case_id,
        error: errMsg,
        attempts,
      };
    }
  }

  /**
   * Upsert case data into database
   */
  private async upsertCaseData(
    case_id: string,
    data: NormalizedCaseDetails
  ): Promise<void> {
    // Update case record
    await pool.query(
      `UPDATE cases SET
       case_title = COALESCE($1, case_title),
       status = COALESCE($2, status),
       filing_date = COALESCE($3, filing_date),
       next_hearing_date = COALESCE($4, next_hearing_date),
       cnr_number = COALESCE($5, cnr_number),
       data_quality_score = $6,
       last_fetch_job_id = (SELECT id FROM fetch_jobs WHERE case_id = $7 LIMIT 1),
       updated_at = NOW()
       WHERE id = $7`,
      [
        data.case_title,
        data.status,
        data.filing_date,
        data.next_hearing_date,
        data.cnr,
        data.data_quality_score || 0,
        case_id,
      ]
    );

    // Upsert parties
    if (data.parties.length > 0) {
      await pool.query("DELETE FROM parties WHERE case_id = $1", [case_id]);
      for (const party of data.parties) {
        await pool.query(
          `INSERT INTO parties (case_id, name, role)
           VALUES ($1, $2, $3)`,
          [case_id, party.name, party.role]
        );
      }
    }

    // Upsert hearings
    for (const hearing of data.hearing_history) {
      await pool.query(
        `INSERT INTO hearings (case_id, date, purpose, source)
         VALUES ($1, $2, $3, 'sync_job')
         ON CONFLICT (case_id, date) DO UPDATE SET
           purpose = EXCLUDED.purpose,
           updated_at = NOW()`,
        [case_id, hearing.date, hearing.purpose]
      );
    }

    // Upsert orders
    for (const order of data.orders) {
      await pool.query(
        `INSERT INTO orders (case_id, order_date, order_type, pdf_url, source, created_at)
         VALUES ($1, $2, $3, $4, 'sync_job', NOW())
         ON CONFLICT (case_id, order_date, order_type) DO UPDATE SET
           pdf_url = EXCLUDED.pdf_url,
           updated_at = NOW()`,
        [case_id, order.order_date, order.order_type, order.pdf_url || null]
      );
    }

    console.log(`[sync] ✓ Data upserted for case ${case_id}`);
  }

  /**
   * Auto-detect best adapter for a court
   */
  private async detectAdapter(court_id: string): Promise<string> {
    // Try direct adapter selection first using dispatcher
    const adapter = selectAdapter(court_id);
    if (adapter) {
      return adapter.id;
    }
    
    // Fallback: query court registry to map court_id to adapter_id
    try {
      const court = await pool.query(
        "SELECT code FROM courts WHERE id = $1",
        [court_id]
      );

      if (court.rows.length > 0) {
        const code = court.rows[0].code as string;
        const fallbackAdapter = selectAdapter(code);
        if (fallbackAdapter) {
          return fallbackAdapter.id;
        }
      }
    } catch (err) {
      console.warn("[sync] Error querying court registry:", (err as Error).message);
    }

    // Ultimate fallback: use court_id directly and hope it matches an adapter ID
    console.warn(`[sync] No adapter found for court ${court_id}, using court_id as adapter_id`);
    return court_id;
  }

  /**
   * Get job status
   */
  async getJobStatus(case_id: string): Promise<{
    status: string;
    attempts: number;
    error?: string;
    result_summary?: string;
  }> {
    const result = await pool.query(
      `SELECT status, attempts, error_message, result_summary
       FROM fetch_jobs WHERE case_id = $1`,
      [case_id]
    );

    if (result.rows.length === 0) {
      return { status: "not_found", attempts: 0 };
    }

    const row = result.rows[0];
    return {
      status: row.status,
      attempts: row.attempts || 0,
      error: row.error_message || undefined,
      result_summary: row.result_summary || undefined,
    };
  }

  /**
   * Get queue status
   */
  getQueueStatus(): {
    active: number;
    queued: number;
  } {
    return {
      active: this.activeJobs.size,
      queued: this.jobQueue.length,
    };
  }

  /**
   * Get adapter status report
   */
  async getAdapterStatus(): Promise<
    Array<{ adapter_id: string; status: string; timestamp: string }>
  > {
    const statuses = [];

    for (const [adapter_id, adapter] of this.adapterMap) {
      try {
        const status = await adapter.getStatus();
        statuses.push({
          adapter_id,
          status: status.status,
          timestamp: status.last_verified_at,
        });
      } catch (err) {
        statuses.push({
          adapter_id,
          status: "error",
          timestamp: new Date().toISOString(),
        });
      }
    }

    return statuses;
  }
}

// Singleton instance
export const syncJobManager = new SyncJobManager();
