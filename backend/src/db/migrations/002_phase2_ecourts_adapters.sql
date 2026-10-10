-- Migration: Phase 2 - eCourts Adapters Schema
-- Version: 002
-- Date: 2026-10-10
-- Description: Creates tables to support eCourts High Court and District Court adapters

-- This migration extends the court registry with:
-- - Court data source configurations for adapters
-- - Session tracking for adapter connections
-- - CAPTCHA handling records
-- - Adapter verification logs

-- ─────────────────────────────────────────────────────────────────────────────
-- Adapter Sessions (Track active sessions per adapter)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS adapter_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  adapter_id VARCHAR(100) NOT NULL,
  court_id UUID REFERENCES courts(id) ON DELETE CASCADE,
  session_token TEXT,
  session_data JSONB,
  status VARCHAR(50) DEFAULT 'active',  -- active, expired, failed
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP,
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_adapter_sessions_adapter ON adapter_sessions(adapter_id);
CREATE INDEX idx_adapter_sessions_court ON adapter_sessions(court_id);
CREATE INDEX idx_adapter_sessions_status ON adapter_sessions(status);
CREATE INDEX idx_adapter_sessions_expires ON adapter_sessions(expires_at);

-- ─────────────────────────────────────────────────────────────────────────────
-- CAPTCHA Challenges (Track CAPTCHA requirements and solutions)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS captcha_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  adapter_id VARCHAR(100) NOT NULL,
  case_id UUID REFERENCES cases(id) ON DELETE CASCADE,
  challenge_url TEXT,
  challenge_type VARCHAR(50),  -- image, text, recaptcha
  challenge_data BYTEA,
  solution TEXT,
  manual_solution BOOLEAN DEFAULT FALSE,
  solved_by_user VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW(),
  solved_at TIMESTAMP
);

CREATE INDEX idx_captcha_challenges_adapter ON captcha_challenges(adapter_id);
CREATE INDEX idx_captcha_challenges_case ON captcha_challenges(case_id);
CREATE INDEX idx_captcha_challenges_solved ON captcha_challenges(solved_at);

-- ─────────────────────────────────────────────────────────────────────────────
-- Adapter Verification Logs (Track adapter health)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS adapter_verification_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  adapter_id VARCHAR(100) NOT NULL,
  court_id UUID REFERENCES courts(id) ON DELETE CASCADE,
  test_case_number VARCHAR(100),
  test_result VARCHAR(50),  -- success, timeout, captcha, error
  response_time_ms INT,
  error_message TEXT,
  verified_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_adapter_verification_adapter ON adapter_verification_logs(adapter_id);
CREATE INDEX idx_adapter_verification_court ON adapter_verification_logs(court_id);
CREATE INDEX idx_adapter_verification_result ON adapter_verification_logs(test_result);

-- ─────────────────────────────────────────────────────────────────────────────
-- Rate Limit Tracking (Per-adapter rate limiting)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS adapter_rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  adapter_id VARCHAR(100) NOT NULL,
  court_id UUID REFERENCES courts(id) ON DELETE CASCADE,
  requests_this_hour INT DEFAULT 0,
  requests_limit INT DEFAULT 100,
  rate_limit_reset_at TIMESTAMP,
  backoff_until TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(adapter_id, court_id)
);

CREATE INDEX idx_adapter_rate_limits_adapter ON adapter_rate_limits(adapter_id);
CREATE INDEX idx_adapter_rate_limits_backoff ON adapter_rate_limits(backoff_until);

-- ─────────────────────────────────────────────────────────────────────────────
-- Enhanced cases table columns for adapter tracking
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE cases ADD COLUMN IF NOT EXISTS last_adapter_used VARCHAR(100);
ALTER TABLE cases ADD COLUMN IF NOT EXISTS adapter_error_count INT DEFAULT 0;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS last_adapter_error TEXT;

CREATE INDEX IF NOT EXISTS idx_cases_last_adapter ON cases(last_adapter_used);

-- ─────────────────────────────────────────────────────────────────────────────
-- Migration complete
-- ─────────────────────────────────────────────────────────────────────────────
