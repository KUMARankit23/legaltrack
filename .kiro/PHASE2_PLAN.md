# Phase 2: Common eCourts Integration - Detailed Plan

**Timeline:** Weeks 4–8 (4-week sprint)  
**Status:** Ready to start after Phase 1 approval  
**Goal:** Implement eCourts adapters (HC + District) and refactor existing Delhi HC

---

## 🎯 Phase 2 Objectives

1. ✅ Implement `ecourtsHCAdapter.ts` — Search & fetch via eCourts HC Services (all 25 HCs)
2. ✅ Implement `ecourtsDistrictAdapter.ts` — CNR-based district court lookup
3. ✅ Refactor `delhiHCAdapter.ts` — Migrate to new adapter interface pattern
4. ✅ Update dispatcher `courtFetch.ts` — Route cases to correct adapter
5. ✅ Update API `cases.ts` — Accept court/bench parameters
6. ✅ Test end-to-end — No regression, all adapters working

---

## 📅 Weekly Breakdown

### Week 4: eCourts HC Adapter

**Goal:** Complete `ecourtsHCAdapter.ts` to fetch from all 25 High Courts via eCourts portal

**Tasks:**
1. Research eCourts HC Services portal structure
   - URL: https://hcservices.ecourts.gov.in/
   - Document HTML form, search parameters, result parsing
   - Test with 5 sample courts (Delhi, Bombay, Madras, Calcutta, Allahabad)

2. Implement adapter class
   ```typescript
   class EcourtsHCAdapter extends BaseCourtSourceAdapter {
     id = "ecourts_hc"
     name = "eCourts High Court Services"
     supported_courts = ["all"]
     court_types = ["high_court"]
     
     // Implement interface methods
   }
   ```

3. Implement search functionality
   - Parse search form (find input fields, dropdown values)
   - Submit search request
   - Parse results table
   - Handle pagination if present

4. Implement case detail retrieval
   - Follow search result link to case detail page
   - Parse parties, status, dates, hearing list
   - Extract any available order URLs
   - Handle missing fields gracefully

5. CAPTCHA handling
   - Detect CAPTCHA challenge (HTML pattern)
   - Document CAPTCHA format
   - Plan: Log error + suggest manual PDF upload
   - (Solving CAPTCHA is out of scope; fallback to manual)

6. Error handling & edge cases
   - Case not found (404 or "No records")
   - Timeout (60s limit)
   - Session expiry (refresh session)
   - Malformed response (try fallback)

7. Test with 5 sample cases
   - Pick 1 case from each: Delhi, Bombay, Madras, Calcutta, Allahabad
   - Verify: case found, parties extracted, status populated
   - Document any court-specific quirks

**Deliverable:** `backend/src/adapters/ecourts/ecourtsHCAdapter.ts` (400–600 lines)

**Testing:**
```bash
npm test -- ecourtsHCAdapter.test.ts
# Tests:
# ✓ Search Delhi HC case
# ✓ Fetch Bombay HC case details
# ✓ Handle Madras HC CAPTCHA
# ✓ Parse Calcutta HC parties
# ✓ Extract hearing list
```

**Success Criteria:**
- ✅ All 5 sample cases searchable
- ✅ Case details populated (parties, status, next hearing)
- ✅ CAPTCHA detected & logged
- ✅ No unhandled exceptions
- ✅ Adapter status reports correctly

---

### Week 5: eCourts District Adapter

**Goal:** Implement `ecourtsDistrictAdapter.ts` for CNR-based district court lookups

**Tasks:**
1. Research eCourts District Services
   - URL: https://services.ecourts.gov.in/ecourtindia_v6/
   - Understand CNR format (16 chars: STDC+14 digits)
   - Test with 10 sample CNRs from different states

2. Implement CNR search
   - Validate CNR format
   - State extraction (first 2 chars)
   - Submit search request
   - Parse response (case details, parties, hearings)

3. Implement pagination & history retrieval
   - If multiple page results, fetch all pages
   - Combine hearing history across pages
   - Deduplicate hearings (by date + purpose)

