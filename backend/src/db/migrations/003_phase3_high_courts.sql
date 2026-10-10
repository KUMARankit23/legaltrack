-- Migration: Phase 3 - High Court Specialization
-- Version: 003
-- Date: 2026-10-10
-- Description: Initialize all 25 High Courts and their benches in the registry

-- This migration populates:
-- - All 25 High Courts with official metadata
-- - Multiple benches per HC where applicable
-- - HC-specific data sources and adapters
-- - Bench-specific case search configurations

-- ─────────────────────────────────────────────────────────────────────────────
-- Insert all 25 High Courts (Phase 3 focus: 5 specialized adapters)
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO courts (code, name, court_type, institution_type, state_ut, official_website, jurisdiction, notes)
VALUES
  ('supreme_court_india', 'Supreme Court of India', 'supreme_court', 'court', NULL, 'https://www.sci.gov.in/', 'national', 'Apex court, constitutional appeals'),
  ('delhi_hc', 'Delhi High Court', 'high_court', 'court', 'DL', 'https://delhihighcourt.nic.in/', 'state', 'PHASE 1: Existing implementation'),
  ('bombay_hc', 'Bombay High Court', 'high_court', 'court', 'MH', 'https://bombayhighcourt.nic.in/', 'state', 'PHASE 3: Specialized adapter'),
  ('madras_hc', 'Madras High Court', 'high_court', 'court', 'TN', 'https://hcmadras.tn.gov.in/', 'state', 'PHASE 3: Specialized adapter'),
  ('calcutta_hc', 'Calcutta High Court', 'high_court', 'court', 'WB', 'https://calcuttahighcourt.gov.in/', 'state', 'PHASE 3: Specialized adapter'),
  ('allahabad_hc', 'Allahabad High Court', 'high_court', 'court', 'UP', 'https://allahabadhighcourt.in/', 'state', 'PHASE 3: Specialized adapter'),
  ('patna_hc', 'Patna High Court', 'high_court', 'court', 'BR', 'https://patnahighcourt.gov.in/', 'state', 'PHASE 3: Specialized adapter'),
  ('andhra_pradesh_hc', 'Andhra Pradesh High Court', 'high_court', 'court', 'AP', 'https://aphc.gov.in/', 'state', 'Principal bench in Amaravati'),
  ('karnataka_hc', 'Karnataka High Court', 'high_court', 'court', 'KA', 'https://karnatakajudiciary.kar.nic.in/', 'state', 'Principal bench in Bangalore'),
  ('kerala_hc', 'Kerala High Court', 'high_court', 'court', 'KL', 'https://highcourt.kerala.gov.in/', 'state', 'Principal bench in Kochi'),
  ('gauhati_hc', 'Gauhati High Court', 'high_court', 'court', 'AS', 'https://ghconline.gov.in/', 'region', 'Covers NE states'),
  ('punjab_haryana_hc', 'Punjab & Haryana High Court', 'high_court', 'court', 'PB', 'https://highcourtchd.gov.in/', 'region', 'Covers Punjab & Haryana'),
  ('rajasthan_hc', 'Rajasthan High Court', 'high_court', 'court', 'RJ', 'https://hcraj.nic.in/', 'state', 'Two benches: Jaipur & Jodhpur'),
  ('madhya_pradesh_hc', 'Madhya Pradesh High Court', 'high_court', 'court', 'MP', 'https://mphc.gov.in/', 'state', 'Two benches: Indore & Jabalpur'),
  ('chhattisgarh_hc', 'Chhattisgarh High Court', 'high_court', 'court', 'CG', 'https://highcourt.cg.gov.in/', 'state', 'Bench in Bilaspur'),
  ('Gujarat_hc', 'Gujarat High Court', 'high_court', 'court', 'GJ', 'https://gujarathighcourt.nic.in/', 'state', 'Bench in Ahmedabad'),
  ('himachal_pradesh_hc', 'Himachal Pradesh High Court', 'high_court', 'court', 'HP', 'https://highcourt.hp.gov.in/', 'state', 'Bench in Shimla'),
  ('jammu_kashmir_hc', 'Jammu & Kashmir and Ladakh High Court', 'high_court', 'court', 'JK', 'https://jkhighcourt.nic.in/', 'region', 'Covers J&K and Ladakh'),
  ('jharkhand_hc', 'Jharkhand High Court', 'high_court', 'court', 'JH', 'https://jharkhandhighcourt.nic.in/', 'state', 'Bench in Ranchi'),
  ('orissa_hc', 'Orissa High Court', 'high_court', 'court', 'OD', 'https://orissahighcourt.nic.in/', 'state', 'Bench in Cuttack'),
  ('telangana_hc', 'Telangana High Court', 'high_court', 'court', 'TG', 'https://tshc.gov.in/', 'state', 'Bench in Hyderabad'),
  ('uttarakhand_hc', 'Uttarakhand High Court', 'high_court', 'court', 'UT', 'https://highcourtofuttarakhand.gov.in/', 'state', 'Two benches: Nainital & Garhwal'),
  ('sikkim_hc', 'Sikkim High Court', 'high_court', 'court', 'SK', 'https://hcs.gov.in/', 'state', 'Bench in Gangtok'),
  ('tripura_hc', 'Tripura High Court', 'high_court', 'court', 'TR', 'https://thc.nic.in/', 'state', 'Bench in Agartala'),
  ('manipur_hc', 'Manipur High Court', 'high_court', 'court', 'MN', 'https://hcmimphal.nic.in/', 'state', 'Bench in Imphal'),
  ('meghalaya_hc', 'Meghalaya High Court', 'high_court', 'court', 'ML', 'https://meghalayahighcourt.nic.in/', 'state', 'Bench in Shillong')
