# LexFlow Complete Implementation Process (Phases 2-5)
## All-in-One Sprint: Nationwide Court Coverage

**Status:** AWAITING USER APPROVAL  
**Date:** 2026-10-10  
**Goal:** Transform from Delhi HC-only to India-wide court platform in single implementation sprint  
**Timeline:** 2-3 weeks (compressed from 32 weeks)

---

## 🎯 Current Problem

**User Issue:**
> "I am pushing case number of different courts instead of showing info dynamically. It is fetching only Delhi high court, not fetching from other high courts. I want details fetched from all courts all over India."

**Root Cause:**
- `courtFetch.ts` hardcoded to Delhi HC only
- `ecourtsHCAdapter.ts` exists but not integrated
- No dispatcher to route cases to correct court adapter
- Frontend doesn't select court before searching

---

## 📋 FIELDS TO CHANGE (Master Change List)

### 1. **Case Search Flow**
**File:** `backend/src/api/cases.ts`

**CURRENT:**
```typescript
POST /cases/lookup
Body: { case_no: "OMP/2024/123" }
// Assumes Delhi HC, no court parameter
```

**CHANGE TO:**
```typescript
POST /cases/lookup
Body: { 
  case_no: "OMP/2024/123",
  court_id: "delhi_hc"  // NEW: Required parameter
}
// Routes to correct court's adapter based on court_id
```

**Impact:**
- ✅ Users select court BEFORE entering case number
- ✅ System routes to correct adapter
- ✅ Can fetch from all 25 HCs + districts + tribunals
- ⚠️ BREAKING: Existing API calls must include court_id

---

### 2. **Case Fetch Logic**
**File:** `backend/src/ingestion/courtFetch.ts`

**CURRENT:**
```typescript
async function runFetch(caseId: string, caseNo: string) {
  // Hardcoded Delhi HC logic
  const session = await getPageSession(); // Delhi-specific
  const history = await fetchCaseHistory(url, session); // Delhi-specific
}
```

**CHANGE TO:**
```typescript
async function runFetch(caseId: string, caseNo: string, courtId: string) {
  // Dispatcher pattern
  const adapter = selectAdapter(courtId); // Route to correct adapter
  if (!adapter) throw new Error("No adapter for court: " + courtId);
  
  const details = await adapter.getCaseDetails(caseNo, courtId);
  const history = await adapter.getHearingHistory(caseNo, courtId);
  const orders = await adapter.getOrders(caseNo, courtId);
  
  return { details, history, orders };
}

function selectAdapter(courtId: string): ICourtSourceAdapter {
  if (courtId === "delhi_hc") return new DelhiHCAdapter();
  if (courtId.includes("high_court")) return new EcourtsHCAdapter();
  if (courtId.includes("district")) return new EcourtsDistrictAdapter();
  // Phase 4: Tribunal routing
  return null;
}
```

**Impact:**
- ✅ Can fetch from any court
- ✅ Each court uses specialized adapter
- ✅ Extensible for new courts
- ⚠️ All adapters must implement same interface

---

### 3. **Database - Track Court Source**
**File:** `backend/src/db/migrations/001_create_court_registry.sql`

**CHANGE:** Add `source_court_id` to cases table (if not present)

```sql
ALTER TABLE cases ADD COLUMN source_court_id VARCHAR(50);
ALTER TABLE cases ADD COLUMN adapter_used VARCHAR(50);
ALTER TABLE cases ADD COLUMN last_updated_by VARCHAR(50);
```

**Impact:**
- ✅ Track which court each case is from
- ✅ Know which adapter fetched it
- ✅ Prevent duplicate cases from different courts
- ✅ Audit trail complete

---

### 4. **Frontend - Court Selection**
**File:** `frontend/app/page.tsx`

**CURRENT:**
```jsx
<input placeholder="Enter case number" />
<button>Search</button>
```