4. Handle variations by state
   - Different states may have different response formats
   - Document state-specific parsing rules
   - Fall back to generic parsing if state-specific fails

5. Order discovery
   - If case has orders, fetch order URLs
   - Parse order details (date, type)
   - Note: Some districts may not have order URLs

6. Error handling
   - Invalid CNR format → reject early
   - CNR not found → friendly error
   - CAPTCHA → log + fallback
   - Timeout → retry with backoff

7. Test with 10 CNRs
   - Pick 2 CNRs from each: Delhi, Maharash, Karnataka, Tamil Nadu, Rajasthan
   - Verify: CNR recognized, parties extracted, hearings listed

**Deliverable:** `backend/src/adapters/ecourts/ecourtsDistrictAdapter.ts` (400–600 lines)

**Common CNR Examples for Testing:**
```
DLHC010143032022  — Delhi (DL)
MHDC010143032022  — Maharashtra (MH)
KARDC010143032022 — Karnataka (KA)
TNDC010143032022  — Tamil Nadu (TN)
RAJDC010143032022 — Rajasthan (RJ)
```

**Testing:**
```bash
npm test -- ecourtsDistrictAdapter.test.ts
# Tests:
# ✓ Recognize valid CNR
# ✓ Reject invalid CNR format
# ✓ Fetch Delhi district court case
# ✓ Parse multi-page results
# ✓ Extract hearing history
# ✓ Handle missing orders
```

**Success Criteria:**
- ✅ All 10 sample CNRs searchable
- ✅ Case details populated for each state variant
- ✅ Hearing history complete (no truncation)
- ✅ Rate limiting respected
- ✅ No regression vs. manual testing

---

### Week 6: Refactor Existing Delhi HC Adapter

**Goal:** Migrate existing `courtFetch.ts` logic to `delhiHCAdapter.ts` using new interface

