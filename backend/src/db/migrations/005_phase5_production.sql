-- Migration: Phase 5 - Production Infrastructure
-- Version: 005
-- Date: 2026-10-10
-- Description: Tables for production operations, monitoring, dashboard, and operational support

-- This migration adds:
-- - Sync metrics and operational dashboards
-- - SLA tracking
-- - Performance monitoring
-- - Operational dashboard data aggregation
-- - Service health metrics

-- ─────────────────────────────────────────────────────────────────────────────
-- Sync Metrics (Track sync job performance)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS sync_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  adapter_id VARCHAR(100) NOT NULL,
  court_id UUID REFERENCES courts(id) ON DELETE CASCADE,
  metric_date DATE NOT NULL,
  total_jobs INT DEFAULT 0,
  successful_jobs INT DEFAULT 0,
  failed_jobs INT DEFAULT 0,
  captcha_jobs INT DEFAULT 0,
  rate_limited_jobs INT DEFAULT 0,
  avg_response_time_ms INT,
  availability_pct DECIMAL(5, 2),
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(adapter_id, court_id, metric_date)
);

CREATE INDEX idx_sync_metrics_adapter ON sync_metrics(adapter_id);
CREATE INDEX idx_sync_metrics_date ON sync_metrics(metric_date DESC);
CREATE INDEX idx_sync_metrics_court ON sync_metrics(court_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- SLA Compliance Tracking
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS sla_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  adapter_id VARCHAR(100) NOT NULL,
  metric_name VARCHAR(100),  -- availability, response_time, success_rate
  target_value DECIMAL(5, 2),
  measurement_period VARCHAR(50) DEFAULT 'daily',  -- daily, weekly, monthly
  warning_threshold DECIMAL(5, 2),
  critical_threshold DECIMAL(5, 2),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sla_breaches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  adapter_id VARCHAR(100) NOT NULL,
  sla_target_id UUID REFERENCES sla_targets(id),
  breach_date DATE,
  breach_severity VARCHAR(50),  -- warning, critical
  metric_value DECIMAL(5, 2),
  target_value DECIMAL(5, 2),
  description TEXT,
  remediation_action TEXT,
  resolved BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_sla_breaches_adapter ON sla_breaches(adapter_id);
CREATE INDEX idx_sla_breaches_severity ON sla_breaches(breach_severity);
CREATE INDEX idx_sla_breaches_resolved ON sla_breaches(resolved);

-- ─────────────────────────────────────────────────────────────────────────────
-- Performance Analytics
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS performance_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  adapter_id VARCHAR(100) NOT NULL,
  case_id UUID REFERENCES cases(id) ON DELETE CASCADE,
  fetch_duration_ms INT,
  parse_duration_ms INT,
  total_duration_ms INT,
  data_quality_score INT,
  fields_populated INT,
  fields_total INT,
  error_type VARCHAR(100),
  recorded_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_performance_adapter ON performance_analytics(adapter_id);
CREATE INDEX idx_performance_quality ON performance_analytics(data_quality_score);
CREATE INDEX idx_performance_timestamp ON performance_analytics(recorded_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- Operational Dashboard Data Aggregation
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS dashboard_aggregates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aggregate_date DATE NOT NULL,
  aggregate_type VARCHAR(50),  -- hourly, daily, weekly
  
  -- Global stats
  total_cases_tracked INT DEFAULT 0,
  new_cases_24h INT DEFAULT 0,
  cases_with_recent_updates INT DEFAULT 0,
  
  -- Adapter stats
  total_adapters INT DEFAULT 0,
  adapters_available INT DEFAULT 0,
  adapters_with_issues INT DEFAULT 0,
  
  -- Court coverage
  courts_indexed INT DEFAULT 0,
  high_courts_indexed INT DEFAULT 0,
  district_courts_indexed INT DEFAULT 0,
  tribunals_indexed INT DEFAULT 0,
  
  -- Sync performance
  total_sync_jobs INT DEFAULT 0,
  successful_syncs INT DEFAULT 0,
  failed_syncs INT DEFAULT 0,
  avg_sync_duration_ms INT DEFAULT 0,
  
  -- Data quality
  avg_data_quality_score DECIMAL(5, 2),
  cases_with_parties INT DEFAULT 0,
  cases_with_hearings INT DEFAULT 0,
  cases_with_orders INT DEFAULT 0,
  
  -- User activity
  unique_users INT DEFAULT 0,
  api_calls INT DEFAULT 0,
  
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(aggregate_date, aggregate_type)
);

CREATE INDEX idx_dashboard_date ON dashboard_aggregates(aggregate_date DESC);
CREATE INDEX idx_dashboard_type ON dashboard_aggregates(aggregate_type);

-- ─────────────────────────────────────────────────────────────────────────────
-- Monitoring Alerts
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS monitoring_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_type VARCHAR(100),  -- adapter_down, rate_limited, captcha_spike, data_quality, sla_breach
  adapter_id VARCHAR(100),
  court_id UUID REFERENCES courts(id) ON DELETE CASCADE,
  severity VARCHAR(50),  -- info, warning, critical
  message TEXT,
  details JSONB,
  acknowledged BOOLEAN DEFAULT FALSE,
  acknowledged_by UUID,
  acknowledged_at TIMESTAMP,
  resolved BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  resolved_at TIMESTAMP
);

