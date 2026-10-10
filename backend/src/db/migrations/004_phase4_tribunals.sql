-- Migration: Phase 4 - Tribunals & Commissions
-- Version: 004
-- Date: 2026-10-10
-- Description: Initialize tribunals and commission registries with specialized adapters

-- This migration populates:
-- - NCLT (Company Law, Insolvency)
-- - ITAT (Tax Appeals)
-- - DRT (Debt Recovery)
-- - NGT (Environmental)
-- - Consumer Commissions
-- - Other tribunals as needed

-- ─────────────────────────────────────────────────────────────────────────────
-- Insert Major Tribunals
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO courts (code, name, court_type, institution_type, official_website, jurisdiction, notes)
VALUES
  ('nclt', 'National Company Law Tribunal', 'tribunal', 'tribunal', 'https://www.nclt.gov.in/', 'national', 'Company law, insolvency proceedings'),
  ('nclat', 'National Company Law Appellate Tribunal', 'tribunal', 'tribunal', 'https://www.nclat.nic.in/', 'national', 'Appeals against NCLT'),
  ('itat', 'Income Tax Appellate Tribunal', 'tribunal', 'tribunal', 'https://www.itat.gov.in/', 'national', 'Tax appeals nationwide'),
  ('drt', 'Debt Recovery Tribunal', 'tribunal', 'tribunal', 'https://www.drt.gov.in/', 'national', 'Debt recovery nationwide'),
  ('drat', 'Debt Recovery Appellate Tribunal', 'tribunal', 'tribunal', 'https://www.drat.gov.in/', 'national', 'Appeals against DRT'),
  ('ngt', 'National Green Tribunal', 'tribunal', 'tribunal', 'https://www.greentribunal.gov.in/', 'national', 'Environmental matters'),
  ('ncdrc', 'National Consumer Disputes Redressal Commission', 'commission', 'commission', 'https://www.e-jagriti.gov.in/', 'national', 'Consumer protection nationwide'),
  ('cci', 'Competition Commission of India', 'commission', 'regulatory_authority', 'https://www.cci.gov.in/', 'national', 'Competition law, abuse of dominance'),
  ('cat', 'Central Administrative Tribunal', 'tribunal', 'tribunal', 'https://www.cgat.gov.in/', 'national', 'Administrative service matters'),
  ('aft', 'Armed Forces Tribunal', 'tribunal', 'tribunal', 'https://www.aftdelhi.nic.in/', 'national', 'Armed forces personnel matters'),
  ('aptel', 'Appellate Tribunal for Electricity', 'tribunal', 'tribunal', 'https://www.aptel.nic.in/', 'national', 'Electricity regulatory matters'),
  ('tdsat', 'Telecom Disputes Settlement and Appellate Tribunal', 'tribunal', 'tribunal', 'https://www.tdsat.nic.in/', 'national', 'Telecom disputes'),
  ('cestat', 'Central Goods & Services Tax Appellate Authority', 'tribunal', 'tribunal', 'https://www.cestat.gov.in/', 'national', 'Customs, GST, excise appeals'),
  ('railway_claims', 'Railway Claims Tribunal', 'tribunal', 'tribunal', null, 'national', 'Railway accident claims'),
  ('labour_court', 'Labour Court', 'tribunal', 'tribunal', null, 'state', 'Industrial disputes, labour matters'),
  ('lok_adalat', 'Lok Adalat', 'tribunal', 'tribunal', null, 'state', 'Dispute resolution, pre-litigation')
ON CONFLICT (code) DO UPDATE SET updated_at = NOW();

-- ─────────────────────────────────────────────────────────────────────────────
-- Insert NCLT Benches (National + Regional)
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO court_benches (court_id, bench_code, bench_name, location, notes)
SELECT c.id, 'NCLT_DL', 'National Bench', 'New Delhi', 'Principal Bench'
FROM courts c WHERE c.code = 'nclt'
ON CONFLICT (court_id, bench_code) DO UPDATE SET updated_at = NOW();

INSERT INTO court_benches (court_id, bench_code, bench_name, location, notes)
SELECT c.id, 'NCLT_BL', 'Bangalore Bench', 'Bangalore', 'Regional Bench - South'
FROM courts c WHERE c.code = 'nclt'
ON CONFLICT (court_id, bench_code) DO UPDATE SET updated_at = NOW();

INSERT INTO court_benches (court_id, bench_code, bench_name, location, notes)
SELECT c.id, 'NCLT_CH', 'Chennai Bench', 'Chennai', 'Regional Bench - South'
FROM courts c WHERE c.code = 'nclt'
ON CONFLICT (court_id, bench_code) DO UPDATE SET updated_at = NOW();

INSERT INTO court_benches (court_id, bench_code, bench_name, location, notes)
SELECT c.id, 'NCLT_KK', 'Kolkata Bench', 'Kolkata', 'Regional Bench - East'
FROM courts c WHERE c.code = 'nclt'
ON CONFLICT (court_id, bench_code) DO UPDATE SET updated_at = NOW();

