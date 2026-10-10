/**
 * Monitoring Service (Phase 5 Production)
 * 
 * Provides operational dashboard data, health checks, and performance monitoring
 * for the nationwide LexFlow court integration platform.
 * 
 * Tracks:
 * - Adapter availability and performance
 * - SLA compliance
 * - Data quality metrics
 * - Court coverage
 * - Sync job metrics
 * - Alert generation
 */

import { pool } from "../db/client";
import { syncJobManager } from "../ingestion/syncJobManager";

/**
 * Dashboard Summary
 */
export async function getDashboardSummary(period: "hourly" | "daily" | "weekly" = "daily"): Promise<{
  date: string;
  total_cases: number;
  new_cases_24h: number;
  courts_covered: { high_courts: number; districts: number; tribunals: number };
  adapter_status: Array<{
    adapter_id: string;
    status: string;
    availability_pct: number;
    sync_jobs_24h: number;
    success_rate: number;
  }>;
  data_quality: { avg_score: number; with_parties: number; with_hearings: number; with_orders: number };
  queue_status: { active: number; queued: number };
}> {
  const today = new Date().toISOString().split("T")[0];

  // Get total cases
  const totalCases = await pool.query("SELECT COUNT(*) as count FROM cases");
  const total = totalCases.rows[0].count || 0;

  // Get new cases in 24h
  const newCases = await pool.query(
    "SELECT COUNT(*) as count FROM cases WHERE created_at >= NOW() - INTERVAL '24 hours'"
  );
  const new24h = newCases.rows[0].count || 0;

  // Get court coverage
  const courts = await pool.query(
    `SELECT
      COUNT(CASE WHEN court_type = 'high_court' THEN 1 END) as hc,
      COUNT(CASE WHEN court_type = 'district' THEN 1 END) as dc,
      COUNT(CASE WHEN court_type = 'tribunal' THEN 1 END) as trib
    FROM courts`
  );
  const courtData = courts.rows[0];

  // Get adapter metrics
  const adapters = await pool.query(
    `SELECT adapter_id,
      COALESCE(uptime_pct_24h, 0) as availability,
      (SELECT COUNT(*) FROM fetch_jobs WHERE adapter_id = $1 AND DATE(created_at) = CURRENT_DATE) as jobs_24h,
      ROUND(
        (SELECT COUNT(*) FILTER (WHERE status = 'success') FROM fetch_jobs WHERE adapter_id = $1 AND DATE(created_at) = CURRENT_DATE)::numeric /
        NULLIF(COUNT(*) FILTER (WHERE status IN ('success', 'failed')), 0) * 100, 2
      ) as success_rate
    FROM service_health_status`,
    []
  );

  const adapterStatus = await Promise.all(
    (await pool.query("SELECT DISTINCT adapter_id FROM court_sources")).rows.map(async (row) => {
      const health = await pool.query(
        "SELECT status, uptime_pct_24h FROM service_health_status WHERE service_name = $1",
        [row.adapter_id]
      );
      const jobs = await pool.query(
        `SELECT COUNT(*) as count,
          SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success
        FROM fetch_jobs
        WHERE adapter_id = $1 AND created_at >= NOW() - INTERVAL '24 hours'`,
        [row.adapter_id]
      );

      const jobsCount = parseInt(jobs.rows[0].count, 10) || 0;
      const successCount = parseInt(jobs.rows[0].success, 10) || 0;
      const successRate = jobsCount > 0 ? (successCount / jobsCount) * 100 : 0;

      return {
        adapter_id: row.adapter_id,
        status: health.rows[0]?.status || "unknown",
        availability_pct: parseFloat(health.rows[0]?.uptime_pct_24h || "0"),
        sync_jobs_24h: jobsCount,
        success_rate: Math.round(successRate * 100) / 100,
      };
    })
  );

  // Get data quality metrics
  const quality = await pool.query(`
    SELECT
      ROUND(AVG(data_quality_score), 2) as avg_score,
      COUNT(CASE WHEN parties IS NOT NULL THEN 1 END) as with_parties,
      COUNT(CASE WHEN (SELECT COUNT(*) FROM hearings h WHERE h.case_id = cases.id) > 0 THEN 1 END) as with_hearings,
      COUNT(CASE WHEN (SELECT COUNT(*) FROM orders o WHERE o.case_id = cases.id) > 0 THEN 1 END) as with_orders
    FROM cases
  `);
  const qualityData = quality.rows[0];

  const queue = syncJobManager.getQueueStatus();

  return {
    date: today,
    total_cases: total,
    new_cases_24h: new24h,
    courts_covered: {
      high_courts: parseInt(courtData.hc, 10),
      districts: parseInt(courtData.dc, 10),
      tribunals: parseInt(courtData.trib, 10),
    },
    adapter_status: adapterStatus,
    data_quality: {
      avg_score: parseFloat(qualityData.avg_score) || 0,
      with_parties: parseInt(qualityData.with_parties, 10) || 0,
      with_hearings: parseInt(qualityData.with_hearings, 10) || 0,
      with_orders: parseInt(qualityData.with_orders, 10) || 0,
    },
    queue_status: queue,
  };
}