**CHANGE TO:**
```jsx
<select id="court-select">
  <option value="">Select Court...</option>
  <option value="delhi_hc">Delhi High Court</option>
  <option value="bombay_hc">Bombay High Court</option>
  <option value="madras_hc">Madras High Court</option>
  {/* ... all 25 HCs */}
  <optgroup label="District Courts">
    <option value="delhi_district">Delhi District Courts (CNR)</option>
    {/* ... 36 states */}
  </optgroup>
</select>

<input id="case-no" placeholder="Enter case number or CNR" />
<button onClick={searchCase}>Search</button>

async function searchCase() {
  const courtId = document.getElementById("court-select").value;
  const caseNo = document.getElementById("case-no").value;
  
  if (!courtId) return alert("Please select a court");
  
  const res = await fetch("/cases/lookup", {
    method: "POST",
    body: JSON.stringify({ case_no: caseNo, court_id: courtId })
  });
  // Display results from selected court
}
```

**Impact:**
- ✅ Users see all courts they can search
- ✅ Can search any court's cases
- ✅ Clear separation by court type
- ✅ Case number guidance (CNR for districts)

---

### 5. **Adapter Implementations**

#### Phase 2: Common eCourts (WEEKS 1-2)
**New Adapters:**
- `ecourtsHCAdapter.ts` — Search all 25 High Courts via unified portal
- `ecourtsDistrictAdapter.ts` — Search district courts via CNR
- `delhiHCAdapter.ts` — Refactored Delhi HC with new interface

**File Locations:**
```
backend/src/adapters/
├── adapter.interface.ts (exists - defines contract)
├── courts/
│   └── delhiHCAdapter.ts
├── ecourts/
│   ├── ecourtsHCAdapter.ts (exists - needs full impl)
│   └── ecourtsDistrictAdapter.ts
```

#### Phase 3: High Court Specialization (WEEKS 3-4)
**New Adapters (Per-HC Custom Logic):**
- `bombayHCAdapter.ts` — Bombay HC specific parsing
- `madrasHCAdapter.ts` — Madras HC specific parsing
- `calcuttaHCAdapter.ts` — Calcutta HC specific parsing
- `allahabadHCAdapter.ts` — Allahabad HC specific parsing
- `panaHCAdapter.ts` — Punjabi & Haryana HC
- ... (20 more HCs)

**Rationale:** Each HC has unique:
- PDF cause-list format
- HTML structure
- Case numbering
- Bench system
- Data availability

#### Phase 4: Tribunals (WEEKS 5-6)
**New Adapters:**
- `ncltAdapter.ts` — NCLT/NCLAT (Company Law)
- `itatAdapter.ts` — Income Tax Appellate Tribunal
- `drtAdapter.ts` — Debt Recovery Tribunal
- `ngtAdapter.ts` — National Green Tribunal
- `consumerAdapter.ts` — e-Jagriti (Consumer Protection)

#### Phase 5: Production Rollout (WEEKS 7-8)
- District court auto-discovery
- Sync jobs setup
- Monitoring & alerts
- Production deployment

---

## 🔄 DETAILED CHANGE MATRIX

### File-by-File Changes

| File | Current State | Needs Change | Reason | Risk |
|------|--------------|--------------|--------|------|
| `backend/src/api/cases.ts` | Delhi-only hardcoded | Add court_id param | Enable multi-court search | Medium |
| `backend/src/ingestion/courtFetch.ts` | Delhi-only hardcoded | Add dispatcher pattern | Route to correct adapter | Medium |
| `backend/src/ingestion/fetcher.ts` | Delhi-only utils | Extract to adapter | Adapter-specific logic | Low |
| `backend/src/ingestion/caseLookup.ts` | Delhi-only | Refactor/remove | Consolidate into adapters | Low |
| `backend/src/adapters/adapter.interface.ts` | Interface defined | ✅ OK | Already good | None |
| `backend/src/adapters/ecourts/ecourtsHCAdapter.ts` | Stub/partial | Complete implementation | Full feature parity | Medium |
| `backend/src/adapters/ecourts/ecourtsDistrictAdapter.ts` | Not started | Create new | Support district courts | High |
| `backend/src/adapters/courts/delhiHCAdapter.ts` | Not started | Create (refactor) | New interface pattern | High |
| `backend/src/registry/courtRegistry.ts` | Defined | ✅ OK | Already complete | None |
| `backend/src/registry/caseTaxonomy.ts` | Defined | ✅ OK | Already complete | None |
| `backend/src/db/migrations/001_create_court_registry.sql` | Schema defined | Minor add | Track source_court_id | Low |
| `frontend/app/page.tsx` | No court selector | Add court dropdown | Enable court selection | Medium |
| `frontend/app/layout.tsx` | No changes | ✅ OK | Not affected | None |
| `backend/package.json` | Current deps | Review for adapters | Check if new packages needed | Low |