CREATE INDEX idx_monitoring_alerts_type ON monitoring_alerts(alert_type);
CREATE INDEX idx_monitoring_alerts_severity ON monitoring_alerts(severity);
CREATE INDEX idx_monitoring_alerts_resolved ON monitoring_alerts(resolved);
CREATE INDEX idx_monitoring_alerts_created ON monitoring_alerts(created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- Service Health Status
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS service_health_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_name VARCHAR(100) NOT NULL,  -- ecourts_hc, ecourts_district, nclt, etc.
  status VARCHAR(50),  -- healthy, degraded, down
  status_message TEXT,
  last_check_time TIMESTAMP,
  next_check_time TIMESTAMP,
  uptime_pct_24h DECIMAL(5, 2),
  uptime_pct_7d DECIMAL(5, 2),
  uptime_pct_30d DECIMAL(5, 2),
  last_failure_time TIMESTAMP,
  failure_count_24h INT DEFAULT 0,
  avg_response_time_ms INT,
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(service_name)
);

CREATE INDEX idx_service_health_status ON service_health_status(status);
CREATE INDEX idx_service_health_updated ON service_health_status(updated_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- Enhancement to existing tables for production support
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE cases ADD COLUMN IF NOT EXISTS data_completeness_pct INT DEFAULT 0;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS last_successful_sync TIMESTAMP;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS sync_status VARCHAR(50) DEFAULT 'never_synced';

CREATE INDEX IF NOT EXISTS idx_cases_sync_status ON cases(sync_status);
CREATE INDEX IF NOT EXISTS idx_cases_last_sync ON cases(last_successful_sync DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- Initialize SLA targets for production
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO sla_targets (adapter_id, metric_name, target_value, warning_threshold, critical_threshold)
VALUES
  ('ecourts_hc', 'availability', 95.0, 90.0, 85.0),
  ('ecourts_hc', 'response_time', 5000.0, 7000.0, 10000.0),
  ('ecourts_hc', 'success_rate', 90.0, 80.0, 70.0),
  ('ecourts_district', 'availability', 90.0, 85.0, 80.0),
  ('ecourts_district', 'response_time', 7000.0, 10000.0, 15000.0),
  ('bombay_hc', 'availability', 95.0, 90.0, 85.0),
  ('madras_hc', 'availability', 95.0, 90.0, 85.0),
  ('nclt', 'availability', 98.0, 95.0, 90.0),
  ('itat', 'availability', 95.0, 90.0, 85.0),
  ('consumer_commission', 'availability', 90.0, 85.0, 80.0)
ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- Initialize service health records
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO service_health_status (service_name, status, status_message, uptime_pct_24h, uptime_pct_7d, uptime_pct_30d)
VALUES
  ('ecourts_hc', 'unknown', 'Service status not yet checked', 0, 0, 0),
  ('ecourts_district', 'unknown', 'Service status not yet checked', 0, 0, 0),
  ('bombay_hc', 'unknown', 'Service status not yet checked', 0, 0, 0),
  ('madras_hc', 'unknown', 'Service status not yet checked', 0, 0, 0),
  ('nclt', 'unknown', 'Service status not yet checked', 0, 0, 0),
  ('itat', 'unknown', 'Service status not yet checked', 0, 0, 0),
  ('drt', 'unknown', 'Service status not yet checked', 0, 0, 0),
  ('ngt', 'unknown', 'Service status not yet checked', 0, 0, 0),
  ('consumer_commission', 'unknown', 'Service status not yet checked', 0, 0, 0)
ON CONFLICT (service_name) DO UPDATE SET updated_at = NOW();

-- ─────────────────────────────────────────────────────────────────────────────
-- Migration complete
-- ─────────────────────────────────────────────────────────────────────────────