/**
 * Get adapter health report
 */
export async function getAdapterHealthReport(adapter_id?: string): Promise<
  Array<{
    adapter_id: string;
    status: string;
    availability_24h: number;
    availability_7d: number;
    availability_30d: number;
    last_check: string;
    failure_count_24h: number;
    avg_response_time_ms: number;
    sla_status: string;
    alerts: number;
  }>
> {
  let query = `
    SELECT
      service_name as adapter_id,
      status,
      uptime_pct_24h,
      uptime_pct_7d,
      uptime_pct_30d,
      last_check_time,
      failure_count_24h,
      avg_response_time_ms,
      (SELECT COUNT(*) FROM monitoring_alerts WHERE adapter_id = service_health_status.service_name AND resolved = false) as alert_count
    FROM service_health_status
  `;

  if (adapter_id) {
    query += ` WHERE service_name = $1`;
  }

  query += ` ORDER BY last_check_time DESC`;

  const result = adapter_id
    ? await pool.query(query, [adapter_id])
    : await pool.query(query);

  return result.rows.map((row) => {
    // Determine SLA status
    let slaStatus = "compliant";
    if (row.uptime_pct_24h < 85) {
      slaStatus = "critical";
    } else if (row.uptime_pct_24h < 90) {
      slaStatus = "warning";
    }

    return {
      adapter_id: row.adapter_id,
      status: row.status,
      availability_24h: parseFloat(row.uptime_pct_24h) || 0,
      availability_7d: parseFloat(row.uptime_pct_7d) || 0,
      availability_30d: parseFloat(row.uptime_pct_30d) || 0,
      last_check: row.last_check_time?.toISOString() || "",
      failure_count_24h: row.failure_count_24h || 0,
      avg_response_time_ms: row.avg_response_time_ms || 0,
      sla_status: slaStatus,
      alerts: row.alert_count || 0,
    };
  });
}

/**
 * Get court coverage report
 */
export async function getCourtCoverageReport(): Promise<{
  total_courts: number;
  courts_by_type: { high_court: number; district: number; tribunal: number; commission: number };
  courts_by_state: Array<{ state_ut: string; count: number }>;
  coverage_pct: number;
  high_courts_with_adapters: Array<{ name: string; adapters: string[] }>;
}> {
  // Total courts
  const total = await pool.query("SELECT COUNT(*) as count FROM courts");
  const totalCount = parseInt(total.rows[0].count, 10);

  // By type
  const byType = await pool.query(`
    SELECT
      COUNT(CASE WHEN court_type = 'high_court' THEN 1 END) as hc,
      COUNT(CASE WHEN court_type = 'district' THEN 1 END) as dc,
      COUNT(CASE WHEN court_type = 'tribunal' THEN 1 END) as trib,
      COUNT(CASE WHEN court_type = 'commission' THEN 1 END) as comm
    FROM courts
  `);
  const typeData = byType.rows[0];

  // By state
  const byState = await pool.query(`
    SELECT state_ut, COUNT(*) as count FROM courts
    WHERE state_ut IS NOT NULL
    GROUP BY state_ut
    ORDER BY count DESC
  `);

  // Coverage with adapters
  const withAdapters = await pool.query(`
    SELECT COUNT(DISTINCT court_id) as count FROM court_sources
  `);
  const coverageCount = parseInt(withAdapters.rows[0].count, 10);
  const coveragePct = Math.round((coverageCount / totalCount) * 100);

  // HCs with adapters
  const hcsWithAdapters = await pool.query(`
    SELECT DISTINCT c.id, c.name, array_agg(DISTINCT cs.adapter_id) as adapters
    FROM courts c
    LEFT JOIN court_sources cs ON c.id = cs.court_id
    WHERE c.court_type = 'high_court'
    GROUP BY c.id, c.name
    ORDER BY c.name
  `);

  return {
    total_courts: totalCount,
    courts_by_type: {
      high_court: parseInt(typeData.hc, 10),
      district: parseInt(typeData.dc, 10),
      tribunal: parseInt(typeData.trib, 10),
      commission: parseInt(typeData.comm, 10),
    },
    courts_by_state: byState.rows.map((row) => ({
      state_ut: row.state_ut,
      count: parseInt(row.count, 10),
    })),
    coverage_pct: coveragePct,
    high_courts_with_adapters: hcsWithAdapters.rows.map((row) => ({
      name: row.name,
      adapters: row.adapters || [],
    })),
  };
}