---

## 🗺️ MAPPING: Courts ↔ Adapters

### High Courts (25 total)

**Via eCourts Portal (All):**
```
adapter: ecourtsHCAdapter
courts:
  - delhi_hc → eCourts search
  - bombay_hc → eCourts search
  - madras_hc → eCourts search
  - ... (22 more)
```

**Via Specialized Adapters (Phase 3):**
```
adapter: bombayHCAdapter (custom logic)
adapter: madrasHCAdapter (custom logic)
... (in addition to eCourts fallback)
```

### District Courts (743 via eCourts)

**Via eCourts District Portal:**
```
adapter: ecourtsDistrictAdapter
input: CNR (e.g., DLHC010143032022)
extracted: state + court + case info
```

### Tribunals (8+ types)

**Phase 4 Adapters:**
```
adapter: ncltAdapter → NCLT, NCLAT
adapter: itatAdapter → Income Tax
adapter: drtAdapter → Debt Recovery
adapter: ngtAdapter → Environmental
adapter: consumerAdapter → Consumer Protection
... (3 more)
```

---

## ⚠️ BREAKING CHANGES (User Awareness)

### 1. API Change: `court_id` now required

**OLD:**
```bash
POST /cases/lookup
{ "case_no": "OMP/2024/123" }
```

**NEW:**
```bash
POST /cases/lookup
{ 
  "case_no": "OMP/2024/123",
  "court_id": "delhi_hc"  # REQUIRED
}
```

**Impact:**
- ✅ Can search all courts
- ❌ Existing API clients must be updated
- ❌ User must select court before searching

### 2. Database Schema Extension

**NEW COLUMNS:**
```sql
ALTER TABLE cases ADD COLUMN source_court_id VARCHAR(50);
ALTER TABLE cases ADD COLUMN adapter_used VARCHAR(50);
```

**Impact:**
- ✅ Track court source
- ❌ Requires migration
- ❌ Cannot reverse (additive, safe to run)

### 3. Frontend Changes Required

**MUST UPDATE:**
- Court dropdown before case input
- Case number input placeholder (changes per court type)
- Search flow (court selection → case number)

---

## ✅ SUCCESS CRITERIA (Post-Implementation)

### Phase 2 Complete (Weeks 1-2)
- [ ] `ecourtsHCAdapter` fetches from all 25 HCs
- [ ] `ecourtsDistrictAdapter` fetches from all districts via CNR
- [ ] `delhiHCAdapter` refactored to new interface
- [ ] `courtFetch.ts` dispatcher routes correctly
- [ ] `cases.ts` API accepts court_id
- [ ] Frontend has court selector
- [ ] 50+ real test cases passing
- [ ] Zero regressions on existing Delhi HC cases

### Phase 3 Complete (Weeks 3-4)
- [ ] 5 HC adapters (Bombay, Madras, Calcutta, Allahabad, Punjab & Haryana)
- [ ] Specialized parsing for each HC
- [ ] 25 total HC adapters implemented (all)
- [ ] 100+ test cases per HC
- [ ] Performance benchmarks met

### Phase 4 Complete (Weeks 5-6)
- [ ] NCLT, ITAT, DRT, NGT, Consumer adapters
- [ ] Tribunal case retrieval working
- [ ] Test coverage for tribunal cases
- [ ] Tribunal cases queryable from API