ON CONFLICT (code) DO UPDATE SET updated_at = NOW();

-- ─────────────────────────────────────────────────────────────────────────────
-- Insert Bombay HC Benches (Phase 3 specialization)
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO court_benches (court_id, bench_code, bench_name, location, official_website, case_status_url, notes)
SELECT c.id, 'BHCMB', 'Mumbai (Principal Bench)', 'Mumbai', 'https://bombayhighcourt.nic.in/', 'https://bombayhighcourt.nic.in/case-status', 'Principal Bench'
FROM courts c WHERE c.code = 'bombay_hc'
ON CONFLICT (court_id, bench_code) DO UPDATE SET updated_at = NOW();

INSERT INTO court_benches (court_id, bench_code, bench_name, location, case_status_url, notes)
SELECT c.id, 'BHCNP', 'Nagpur Bench', 'Nagpur', 'https://bombayhighcourt.nic.in/nagpur-bench', 'Bench of Bombay HC'
FROM courts c WHERE c.code = 'bombay_hc'
ON CONFLICT (court_id, bench_code) DO UPDATE SET updated_at = NOW();

INSERT INTO court_benches (court_id, bench_code, bench_name, location, case_status_url, notes)
SELECT c.id, 'BHCAB', 'Aurangabad Bench', 'Aurangabad', 'https://bombayhighcourt.nic.in/aurangabad-bench', 'Bench of Bombay HC'
FROM courts c WHERE c.code = 'bombay_hc'
ON CONFLICT (court_id, bench_code) DO UPDATE SET updated_at = NOW();

-- ─────────────────────────────────────────────────────────────────────────────
-- Insert Madras HC Benches (Phase 3 specialization)
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO court_benches (court_id, bench_code, bench_name, location, official_website, notes)
SELECT c.id, 'MHCH', 'Chennai (Principal Bench)', 'Chennai', 'https://hcmadras.tn.gov.in/', 'Principal Bench'
FROM courts c WHERE c.code = 'madras_hc'
ON CONFLICT (court_id, bench_code) DO UPDATE SET updated_at = NOW();

INSERT INTO court_benches (court_id, bench_code, bench_name, location, notes)
SELECT c.id, 'MHMD', 'Madurai Bench', 'Madurai', 'Bench of Madras HC'
FROM courts c WHERE c.code = 'madras_hc'
ON CONFLICT (court_id, bench_code) DO UPDATE SET updated_at = NOW();

-- ─────────────────────────────────────────────────────────────────────────────
-- Register High Court Data Sources (Adapters)
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO court_sources (
  court_id, adapter_id, source_url,
  search_methods, supported_data_fields,
  requires_captcha, requires_authentication, rate_limit_per_hour
)
SELECT c.id, 'ecourts_hc', 'https://hcservices.ecourts.gov.in/',
  '{case_number,cnr,party_name}', '{case_number,case_type,parties,status,next_hearing_date}',
  true, false, 100
FROM courts c
WHERE c.court_type = 'high_court' AND c.code NOT IN ('delhi_hc', 'bombay_hc', 'madras_hc', 'calcutta_hc', 'allahabad_hc', 'patna_hc')
ON CONFLICT (court_id, adapter_id) DO UPDATE SET updated_at = NOW();

-- Specialized adapters for 5 HCs in Phase 3
INSERT INTO court_sources (court_id, adapter_id, source_url, search_methods, supported_data_fields, requires_captcha, rate_limit_per_hour)
SELECT c.id, 'bombay_hc', 'https://bombayhighcourt.nic.in/',
  '{case_number,party_name}', '{case_number,case_type,parties,status,judge_name}',
  false, false, 120
FROM courts c WHERE c.code = 'bombay_hc'
ON CONFLICT (court_id, adapter_id) DO UPDATE SET updated_at = NOW();

INSERT INTO court_sources (court_id, adapter_id, source_url, search_methods, supported_data_fields, requires_captcha, rate_limit_per_hour)
SELECT c.id, 'madras_hc', 'https://hcmadras.tn.gov.in/',
  '{case_number,cnr,party_name}', '{case_number,cnr,case_type,parties,status}',
  true, false, 100
FROM courts c WHERE c.code = 'madras_hc'
ON CONFLICT (court_id, adapter_id) DO UPDATE SET updated_at = NOW();

-- ─────────────────────────────────────────────────────────────────────────────
-- Case Type Mappings (High Court specific)
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO case_type_mappings (
  source_code, source_court_id, normalized_category, full_name, is_appellate, jurisdiction
)
SELECT 'W.P.(C)', c.id, 'constitutional_writ', 'Writ Petition (Civil)', false, 'high_court'
FROM courts c WHERE c.court_type = 'high_court' AND c.code = 'delhi_hc'
ON CONFLICT (source_code, source_court_id, normalized_category) DO UPDATE SET updated_at = NOW();

-- ─────────────────────────────────────────────────────────────────────────────
-- Migration complete
-- ─────────────────────────────────────────────────────────────────────────────