/**
 * Get recent alerts
 */
export async function getRecentAlerts(limit: number = 20): Promise<
  Array<{
    alert_id: string;
    type: string;
    severity: string;
    adapter_id: string;
    message: string;
    created_at: string;
    acknowledged: boolean;
  }>
> {
  const result = await pool.query(
    `SELECT
      id, alert_type, severity, adapter_id, message, created_at, acknowledged
    FROM monitoring_alerts
    ORDER BY created_at DESC
    LIMIT $1`,
    [limit]
  );

  return result.rows.map((row) => ({
    alert_id: row.id,
    type: row.alert_type,
    severity: row.severity,
    adapter_id: row.adapter_id || "system",
    message: row.message,
    created_at: row.created_at.toISOString(),
    acknowledged: row.acknowledged,
  }));
}

/**
 * Get data quality report by adapter
 */
export async function getDataQualityReport(adapter_id?: string): Promise<
  Array<{
    adapter_id: string;
    total_cases: number;
    avg_quality_score: number;
    cases_with_all_fields: number;
    cases_with_parties: number;
    cases_with_status: number;
    cases_with_dates: number;
  }>
> {
  let query = `
    SELECT
      COALESCE(c.source_adapter, 'unknown') as adapter_id,
      COUNT(*) as total_cases,
      ROUND(AVG(COALESCE(c.data_quality_score, 0)), 2) as avg_quality,
      COUNT(CASE WHEN c.case_title IS NOT NULL AND (SELECT COUNT(*) FROM parties WHERE case_id = c.id) > 0 
        AND c.status IS NOT NULL AND c.filing_date IS NOT NULL THEN 1 END) as all_fields,
      COUNT(CASE WHEN (SELECT COUNT(*) FROM parties WHERE case_id = c.id) > 0 THEN 1 END) as with_parties,
      COUNT(CASE WHEN c.status IS NOT NULL THEN 1 END) as with_status,
      COUNT(CASE WHEN c.filing_date IS NOT NULL OR c.next_hearing_date IS NOT NULL THEN 1 END) as with_dates
    FROM cases c
  `;

  if (adapter_id) {
    query += ` WHERE c.source_adapter = $1`;
  }

  query += ` GROUP BY c.source_adapter ORDER BY total_cases DESC`;

  const result = adapter_id ? await pool.query(query, [adapter_id]) : await pool.query(query);

  return result.rows.map((row) => ({
    adapter_id: row.adapter_id,
    total_cases: parseInt(row.total_cases, 10),
    avg_quality_score: parseFloat(row.avg_quality) || 0,
    cases_with_all_fields: parseInt(row.all_fields, 10),
    cases_with_parties: parseInt(row.with_parties, 10),
    cases_with_status: parseInt(row.with_status, 10),
    cases_with_dates: parseInt(row.with_dates, 10),
  }));
}

/**
 * Get sync job statistics
 */
export async function getSyncJobStats(hours: number = 24): Promise<{
  period_hours: number;
  total_jobs: number;
  successful_jobs: number;
  failed_jobs: number;
  captcha_jobs: number;
  rate_limited_jobs: number;
  avg_duration_ms: number;
  success_rate_pct: number;
}> {
  const result = await pool.query(`
    SELECT
      COUNT(*) as total,
      COUNT(CASE WHEN status = 'success' THEN 1 END) as successful,
      COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed,
      COUNT(CASE WHEN status = 'captcha' THEN 1 END) as captcha,
      COUNT(CASE WHEN status = 'rate_limited' THEN 1 END) as rate_limited,
      ROUND(AVG(EXTRACT(EPOCH FROM (updated_at - created_at)) * 1000), 2) as avg_duration_ms
    FROM fetch_jobs
    WHERE created_at >= NOW() - INTERVAL '${hours} hours'
  `);

  const row = result.rows[0];
  const total = parseInt(row.total, 10) || 0;
  const successful = parseInt(row.successful, 10) || 0;
  const successRate = total > 0 ? (successful / total) * 100 : 0;

  return {
    period_hours: hours,
    total_jobs: total,
    successful_jobs: successful,
    failed_jobs: parseInt(row.failed, 10) || 0,
    captcha_jobs: parseInt(row.captcha, 10) || 0,
    rate_limited_jobs: parseInt(row.rate_limited, 10) || 0,
    avg_duration_ms: parseFloat(row.avg_duration_ms) || 0,
    success_rate_pct: Math.round(successRate * 100) / 100,
  };
}