### Phase 5 Complete (Weeks 7-8)
- [ ] District auto-discovery from eCourts
- [ ] Sync jobs running (daily for HCs, weekly for tribunals)
- [ ] Monitoring & alerting active
- [ ] Production deployment complete
- [ ] Full audit report (code quality, coverage, deployment readiness)

### Overall Metrics
- **Code Coverage:** >90%
- **All Tests Passing:** ✅
- **Live Data:** From all 25 HCs, 36 districts, 8+ tribunals
- **Performance:** <3s per case fetch (median)
- **Uptime:** 99.9%
- **Documentation:** Complete (how to add new courts)

---

## 📅 IMPLEMENTATION TIMELINE

```
Week 1-2: Phase 2 (eCourts adapters + refactoring)
├─ Day 1-2: eCourts HC adapter (complete implementation)
├─ Day 3-4: eCourts District adapter (CNR-based)
├─ Day 5: Delhi HC refactor + dispatcher
└─ Day 6-7: Frontend update + 50 test cases

Week 3-4: Phase 3 (HC specialization)
├─ Day 1-3: Bombay, Madras, Calcutta HCs
├─ Day 4-5: Allahabad, Punjab & Haryana HCs
├─ Day 6-7: Remaining 20 HCs (batch implementation)
└─ Day 8-10: Testing + documentation

Week 5-6: Phase 4 (Tribunals)
├─ Day 1-2: NCLT & ITAT adapters
├─ Day 3-4: DRT & NGT adapters
├─ Day 5-6: Consumer adapter + other tribunals
└─ Day 7-10: Testing + integration

Week 7-8: Phase 5 (Production)
├─ Day 1-3: District discovery + sync jobs
├─ Day 4-5: Monitoring & alerting
├─ Day 6-7: Performance optimization
├─ Day 8-9: Production deployment
└─ Day 10: Complete audit + handoff
```

---

## 🎓 WHAT HAPPENS AFTER APPROVAL

1. **Immediate (Day 1):**
   - Update `backend/src/api/cases.ts` (add court_id parameter)
   - Update `frontend/app/page.tsx` (add court selector dropdown)
   - Update `backend/src/ingestion/courtFetch.ts` (add dispatcher)

2. **Days 2-7 (Phase 2):**
   - Complete `ecourtsHCAdapter.ts` implementation
   - Implement `ecourtsDistrictAdapter.ts`
   - Refactor existing code into `delhiHCAdapter.ts`
   - Write 50+ test cases
   - Verify all existing Delhi HC cases still work

3. **Days 8-15 (Phase 3):**
   - Implement 25 HC adapters (specialized logic per court)
   - Research each HC's unique structure
   - Write tests for each
   - Document peculiarities

4. **Days 16-21 (Phase 4):**
   - Implement tribunal adapters (NCLT, ITAT, DRT, NGT, Consumer)
   - Integration tests
   - Performance testing

5. **Days 22-28 (Phase 5):**
   - District auto-discovery
   - Sync jobs setup
   - Monitoring & alerting
   - Production deployment
   - Final audit report

---

## ⏹️ CONFIRMATION NEEDED

**BEFORE I PROCEED, USER MUST APPROVE:**

- [ ] Accept breaking change: `court_id` now required in API?
- [ ] OK to modify frontend (add court selector)?
- [ ] OK to add database columns (`source_court_id`, `adapter_used`)?
- [ ] Proceed with all 5 phases in 2-3 weeks (instead of 32 weeks)?
- [ ] Update process document if anything unclear?

**Please confirm above, then I will:**
1. Show detailed code changes for approval (Week 1 edits)
2. Implement Phase 2 (eCourts adapters)
3. Implement Phases 3-5 (all courts + tribunals)
4. Run complete audit
5. Start the application

---

**STATUS: AWAITING USER APPROVAL** ✋

(Do NOT make changes until user approves all items above)