INSERT INTO court_benches (court_id, bench_code, bench_name, location, notes)
SELECT c.id, 'NCLT_MH', 'Mumbai Bench', 'Mumbai', 'Regional Bench - West'
FROM courts c WHERE c.code = 'nclt'
ON CONFLICT (court_id, bench_code) DO UPDATE SET updated_at = NOW();

-- ─────────────────────────────────────────────────────────────────────────────
-- Register Tribunal Data Sources (Adapters - Phase 4)
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO court_sources (
  court_id, adapter_id, source_url,
  search_methods, supported_data_fields,
  requires_captcha, requires_authentication, rate_limit_per_hour
)
SELECT c.id, 'nclt', 'https://www.nclt.gov.in/api',
  '{case_number,party_name}', '{case_number,case_type,parties,status,filing_date}',
  false, false, 150
FROM courts c WHERE c.code = 'nclt'
ON CONFLICT (court_id, adapter_id) DO UPDATE SET updated_at = NOW();

INSERT INTO court_sources (court_id, adapter_id, source_url, search_methods, supported_data_fields, requires_captcha, rate_limit_per_hour)
SELECT c.id, 'itat', 'https://www.itat.gov.in/',
  '{case_number}', '{case_number,case_type,status,filing_date}',
  false, false, 100
FROM courts c WHERE c.code = 'itat'
ON CONFLICT (court_id, adapter_id) DO UPDATE SET updated_at = NOW();

INSERT INTO court_sources (court_id, adapter_id, source_url, search_methods, supported_data_fields, requires_captcha, rate_limit_per_hour)
SELECT c.id, 'drt', 'https://www.drt.gov.in/',
  '{case_number,party_name}', '{case_number,case_type,parties,status}',
  false, false, 100
FROM courts c WHERE c.code = 'drt'
ON CONFLICT (court_id, adapter_id) DO UPDATE SET updated_at = NOW();

INSERT INTO court_sources (court_id, adapter_id, source_url, search_methods, supported_data_fields, requires_captcha, rate_limit_per_hour)
SELECT c.id, 'ngt', 'https://www.greentribunal.gov.in/',
  '{case_number}', '{case_number,case_type,status}',
  false, false, 80
FROM courts c WHERE c.code = 'ngt'
ON CONFLICT (court_id, adapter_id) DO UPDATE SET updated_at = NOW();

INSERT INTO court_sources (court_id, adapter_id, source_url, search_methods, supported_data_fields, requires_captcha, rate_limit_per_hour)
SELECT c.id, 'consumer_commission', 'https://www.e-jagriti.gov.in/',
  '{case_number,party_name}', '{case_number,case_type,parties,status}',
  true, false, 100
FROM courts c WHERE c.code = 'ncdrc'
ON CONFLICT (court_id, adapter_id) DO UPDATE SET updated_at = NOW();

-- ─────────────────────────────────────────────────────────────────────────────
-- Case Type Mappings (Tribunal specific)
-- ─────────────────────────────────────────────────────────────────────────────

-- NCLT case types
INSERT INTO case_type_mappings (source_code, source_court_id, normalized_category, full_name, jurisdiction)
SELECT 'CP', c.id, 'company_petition', 'Company Petition', 'tribunal'
FROM courts c WHERE c.code = 'nclt'
ON CONFLICT (source_code, source_court_id, normalized_category) DO UPDATE SET updated_at = NOW();

INSERT INTO case_type_mappings (source_code, source_court_id, normalized_category, full_name, jurisdiction)
SELECT 'CA', c.id, 'company_appeal', 'Company Appeal', 'tribunal'
FROM courts c WHERE c.code = 'nclt'
ON CONFLICT (source_code, source_court_id, normalized_category) DO UPDATE SET updated_at = NOW();

-- ITAT case types
INSERT INTO case_type_mappings (source_code, source_court_id, normalized_category, full_name, jurisdiction)
SELECT 'ITA', c.id, 'income_tax_appeal', 'Income Tax Appeal', 'tribunal'
FROM courts c WHERE c.code = 'itat'
ON CONFLICT (source_code, source_court_id, normalized_category) DO UPDATE SET updated_at = NOW();

-- DRT case types
INSERT INTO case_type_mappings (source_code, source_court_id, normalized_category, full_name, jurisdiction)
SELECT 'RA', c.id, 'recovery_application', 'Recovery Application', 'tribunal'
FROM courts c WHERE c.code = 'drt'
ON CONFLICT (source_code, source_court_id, normalized_category) DO UPDATE SET updated_at = NOW();

-- NGT case types
INSERT INTO case_type_mappings (source_code, source_court_id, normalized_category, full_name, jurisdiction)
SELECT 'OA', c.id, 'original_application', 'Original Application', 'tribunal'
FROM courts c WHERE c.code = 'ngt'
ON CONFLICT (source_code, source_court_id, normalized_category) DO UPDATE SET updated_at = NOW();

-- ─────────────────────────────────────────────────────────────────────────────
-- Migration complete
-- ─────────────────────────────────────────────────────────────────────────────