**Tasks:**
1. Audit existing Delhi HC integration
   - Review `courtFetch.ts`, `fetcher.ts`, `caseLookup.ts`
   - Document current behavior (what works, what doesn't)
   - Identify edge cases to preserve

2. Extract core fetch logic
   - Move CAPTCHA parsing
   - Move cause-list PDF downloading
   - Move case history parsing
   - Move order extraction

3. Implement `delhiHCAdapter` class
   ```typescript
   class DelhiHCAdapter extends BaseCourtSourceAdapter {
     id = "delhi_hc"
     name = "Delhi High Court"
     supported_courts = ["delhi_hc"]
     court_types = ["high_court"]
     
     // Implement interface methods
     // Reuse existing logic where possible
   }
   ```

4. Ensure backward compatibility
   - Same case parsing rules
   - Same error handling
   - Same CAPTCHA behavior
   - Same order download process

5. Test with existing Delhi HC cases
   - Run against 5 sample Delhi HC cases already in DB
   - Verify all cases fetch correctly
   - Compare with previous results (should be identical)
   - No performance regression

6. Update `courtFetch.ts` dispatcher
   - Remove Delhi-specific logic
   - Replace with adapter routing:
   ```typescript
   const adapter = selectAdapter(case.court);
   const result = await adapter.getCaseDetails(...);
   ```

**Deliverable:** 
- `backend/src/adapters/courts/delhiHCAdapter.ts` (refactored)
- Updated `backend/src/ingestion/courtFetch.ts` (dispatcher)

**Testing:**
```bash
npm test -- delhiHCAdapter.test.ts
# Tests compare old behavior vs. new:
# ✓ Case details identical
# ✓ Order URLs same
# ✓ Hearing dates match
# ✓ Performance ≥ previous
```

**Success Criteria:**
- ✅ All existing Delhi HC cases still fetch correctly
- ✅ No regression in data quality
- ✅ CAPTCHA handling unchanged
- ✅ Performance maintained
- ✅ Code cleaner (moved into adapter interface)

---

### Week 7: Integration & API Updates

**Goal:** Connect adapters into main application flow, update APIs

**Tasks:**
1. Update `cases.ts` API endpoints
   - POST /cases/lookup — now accepts `court` parameter
   - POST /cases/:id/fetch — now uses adapter dispatcher
   - Return adapter status in response

2. Create dispatcher in `courtFetch.ts`
   ```typescript
   async function dispatchFetchJob(caseId, caseNo, court) {
     const adapter = selectAdapter(court);
     if (!adapter) return { error: "No adapter for court" };
     return adapter.getCaseDetails(caseNo, court);
   }
   ```

3. Update frontend `page.tsx`
   - Add court/bench selector (optional for MVP)
   - Show which adapter is being used
   - Display adapter status (available/unavailable)

4. Create test fixtures
   - 5 Delhi HC cases → delhiHCAdapter
   - 5 Bombay HC cases → ecourtsHCAdapter
   - 10 District CNRs → ecourtsDistrictAdapter
   - Document expected behavior for each

5. Integration testing
   - End-to-end: Case lookup → Fetch → Store → Display
   - Multi-adapter scenario: Same client with cases in different courts
   - Error scenarios: CAPTCHA, timeout, not found

6. Performance testing
   - Parallel fetches (2–3 cases simultaneously)
   - Rate limiting holds up under load
   - Memory usage OK (no leaks from parallel adapters)

**Deliverable:**
- Updated `backend/src/api/cases.ts`
- Updated `backend/src/ingestion/courtFetch.ts`
- Test fixtures (20 cases)
- Integration tests

**Testing:**
```bash
npm test -- integration.test.ts
# Tests:
# ✓ POST /cases/lookup with court param
# ✓ GET /cases/:id/fetch/status (polling)
# ✓ Multi-adapter parallel fetch
# ✓ CAPTCHA handling in background
# ✓ Rate limit backoff
```

**Success Criteria:**
- ✅ All 20 test cases fetch successfully
- ✅ API returns adapter status
- ✅ No crashes under concurrent load
- ✅ Rate limiting works
- ✅ CAPTCHA errors graceful

---

### Week 8: Testing, Documentation, and Finalization

**Goal:** Comprehensive testing, documentation, and handoff for Phase 3

**Tasks:**
1. Test all 3 adapters against real cases
   - Delhi HC: 10 cases
   - Other HCs via eCourts: 5 cases from 5 different HCs
   - District courts: 15 different CNRs

2. Stress testing
   - 50 parallel case fetches (stress test adapters)
   - Verify rate limiting works
   - No memory leaks
   - Sessions properly managed

3. Edge case testing
   - Case with no parties (if possible)
   - Case with 100+ hearings
   - Very old case (1990s)
   - Very recent case (today)
   - Case with sealed/restricted info
   - Case with order URLs missing

4. Documentation
   - Update `.kiro/MULTI_COURT_IMPLEMENTATION.md` with findings
   - Document eCourts HC portal structure
   - Document eCourts District portal structure
   - Create troubleshooting guide (common CAPTCHA patterns, etc.)

5. Code review & cleanup
   - Ensure all adapters follow interface contract exactly
   - Remove debug code
   - Add missing JSDoc comments
   - Run linter (ESLint)

6. Create Phase 3 roadmap
   - Identify per-HC peculiarities to handle
   - List tribunals to prioritize (Phase 4)
   - Document any discovered limitations

**Deliverables:**
- Test report (30+ test cases, all passing)
- Stress test report
- Updated MULTI_COURT_IMPLEMENTATION.md
- Troubleshooting guide
- Phase 3 recommendations

**Testing Summary:**
```bash
npm test
# Test Results:
# ✓ Unit tests: 50+ tests, all passing
# ✓ Integration: 20 cases, all fetching
# ✓ Stress: 50 parallel, no errors
# ✓ Edge cases: 10 scenarios handled
# ✓ Code coverage: >80%
```

**Success Criteria:**
- ✅ 100+ total test cases passing
- ✅ All 3 adapters verified working
- ✅ Stress test successful (50 parallel)
- ✅ Documentation complete
- ✅ No regressions in Delhi HC cases
- ✅ Ready for Phase 3 (per-HC adapters)

---

## 🔧 Technical Decisions

### CAPTCHA Handling Strategy
- **Current:** Detect CAPTCHA HTML pattern, log error, suggest manual PDF upload
- **Rationale:** CAPTCHA-breaking is fragile & changes often; manual upload is reliable fallback
- **Future:** If eCourts provides API key or reduces CAPTCHA, add direct API support

### Rate Limiting Strategy
- **Current:** Exponential backoff (1s → 2s → 4s → 8s → max 60s)
- **Rationale:** Respectful to courts' infrastructure; prevents IP bans
- **Config:** eCourts limits ~60 requests/hour; we'll average 30 to be conservative

### Session Management
- **Current:** Fresh session per search (no session persistence)
- **Rationale:** Simplest, avoids session expiry issues
- **Tradeoff:** Slightly slower (re-parse form on each request)
- **Optimization:** Could cache session if needed in Phase 3

### Error Recovery
- **Approach:** Fail fast, provide actionable error message
- **Fallback:** Manual PDF upload always available
- **Logging:** All errors logged to audit trail for debugging

---

## 📊 Success Metrics

| Metric | Target | Week 4 | Week 5 | Week 6 | Week 7 | Week 8 |
|--------|--------|--------|--------|--------|--------|--------|
| eCourts HC Adapter | Working | ✅ | ✅ | ✅ | ✅ | ✅ |
| District Adapter | Working | — | ✅ | ✅ | ✅ | ✅ |
| Delhi HC Refactored | Complete | — | — | ✅ | ✅ | ✅ |
| API Updated | Ready | — | — | ✅ | ✅ | ✅ |
| Test Cases | 100+ passing | 5 | 10 | 20 | 50 | 100+ |
| Code Coverage | >80% | 70% | 75% | 80% | 85% | 90%+ |
| Regression | Zero | — | — | ✅ | ✅ | ✅ |

---

## 📁 Phase 2 Deliverables

**New Files:**
```
backend/src/adapters/
├── ecourts/
│   ├── ecourtsHCAdapter.ts        (new, ~600 lines)
│   ├── ecourtsDistrictAdapter.ts  (new, ~600 lines)
│   └── ecourtsCommonUtils.ts      (new, shared utilities)
└── courts/
    └── delhiHCAdapter.ts          (refactored from courtFetch.ts)

tests/
├── ecourtsHCAdapter.test.ts       (new)
├── ecourtsDistrictAdapter.test.ts (new)
└── integration.test.ts            (new)

docs/
├── ECOURTS_HC_STRUCTURE.md        (new, portal analysis)
├── ECOURTS_DISTRICT_STRUCTURE.md  (new, portal analysis)
└── TROUBLESHOOTING.md             (new, common issues)
```

**Modified Files:**
```
backend/src/ingestion/courtFetch.ts  (refactor to use adapters)
backend/src/api/cases.ts              (update endpoints)
backend/package.json                  (may add test dependencies)
.kiro/MULTI_COURT_IMPLEMENTATION.md  (update with findings)
```

**Removed/Deprecated:**
```
backend/src/ingestion/fetcher.ts     (merge into adapters)
backend/src/ingestion/caseLookup.ts  (refactor logic)
```

---

## 🎓 Handoff to Phase 3

At end of Phase 2:
- ✅ All 25 High Courts accessible via eCourts HC adapter
- ✅ All district courts accessible via CNR + eCourts adapter
- ✅ Existing Delhi HC integration fully migrated
- ✅ No regressions, all tests passing
- ✅ Documentation complete
- ✅ Team ready to build per-HC adapters (Phase 3)

**Phase 3 will:**
- Build specialized adapters for courts with unique structures
- Add tribunal support (NCLT, ITAT, NGT, etc.)
- Enhance case type taxonomy (50+ types)
- Add district court discovery from eCourts directory

---

## ⏭️ Next: Start Phase 2

Ready to proceed with Week 4 (eCourts HC Adapter)?

**Confirmation required:**
- [ ] Phase 1 review complete
- [ ] Database migration applied
- [ ] Existing Delhi HC tests passing
- [ ] Team ready for Phase 2

Once confirmed, I'll start implementing `ecourtsHCAdapter.ts` immediately.

---

**Target Launch Date:** End of Week 8 (8 weeks total from Phase 1 start)
