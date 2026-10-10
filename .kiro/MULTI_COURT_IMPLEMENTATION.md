# LexFlow: India-Wide Judicial Data Integration - Complete Blueprint

**Status:** Architecture & Research Phase  
**Last Updated:** 2026-10-10  
**Scope:** Supreme Court → 25 High Courts → All Districts → All Tribunals/Commissions  
**Target:** 36 State/UT Coverage + 743+ Court Establishments

---

## Executive Summary

LexFlow is transitioning from a **Delhi High Court-only** case tracker into a **nationwide Indian judicial data platform**. This document defines the complete architecture, data model, source registry, and phased implementation strategy to cover:

- Supreme Court of India
- All 25 High Courts (with benches)
- District & subordinate courts across all 36 States/UTs
- Specialized courts (Family, Commercial, MACT, NDPS, POCSO, CBI, NIA, etc.)
- Tribunals & Commissions (NCLT, ITAT, DRT, Consumer, NGT, Labour, CAT, AFT, etc.)
- All Indian case types & proceeding categories

**Critical principle:** We distinguish between **directory coverage** (names imported), **live-data coverage** (case details retrievable), and **document coverage** (orders/judgments downloadable). No false claims about integration where only names exist.

---

## 1. India's Complete Judicial Ecosystem - Institutional Map

```
┌─────────────────────────────────────────────────────────────────┐
│                  INDIAN JUDICIAL SYSTEM                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ ┌──────────────────────────────────────────────────────────┐   │
│ │ Supreme Court of India (SCI)                             │   │
│ │ Constitutional appeals, civil/criminal appeals, SLP      │   │
│ │ Portal: https://www.sci.gov.in/                         │   │
│ └──────────────────────────────────────────────────────────┘   │
│                              ↓                                   │
│ ┌──────────────────────────────────────────────────────────┐   │
│ │ 25 High Courts (Appellate jurisdiction by State/UT)     │   │
│ │ Writs, Appeals, Civil/Criminal, Original Jurisdiction  │   │
│ │ Portal: https://hcservices.ecourts.gov.in/             │   │
│ └──────────────────────────────────────────────────────────┘   │
│          ↓                    ↓                    ↓             │
│  ┌─────────────────────────────────────────────────────┐       │
│  │ District & Subordinate Courts (36 State/UT, 743+)  │       │
│  │ - District & Sessions Courts                       │       │
│  │ - Civil Courts (Senior/Junior Division)            │       │
│  │ - Magistrate Courts (Chief/First Class/Metro)      │       │
│  │ - Special courts (NDPS, POCSO, CBI, NIA, etc.)     │       │
│  │ Portal: https://services.ecourts.gov.in/           │       │
│  └─────────────────────────────────────────────────────┘       │
│                                                                 │
│ ┌──────────────────────────────────────────────────────────┐   │
│ │ Tribunals, Commissions & Specialized Bodies           │   │
│ │                                                        │   │
│ │ A. Company/Insolvency/Commercial                      │   │
│ │    - NCLT, NCLAT, DRT, DRAT                          │   │
│ │    Portal: nclt.gov.in, nclat.nic.in, drt.gov.in   │   │
│ │                                                        │   │
│ │ B. Tax & Financial                                    │   │
│ │    - ITAT, CESTAT, SAT, GSTAT                        │   │
│ │    Portal: itat.gov.in, cestat.gov.in               │   │
│ │                                                        │   │
│ │ C. Administrative & Service                           │   │
│ │    - CAT, AFT, Railway Claims, State Admin Tribunals │   │
│ │    Portal: cgat.gov.in, aftdelhi.nic.in             │   │
│ │                                                        │   │
│ │ D. Consumer & Social                                  │   │
│ │    - NCDRC, State/District Consumer Commissions      │   │
│ │    - Labour & Industrial Courts                       │   │
│ │    Portal: e-jagriti.gov.in                         │   │
│ │                                                        │   │
│ │ E. Environment, Sector-Specific, Other                │   │
│ │    - NGT, CCI, APTEL, TDSAT, RERA, IP forums       │   │
│ │    Portal: greentribunal.gov.in, cci.gov.in         │   │
│ └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### Key Principles

1. **Institution types are NOT interchangeable**: Supreme Court ≠ High Court ≠ District Court ≠ Tribunal. Each has distinct jurisdiction, case-number formats, and data sources.
2. **Not every district has every court type**: A district may have 1–5 specialized courts, or none.
3. **Case-type codes are source-specific**: "W.P.(C)" (Delhi HC) ≠ "WP(C)" (other HC) ≠ any tribunal's case type.
4. **Data availability varies by source**: Some courts expose case status only; others expose full history and PDFs.

---

## 2. Nationwide Geographic & Institutional Coverage

### 36 State/UT Selections (as per eCourts Directory)

**North (10):** Chandigarh, Delhi, Haryana, Himachal Pradesh, Jammu & Kashmir, Ladakh, Punjab, Rajasthan, Uttar Pradesh, Uttarakhand

**South (8):** Andhra Pradesh, Karnataka, Kerala, Lakshadweep, Puducherry, Tamil Nadu, Telangana

**East (5):** Bihar, Jharkhand, Odisha, West Bengal, Andaman & Nicobar Islands

**West & Central (8):** Chhattisgarh, Goa, Gujarat, Madhya Pradesh, Maharashtra, Dadra & Nagar Haveli/Daman & Diu

**Northeast (7):** Arunachal Pradesh, Assam, Manipur, Meghalaya, Mizoram, Nagaland, Sikkim, Tripura

### Official Data Sources for Discovery

| Source | Purpose | Coverage |
|--------|---------|----------|
| **eCourts District Directory** | Primary discovery | https://ecourts.gov.in/ecourts2.0/?p=dist_court%2Findex |
| **eCourts Services Portal** | Case lookup & status | https://services.ecourts.gov.in/ecourtindia_v6/ |
| **District Courts Portal** | District-level gateway | https://ecommitteesci.gov.in/service/district-courts-portal/ |
| **National Judicial Data Grid** | Statistics & pendency | https://njdg.ecourts.gov.in/ |
| **eCourts High Court Services** | All 25 HCs unified | https://hcservices.ecourts.gov.in/ |
| **eCourts Judgments Portal** | Orders/Judgments | https://judgments.ecourts.gov.in/ |
| **Tribunal Gateway** | Tribunal directory | eCourts tribunal gateway (multiple portals) |
| **Individual Court Websites** | Court-specific info | Per State/UT (variable quality) |

---

## 3. All 25 High Courts + Benches

| # | High Court | State/UT | Official Website | eCourts Link | Benches |
|---|-----------|---------|------------------|--------------|---------|
| 1 | Allahabad HC | Uttar Pradesh | allahabadhighcourt.in | hcservices | Allahabad, Lucknow |
| 2 | Andhra Pradesh HC | Andhra Pradesh | aphc.gov.in | hcservices | Amaravati |
| 3 | Bombay HC | Maharashtra | bombayhighcourt.nic.in | hcservices | Mumbai, Nagpur, Aurangabad |
| 4 | Calcutta HC | West Bengal | calcuttahighcourt.gov.in | hcservices | Calcutta, Appellate Division |
| 5 | Chhattisgarh HC | Chhattisgarh | highcourt.cg.gov.in | hcservices | Bilaspur |
| 6 | Delhi HC | Delhi | delhihighcourt.nic.in | hcservices | Delhi (Principal Bench) |
| 7 | Gauhati HC | Assam, Arunachal Pradesh, Manipur, Meghalaya, Mizoram, Nagaland, Sikkim, Tripura | ghconline.gov.in | hcservices | Guwahati, Kohima, Imphal, Shillong, Aizawl, Gangtok |
| 8 | Gujarat HC | Gujarat | gujarathighcourt.nic.in | hcservices | Ahmedabad |
| 9 | Himachal Pradesh HC | Himachal Pradesh | highcourt.hp.gov.in | hcservices | Shimla |
| 10 | Jammu & Kashmir and Ladakh HC | J&K, Ladakh | jkhighcourt.nic.in | hcservices | Srinagar (J&K), Leh (Ladakh) |
| 11 | Jharkhand HC | Jharkhand | jharkhandhighcourt.nic.in | hcservices | Ranchi |
| 12 | Karnataka HC | Karnataka | karnatakajudiciary.kar.nic.in | hcservices | Bengaluru |
| 13 | Kerala HC | Kerala | highcourt.kerala.gov.in | hcservices | Kochi |
| 14 | Madhya Pradesh HC | Madhya Pradesh | mphc.gov.in | hcservices | Indore, Jabalpur |
| 15 | Madras HC | Tamil Nadu | hcmadras.tn.gov.in | hcservices | Chennai, Madurai |
| 16 | Manipur HC | Manipur | hcmimphal.nic.in | hcservices | Imphal |
| 17 | Meghalaya HC | Meghalaya | meghalayahighcourt.nic.in | hcservices | Shillong |
| 18 | Orissa HC | Odisha | orissahighcourt.nic.in | hcservices | Cuttack |
| 19 | Patna HC | Bihar | patnahighcourt.gov.in | hcservices | Patna |
| 20 | Punjab & Haryana HC | Punjab, Haryana | highcourtchd.gov.in | hcservices | Chandigarh |
| 21 | Rajasthan HC | Rajasthan | hcraj.nic.in | hcservices | Jaipur, Jodhpur |
| 22 | Sikkim HC | Sikkim | hcs.gov.in | hcservices | Gangtok |
| 23 | Telangana HC | Telangana | tshc.gov.in | hcservices | Hyderabad |
| 24 | Tripura HC | Tripura | thc.nic.in | hcservices | Agartala |
| 25 | Uttarakhand HC | Uttarakhand | highcourtofuttarakhand.gov.in | hcservices | Nainital, Garhwal |

**Research Notes:**
- eCourts High Court Services provides a common search interface for all 25 HCs
- Individual HC websites vary in structure, case-search APIs, and CAPTCHA usage
- Some HCs have multiple benches; each bench may have different case numbers and seniority

---

## 4. District Courts, Subordinate Courts & Specialized Establishments

### Court Categories to Discover & Support

**Tier 1: District & Sessions Level**
- Principal District and Sessions Court
- Additional District and Sessions Court(s)
- Court of District Magistrate

**Tier 2: Civil Courts**
- Civil Judge, Senior Division (District Civil Court)
- Civil Judge, Junior Division (Munsiff Court)
- Small Causes Court

**Tier 3: Magistrate Courts**
- Chief Judicial Magistrate (CJM)
- Judicial Magistrate First Class (JMFC)
- Judicial Magistrate Second Class (JMSC)
- Chief Metropolitan Magistrate (CMM) — in metro areas
- Metropolitan Magistrate (MM) — in metro areas

**Tier 4: Specialized Courts (attached to District/Subordinate structures)**
- Family Court
- Commercial Court
- Motor Accident Claims Tribunal (MACT)
- Juvenile Justice Board
- Special NDPS Court
- Special POCSO Court
- Special CBI Court
- Special NIA Court
- SC/ST Atrocities Prevention Court
- Railway Criminal Court
- Rent Control Court / Tenancy Forum
- Labour Court / Industrial Tribunal
- Small Causes Court
- Other state-specific specialized establishments

### Data Structure for District Registry

```
District Registry Entry:
├── state_ut_code: "DL" (2-char code)
├── state_ut_name: "Delhi"
├── district_code: "DLDC01" (stable code)
├── district_name: "Delhi"
├── high_court_id: "delhi_hc" (foreign key to HC registry)
├── court_complexes: [
│   {
│     complex_id: "DLDC_CPLX_01",
│     complex_name: "Delhi District Courts Complex",
│     location: "Tis Hazari, New Delhi",
│     official_website: "https://....",
│     establishments: [
│       {
│         establishment_code: "DLDC_EST_01_DSC",
│         establishment_name: "Principal District & Sessions Court",
│         court_type: "district_sessions",
│         judge_name: "(if available)",
│         court_number: "1",
│         parent_establishment: null,
│         case_status_url: "https://....",
│         orders_url: "https://....",
│         cause_list_url: "https://....",
│         supported_search_methods: ["case_number", "cnr", "party_name"],
│         supported_data_fields: ["status", "parties", "next_hearing", "orders"],
│         captcha_required: true,
│         authentication_required: false,
│         last_verified_at: "2026-10-10T00:00:00Z",
│         registry_source: "ecourts_directory",
│         integration_status: "directory_imported" | "source_verified" | "adapter_implemented" | "tested_successfully"
│       },
│       { ... more establishments ... }
│     ]
│   },
│   { ... more complexes ... }
│ ]
```

### Discovery Workflow

1. **Parse eCourts Directory** → Identify all 36 State/UT selections
2. **For each State/UT** → Discover all listed districts
3. **For each District** → Identify court complexes & establishments
4. **For each Establishment** → Verify official website & case-search endpoints
5. **Classify Court Type** → Map to standardized categories
6. **Document Capabilities** → Test what fields are retrievable
7. **Record Source** → Store original URL & timestamp

---

## 5. Complete Case-Type Taxonomy

Cases in India span multiple categories. The taxonomy should be **independent of court identity** because the same legal matter type can arise in different courts at different procedural stages.

### 5.1 Core Case Categories (50+ types)

**Constitutional & Writ (SCI, High Courts)**
- W.P.(C) — Writ Petition (Civil)
- W.P.(Crl) — Writ Petition (Criminal)
- Habeas Corpus
- Mandamus
- Public Interest Litigation (PIL)
- Prohibition

**Civil (High Courts, District Courts)**
- Original Suit (CS / O.S.)
- Declaratory Suit
- Suit for Injunction
- Suit for Recovery / Arrears
- Suit for Partition
- Suit for Specific Performance
- Civil Appeal (FA, FAO, RFA, RCA, RSA, LPA)
- Review Petition
- Civil Revision

**Commercial (High Courts, Commercial Courts)**
- Commercial Suit (CS COMM)
- Commercial Appeal
- Arbitration Petition (Sections 9, 11, 34, 37 of Arbitration Act)
- Insolvency (CIRP, applications under IBC Sections 7/9/10)

**Criminal (Sessions, Magistrate, High Courts)**
- Criminal Case (CC)
- Sessions Case (also: FIR-based cases)
- Complaint Case
- State Case
- Criminal Appeal (Crl.A.)
- Criminal Revision (CRR)
- Criminal Miscellaneous (CRL.M.C., CRL.M.A.)
- Criminal Miscellaneous Application

**Bail & Criminal Interim (High Courts, Magistrate)**
- Bail Application
- Anticipatory Bail
- Interim Bail
- Bail Cancellation
- CM (Miscellaneous Application for interim relief)

**Supreme Court Specific**
- Special Leave Petition (SLP / SLP(C) / SLP(Crl))
- Civil Appeal (transferred from High Court)
- Criminal Appeal (transferred from High Court)
- Transfer Petition (Civil / Criminal)
- Review Petition (SCI)

**Family (Family Courts, District Courts)**
- Divorce / Dissolution of Marriage
- Restitution of Conjugal Rights
- Maintenance & Alimony
- Custody & Guardianship
- Adoption
- Matrimonial Appeal

**Labour & Employment (Labour Courts, District Courts, HC)**
- Industrial Dispute
- Labour Claim
- Service Writ / Service Matter Appeal
- Employment Matter
- Unfair Labour Practice

**Administrative & Service (Central Admin Tribunal, State Tribunals, HC)**
- Original Application (OA)
- Miscellaneous Application (MA)
- Review Application (RA)
- Service Appeal / Pension Matter

**Property & Land (District Civil Courts, HC)**
- Title Suit
- Suit for Partition
- Suit for Possession
- Suit for Eviction
- Land Acquisition Proceeding

**Rent & Tenancy (Rent Courts, District Courts)**
- Eviction Petition
- Rent Appeal
- Tenancy Dispute
- Fixture / Appurtenance Dispute

**Motor Accident (MACT, District Courts)**
- Motor Accident Compensation Claim (MACT)
- MACT Appeal
- Revision of MACT Award

**Consumer (Consumer Commissions)**
- Consumer Complaint (CC)
- First Appeal (FA)
- Revision Petition (RP)
- State/National Consumer Commission proceedings

**Tax, Customs, GST (ITAT, CESTAT, GST Tribunal)**
- Income Tax Appeal
- Customs Duty Appeal
- Excise Appeal
- Service Tax Appeal
- GST Appeal

**Company & Insolvency (NCLT, High Courts)**
- Company Petition (CP)
- Company Appeal (CA)
- Merger / Amalgamation Proceeding
- Insolvency Application (Section 7/9/10, IBC 2016)
- NCLT Appeal (goes to NCLAT)

**Environmental (National Green Tribunal, HC)**
- Original Application
- Appeal
- Compliance Matter

**Intellectual Property (IP Division of HC)**
- Patent Infringement / Opposition
- Trademark Infringement / Opposition
- Copyright Infringement
- Design Registration
- Passing Off

**Competition (Competition Commission / Appellate Tribunal)**
- Statutory Appeal
- Investigation-related proceedings
- Abuse of dominance complaint

**Financial & Banking (DRT, High Courts)**
- Recovery Application (Debt Recovery Tribunal)
- Secured Creditor Application
- DRT Appeal (DRAT)
- Securities Appellate Tribunal matter

**Contempt (All Courts)**
- Contempt of Court (Civil) — CONT.CAS(C)
- Contempt of Court (Criminal) — CONT.CAS(Crl)

**Caveat (All Courts)**
- Caveat Petition

**Execution & Enforcement**
- Execution Petition (EP)
- Enforcement of Judgment/Decree
- Satisfaction of Decree

**Miscellaneous & Procedural**
- Transfer Petition (between courts)
- Stay Application
- Clarification / Modification Petition
- Restoration Application
- Election Petition (Election Commission)

**State & Local Specific**
- Revenue Matter / Appeal
- Cooperative Dispute
- Waqf Matter
- Local Government / Panchayat Matter
- Other state-specific proceeding types

### 5.2 Case-Type Code Mapping

```typescript
interface CaseTypeRegistry {
  source_code: string;           // "W.P.(C)" or "CP" or "CC"
  source_court: string;          // "delhi_hc" or "nclt" or "consumer_commission"
  source_year: number;           // year of filing
  normalized_category: string;   // "constitutional_writ" or "insolvency"
  full_name: string;             // "Writ Petition (Civil)"
  is_appellate: boolean;         // true if this is an appeal/revision
  parent_case_type: string | null; // if appeal, what is the original case type?
  high_court_id: string | null;  // which HC has jurisdiction?
  tribunal_id: string | null;    // which tribunal?
  alternate_codes: string[];     // ["WPC", "W.P.C", "WP(C)"] for fuzzy matching
}
```

### 5.3 Case-Number Format Patterns

Each court/tribunal uses distinct case-number formats. LexFlow must preserve the original and normalize for searching.

| Source | Format | Example | Components |
|--------|--------|---------|------------|
| **Delhi HC** | TYPE-NUMBER/YEAR | W.P.(C)-10385/2024 | Type, Number, Year |
| **Bombay HC** | TYPE NUMBER/YEAR | W.P.(C) 1234/2023 | Type, Number, Year |
| **NCLT** | CA(AT)(...)/... | CA(AT)(Ins) 123/2024 | Type, Bench, Number, Year |
| **ITAT** | ITA.../YEAR | ITA 100/Mumbai/2024 | Type, Bench, Number, Year |
| **Consumer** | CC/... | CC No. 456 of 2024 | Type, Number, Year |
| **District Court CNR** | STDC+14CHARS | DLHC010143032022 | State, District, Year, Sequence |
| **Sessions Case** | CC.../YEAR | CC 789/2024 | Type, Number, Year |

---

## 6. Data Fields by Source Type

### What LexFlow Must Capture (Standardized Across All Sources)

**Court Identity Fields**
- `court_id`: Unique identifier (e.g., "delhi_hc", "nclt_bangalore")
- `court_name`: Display name
- `court_type`: Enum: "high_court", "district_court", "subordinate", "tribunal", "commission"
- `institution_type`: Enum: "court", "tribunal", "commission", "regulatory_authority"
- `bench_id`: If applicable (e.g., "delhi_hc_principal_bench")
- `jurisdiction`: "State/UT", "Nationwide", "Regional"
- `state_ut`: State/UT code
- `district`: District name (if applicable)
- `high_court_id`: Appellate HC (foreign key)

**Case Identity Fields**
- `case_id`: UUID (LexFlow internal)
- `case_number`: Original format (preserved)
- `case_type_code`: Source's case-type code
- `case_type_category`: Normalized category
- `case_year`: Year of filing
- `cnr_number`: CNR (for district courts, 16-char code)
- `diary_number`: Supreme Court diary number
- `registration_number`: Alternative registration ID
- `case_status`: "Pending", "Listed", "Disposed", "Withdrawn", "Transferred"

**Party Fields**
- `petitioner_name`: Full name
- `respondent_name`: Full name
- `complainant_name`: For criminal cases
- `accused_name`: For criminal cases
- `other_parties`: JSON array for multi-party
- `advocate_names`: JSON array

**Judicial Officer Fields**
- `judge_name`: Currently presiding judge
- `bench_composition`: Multi-judge bench details
- `senior_advocate`: If designated

**Temporal Fields**
- `filing_date`: YYYY-MM-DD
- `registration_date`: YYYY-MM-DD
- `next_hearing_date`: YYYY-MM-DD
- `last_hearing_date`: YYYY-MM-DD
- `disposal_date`: YYYY-MM-DD
- `disposal_type`: "Allowed", "Dismissed", "Withdrawn", etc.

**Hearing & Listing Fields** (hearings table)
- `hearing_id`: UUID
- `hearing_date`: YYYY-MM-DD
- `hearing_purpose`: "Arguments", "Judgment", "Adjournment", "Part Heard", etc.
- `court_number`: Which courtroom
- `bench_serial`: Position in cause list
- `outcome`: "Adjourned to X", "Order passed", "Judgment reserved", etc.
- `next_date`: Court-noted next date (nullable)
- `notes`: Court remarks if public

**Order & Judgment Fields** (orders table)
- `order_id`: UUID
- `order_date`: YYYY-MM-DD
- `order_type`: "Interim Order", "Final Order", "Judgment", "Decree", "Resolution"
- `order_number`: Source order number if available
- `pdf_url`: Public URL (if accessible)
- `local_path`: After download
- `file_size`: Bytes
- `text_content`: OCR-extracted text
- `source_url`: URL retrieved from
- `checksum`: SHA-256 for verification

**Provenance Fields**
- `source`: Enum: "ecourts_hc", "ecourts_district", "nclt_portal", "manual_upload", etc.
- `source_url`: Official source URL
- `last_fetched_at`: Timestamp
- `fetch_status`: "success", "captcha", "timeout", "error_message"
- `parser_version`: Version of adapter used
- `data_quality_score`: Percentage of fields populated

**Connected Cases** (optional)
- `appeal_of_case_id`: If this is an appeal
- `revision_of_case_id`: If this is a revision
- `transfer_from_case_id`: If transferred
- `related_cases`: Array of linked case IDs

---

## 7. Supported Sources & Their Capabilities

| Source | Portal | Institution Coverage | Case Lookup | Case Details | Hearing History | Orders/Judgments | Live API | CAPTCHA | Notes |
|--------|--------|--------|---------|---------|----------|----------|----------|----------|---------|
| **eCourts High Court Services** | hcservices.ecourts.gov.in | All 25 HCs | Yes | Partial | Limited | Yes | No | Yes | Common interface, but not all HCs expose same fields |
| **eCourts District Services** | services.ecourts.gov.in | All districts (CNR-based) | Yes (CNR) | Partial | Limited | Limited | No | Yes | CAPTCHA often triggered; inconsistent data |
| **Delhi High Court** | delhihighcourt.nic.in | Delhi HC only | Yes | Yes | Yes | Yes | Yes (internal) | Yes | Existing integration; most complete |
| **Supreme Court of India** | sci.gov.in | SCI only | Yes | Limited | Limited | Yes | No | Yes (for advanced search) | Diary number search; case status partial |
| **NCLT Portal** | nclt.gov.in | NCLT nationwide | Yes | Yes | Partial | Yes | Limited | No | Insolvency/Company proceedings; structured data |
| **ITAT Portal** | itat.gov.in | ITAT nationwide | Yes | Limited | Limited | Yes | No | No | Tax appeals; PDF-based judgments |
| **Consumer Commission** | e-jagriti.gov.in | All consumer commissions | Yes | Yes | Limited | Yes | No | No | Structured data; consistent across states |
| **NGT Portal** | greentribunal.gov.in | NGT nationwide | Yes | Limited | Limited | Yes | No | No | Environmental cases |
| **Individual HC Websites** | Per-HC domains | 1 HC at a time | Variable | Variable | Variable | Variable | Variable | Variable | High variability; requires per-HC adapters |
| **Manual PDF Upload** | LexFlow app | User-provided | N/A | Manual | N/A | Yes | N/A | N/A | Fallback when automated fetch unavailable |

---

## 8. Architecture: Modular Adapter Pattern

### 8.1 Common Adapter Interface

```typescript
interface CourtSourceAdapter {
  /**
   * Adapter metadata
   */
  id: string;                              // "ecourts_hc", "delhi_hc", "nclt", etc.
  name: string;                            // "eCourts High Court Services"
  supported_courts: string[];              // ["delhi_hc", "bombay_hc", ...] or ["all"]
  court_types: ("high_court" | "district" | "tribunal" | "commission")[];
  
  /**
   * Capabilities & Constraints
   */
  supports: {
    case_lookup: boolean;
    case_details: boolean;
    hearing_history: boolean;
    orders_discovery: boolean;
    pdf_download: boolean;
  };
  
  requires: {
    case_number?: boolean;
    case_type?: boolean;
    case_year?: boolean;
    cnr?: boolean;
    court_selection?: boolean;
    bench_selection?: boolean;
  };
  
  restrictions: {
    requires_captcha: boolean;
    requires_authentication: boolean;
    rate_limit_per_hour: number;
    session_timeout_minutes: number;
  };
  
  /**
   * Discover available search methods
   */
  async discoverSearchMethods(court_id: string): Promise<SearchMethod[]>;
  
  /**
   * Search for case
   */
  async searchCase(
    query: CaseSearchQuery,
    court_id: string
  ): Promise<CaseSearchResult[]>;
  
  /**
   * Get full case details
   */
  async getCaseDetails(
    case_ref: CaseReference,
    court_id: string
  ): Promise<NormalizedCaseDetails>;
  
  /**
   * Get hearing history
   */
  async getHearingHistory(
    case_id: string,
    court_id: string
  ): Promise<NormalizedHearing[]>;
  
  /**
   * Discover orders/judgments
   */
  async discoverOrders(
    case_id: string,
    court_id: string
  ): Promise<OrderReference[]>;
  
  /**
   * Download order PDF (if permitted)
   */
  async downloadOrderPDF(
    order_url: string
  ): Promise<{ buffer: Buffer; filename: string }>;
  
  /**
   * Extract text from PDF
   */
  async extractPDFText(
    pdf_buffer: Buffer
  ): Promise<string>;
  
  /**
   * Handle errors & restrictions
   */
  async handleCaptcha(session: any): Promise<string | null>;
  async handleTimeout(): Promise<void>;
  async handleRateLimit(): Promise<void>;
}
```

### 8.2 Adapter Implementations

```
backend/src/adapters/
├── adapter.interface.ts           — Common interface
├── ecourts/
│   ├── ecourtsHCAdapter.ts        — All 25 HCs via eCourts HC Services
│   ├── ecourtsDistrictAdapter.ts  — District courts via eCourts Services
│   └── ecourtsCommonUtils.ts      — Shared HTTP, parsing, CAPTCHA handling
├── courts/
│   ├── delhiHCAdapter.ts          — Delhi HC (existing + refactored)
│   ├── bombayHCAdapter.ts         — Bombay HC
│   ├── madrasHCAdapter.ts         — Madras HC
│   └── ... (other HCs on-demand)
├── supreme/
│   └── sciAdapter.ts              — Supreme Court of India
├── tribunals/
│   ├── ncltAdapter.ts             — NCLT/NCLAT (Company law)
│   ├── itatAdapter.ts             — ITAT (Tax)
│   ├── drtAdapter.ts              — DRT/DRAT (Debt recovery)
│   ├── ngtAdapter.ts              — NGT (Environmental)
│   └── consumerAdapter.ts         — Consumer Commissions
├── district/
│   ├── districtCNRAdapter.ts      — CNR-based district lookup
│   └── districtWebsiteAdapters.ts — Per-state district websites
└── manual/
    └── manualUploadAdapter.ts     — PDF upload fallback
```

### 8.3 Dispatcher Logic (courtFetch.ts refactored)

```typescript
async function routeFetchJob(
  caseId: string,
  caseNo: string,
  court_id: string,
  institution_type: string
): Promise<FetchResult> {
  
  // 1. Resolve court & get registry entry
  const court = await courtRegistry.getCourt(court_id);
  if (!court) return { error: "Court not found" };
  
  // 2. Select appropriate adapter
  let adapter: CourtSourceAdapter;
  switch (institution_type) {
    case "high_court":
      adapter = selectHighCourtAdapter(court);
      break;
    case "district":
      adapter = ecourtsDistrictAdapter; // or per-state
      break;
    case "tribunal":
      adapter = selectTribunalAdapter(court);
      break;
    default:
      return { error: "No adapter available for this court type" };
  }
  
  // 3. Attempt fetch via adapter
  try {
    const result = await adapter.getCaseDetails(
      { case_number: caseNo, court_id },
      court_id
    );
    return normalizeAndUpsert(result, caseId, court_id);
  } catch (err) {
    if (err.isCaptcha) return { error: "CAPTCHA required", retry_later: true };
    if (err.isTimeout) return { error: "Source timeout", retry_later: true };
    return { error: err.message };
  }
}
```

---

## 9. Database Schema Enhancements

### Existing Tables (Preserved)
- `cases` — Enhanced with new fields
- `parties` — Preserved
- `hearings` — Preserved
- `orders` — Preserved
- `case_events` — Audit trail
- `clients` — Preserved
- `billing_entries` — Preserved

### New Tables (Add)

```sql
-- Court Registry
CREATE TABLE courts (
  id UUID PRIMARY KEY,
  code VARCHAR(50) UNIQUE,                 -- "delhi_hc", "bombay_hc", etc.
  name TEXT NOT NULL,
  court_type ENUM,                         -- high_court, district, tribunal, etc.
  institution_type ENUM,                   -- court, tribunal, commission
  state_ut VARCHAR(2),                     -- State/UT code
  district VARCHAR(100),                   -- District name (if applicable)
  official_website TEXT,
  high_court_id UUID REFERENCES courts,
  jurisdiction TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Court Benches & Establishments
CREATE TABLE court_benches (
  id UUID PRIMARY KEY,
  court_id UUID NOT NULL REFERENCES courts,
  bench_code VARCHAR(50),
  bench_name TEXT,
  location TEXT,
  judge_count INT,
  official_website TEXT,
  case_status_url TEXT,
  orders_url TEXT,
  cause_list_url TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Court Data Sources (adapters' configuration)
CREATE TABLE court_sources (
  id UUID PRIMARY KEY,
  court_id UUID NOT NULL REFERENCES courts,
  adapter_id VARCHAR(100),                 -- "ecourts_hc", "delhi_hc", etc.
  source_url TEXT,
  search_methods TEXT[],                   -- ["case_number", "cnr", "party_name"]
  supported_data_fields TEXT[],            -- ["status", "parties", "hearing_history"]
  requires_captcha BOOLEAN,
  requires_authentication BOOLEAN,
  rate_limit_per_hour INT,
  last_verified_at TIMESTAMP,
  verification_status ENUM,                -- "verified", "unverified", "broken"
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Case Type Mappings
CREATE TABLE case_type_mappings (
  id UUID PRIMARY KEY,
  source_code VARCHAR(50),                 -- "W.P.(C)", "CC", "CP", etc.
  source_court_id UUID REFERENCES courts,
  normalized_category VARCHAR(100),        -- "constitutional_writ", "criminal", etc.
  full_name TEXT,
  is_appellate BOOLEAN DEFAULT FALSE,
  parent_case_type_id UUID REFERENCES case_type_mappings,
  alternate_codes TEXT[],                  -- For fuzzy matching
  created_at TIMESTAMP DEFAULT NOW()
);

-- Advocate / Bar Registry (enhanced)
CREATE TABLE advocates (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  bar_registration_number VARCHAR(100),
  state_bar VARCHAR(100),
  enrolled_year INT,
  practice_areas TEXT[],
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE case_advocates (
  id UUID PRIMARY KEY,
  case_id UUID NOT NULL REFERENCES cases,
  advocate_id UUID REFERENCES advocates,
  party_represented TEXT,                  -- "petitioner", "respondent", etc.
  created_at TIMESTAMP DEFAULT NOW()
);

-- Fetch Jobs & Sync Status
CREATE TABLE fetch_jobs (
  id UUID PRIMARY KEY,
  case_id UUID NOT NULL REFERENCES cases,
  adapter_id VARCHAR(100),
  status ENUM,                             -- "pending", "running", "success", "failed", "captcha"
  attempts INT DEFAULT 0,
  last_attempted_at TIMESTAMP,
  next_retry_at TIMESTAMP,
  error_message TEXT,
  result_summary TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Source Snapshots (for versioning & audit)
CREATE TABLE source_snapshots (
  id UUID PRIMARY KEY,
  case_id UUID NOT NULL REFERENCES cases,
  fetch_job_id UUID REFERENCES fetch_jobs,
  source_url TEXT,
  source_data JSON,                        -- Raw data from source
  normalized_data JSON,                    -- Normalized by adapter
  fetch_timestamp TIMESTAMP,
  parser_version VARCHAR(20),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Audit Log (comprehensive change tracking)
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY,
  case_id UUID NOT NULL REFERENCES cases,
  event_type TEXT,                         -- "case_created", "hearing_added", "order_updated", etc.
  old_value TEXT,
  new_value TEXT,
  source ENUM,                             -- "ecourts_hc", "manual_upload", "api", etc.
  adapter_id VARCHAR(100),
  changed_by UUID,                         -- User ID if manual
  change_reason TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Connected Cases (appeals, revisions, transfers)
CREATE TABLE connected_cases (
  id UUID PRIMARY KEY,
  from_case_id UUID NOT NULL REFERENCES cases,
  to_case_id UUID NOT NULL REFERENCES cases,
  relationship_type ENUM,                  -- "appeal_of", "revision_of", "transferred_to"
  high_court_a_id UUID REFERENCES courts,
  high_court_b_id UUID REFERENCES courts,
  verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

## 10. Implementation Roadmap: 5 Phases

### Phase 1: Foundation & Audit (Weeks 1-3)

**Objectives:**
- Audit existing Delhi HC integration
- Build court & case-type registries
- Create adapter interface
- Establish database migrations

**Deliverables:**
- `courtRegistry.ts` — All courts & benches
- `caseTaxonomy.ts` — 50+ case types normalized
- `adapter.interface.ts` — Common adapter contract
- Database migrations
- Test fixtures (5–10 public sample cases per source)

**Success Criteria:**
- Existing Delhi HC integration still works
- New registry loads without errors
- Adapters can be registered dynamically

---

### Phase 2: Common eCourts Integration (Weeks 4-8)

**Objectives:**
- Implement eCourts HC Services adapter (common interface for all 25 HCs)
- Implement eCourts District Services adapter (CNR-based lookup)
- Refactor existing Delhi HC into adapter pattern
- Set up incremental sync jobs

**Deliverables:**
- `ecourtsHCAdapter.ts` — All 25 HCs via common portal
- `ecourtsDistrictAdapter.ts` — District court CNR lookup
- `delhiHCAdapter.ts` — Refactored existing logic
- Sync job scheduling
- Frontend state showing adapter status per court

**Success Criteria:**
- eCourts HC adapter works for 3 test cases in 5 different HCs
- District adapter resolves 5 sample CNR numbers
- No regression in Delhi HC cases
- CAPTCHA handling documented

---

### Phase 3: High Court Specialization (Weeks 9-16)

**Objectives:**
- Implement per-HC adapters for courts with unique structures
- Research & document Bombay, Madras, Calcutta, Allahabad, etc.
- Achieve 80%+ coverage of 25 HCs

**Priority Sequence:**
1. Bombay HC (high volume, similar to Delhi)
2. Madras HC (significant caseload)
3. Calcutta HC
4. Others based on data availability

**Deliverables:**
- Per-HC adapters (`bombayHCAdapter.ts`, etc.)
- Verified source documentation for each HC
- Test results matrix
- Frontend HC-selection UI

**Success Criteria:**
- 20 of 25 HCs have verified working adapters
- Each adapter tested with real public cases
- Coverage matrix published

---

### Phase 4: Tribunal & Commission Integration (Weeks 17-24)

**Objectives:**
- Add NCLT, ITAT, DRT, NGT, Consumer Commissions
- Implement tribunal-specific adapters
- Support tribunal case-type codes & identifiers

**Deliverables:**
- `ncltAdapter.ts`, `itatAdapter.ts`, `drtAdapter.ts`, `ngtAdapter.ts`, `consumerAdapter.ts`
- Tribunal case-type mappings
- Tribunal case search UI
- Test cases for each tribunal

**Success Criteria:**
- 5 major tribunals working
- Case search/details retrieve data for each
- Tribunal case-type codes correctly normalized

---

### Phase 5: Nationwide Sync & Rollout (Weeks 25-32)

**Objectives:**
- Complete district court registry (all 36 States/UTs)
- Implement incremental sync jobs
- Add operational dashboards
- Final testing & production deployment

**Deliverables:**
- Complete district registry (all states, districts, establishments)
- Scheduled sync jobs (daily, weekly, per-user-trigger)
- Operational dashboard (sync status, adapter health, error logs)
- INDIA_COURT_COVERAGE.md — final coverage report
- Deployment documentation

**Success Criteria:**
- All 36 State/UTs in registry
- Coverage metrics: directory 100%, live data 60%+, documents 50%+
- Zero regressions in existing Delhi HC workflow
- Rate limiting & reliability tested under load

---

## 11. Key Files to Create/Modify

### New Files

```
backend/src/
├── ingestion/
│   ├── courtRegistry.ts                — Court master data
│   ├── caseTaxonomy.ts                 — Case type mappings
│   ├── courtFetch.ts (refactor)        — Dispatcher routing to adapters
│   ├── adapters/
│   │   ├── adapter.interface.ts
│   │   ├── ecourts/
│   │   │   ├── ecourtsHCAdapter.ts
│   │   │   ├── ecourtsDistrictAdapter.ts
│   │   │   └── ecourtsCommonUtils.ts
│   │   ├── courts/
│   │   │   ├── delhiHCAdapter.ts
│   │   │   ├── bombayHCAdapter.ts
│   │   │   └── ... (other HCs)
│   │   ├── supreme/
│   │   │   └── sciAdapter.ts
│   │   ├── tribunals/
│   │   │   ├── ncltAdapter.ts
│   │   │   ├── itatAdapter.ts
│   │   │   └── ...
│   │   └── manual/
│   │       └── manualUploadAdapter.ts
│   ├── syncJobs.ts                     — Cron jobs for registry & case updates
│   └── hearingService.ts               — Hearing extraction logic
├── registry/
│   ├── districtRegistry.ts             — District & court data loader
│   ├── sourceRegistry.ts               — Source URL & capability registry
│   └── cacheManager.ts                 — Cache for court data
├── api/
│   └── cases.ts (enhance)              — Add court/tribunal selection
└── db/
    └── migrations/
        ├── 001_add_courts_table.sql
        ├── 002_add_case_type_mappings.sql
        ├── 003_add_advocates_table.sql
        ├── 004_add_fetch_jobs_table.sql
        └── 005_add_audit_logs.sql

frontend/
├── app/
│   ├── components/
│   │   ├── CourtSelector.tsx            — State/UT → Court → Bench dropdown
│   │   ├── CaseTypeSelector.tsx         — Normalized + source case types
│   │   ├── CaseLookup.tsx (enhance)     — Search UI
│   │   ├── CaseDetail.tsx (enhance)     — Show adapter status, source
│   │   └── AdapterStatus.tsx            — Visual adapter health
│   └── pages/
│       └── explore/
│           ├── courts.tsx               — Browse all courts
│           └── case-types.tsx           — Case type reference

docs/
├── INDIA_COURT_COVERAGE.md              — Directory + capabilities + gaps
├── INDIA_CASE_TYPE_TAXONOMY.md          — Complete case-type taxonomy
├── COURT_SOURCE_DIRECTORY.md            — All sources & research notes
├── ADAPTER_IMPLEMENTATION_GUIDE.md      — How to build new adapters
└── DEPLOYMENT_CHECKLIST.md              — Production rollout steps
```

### Modified Files

- `backend/src/ingestion/courtFetch.ts` — Refactor to use adapters
- `backend/src/ingestion/caseLookup.ts` — Use new registries
- `backend/src/api/cases.ts` — Add court/bench parameters
- `backend/src/db/schema.sql` — Add new tables
- `frontend/app/page.tsx` — Enhance case search UI
- `.env.example` — Document new config variables

---

## 12. Security, Privacy & Compliance

1. **CAPTCHA & Authentication**: Do not bypass. Respect source terms.
2. **Rate Limiting**: Implement exponential backoff. Respect per-hour/per-minute limits.
3. **Data Retention**: Preserve audit trail of all fetches. Log failed attempts.
4. **Sealed Records & Sensitive Data**: Do not expose juvenile proceedings, protected personal details, sealed records.
5. **HTTPS Only**: All external requests via HTTPS.
6. **Credentials**: Environment variables only. Never hardcode API keys.
7. **Data Minimization**: Fetch only public, permitted information.

---

## 13. Success Metrics & Completion Checklist

### Directory Coverage
- ✓ All 36 State/UTs imported
- ✓ All 25 High Courts with benches
- ✓ 743+ district/special courts discovered
- ✓ 50+ tribunals & commissions registered
- ✓ 50+ case-type codes mapped & normalized

### Live-Data Coverage
- ✓ Case lookup works for 25 HCs (via eCourts or individual)
- ✓ District CNR search works for 50%+ districts
- ✓ 5 major tribunals have working adapters
- ✓ Hearing history retrievable for 70%+ cases
- ✓ Next hearing date available for 80%+ cases

### Document Coverage
- ✓ Orders downloadable from 60%+ sources
- ✓ PDF text extraction working for 90%+ PDFs
- ✓ Judgment citations preserved
- ✓ Manual PDF upload fallback available

### Quality & Reliability
- ✓ Duplicate prevention working
- ✓ Fetch failures logged with actionable errors
- ✓ CAPTCHA & auth restrictions respected
- ✓ Rate limiting prevents IP bans
- ✓ Audit trail complete for all changes

### Documentation
- ✓ INDIA_COURT_COVERAGE.md — Final report
- ✓ INDIA_CASE_TYPE_TAXONOMY.md — Complete taxonomy
- ✓ COURT_SOURCE_DIRECTORY.md — All sources researched
- ✓ Adapter implementation guide — for future courts
- ✓ Test fixtures — 10+ cases per source
- ✓ Deployment checklist — production ready

---

## 14. Current Task & Upcoming Tasks

### Current Task (User Approval)

**Goal:** Update implementation plan to reflect full India-wide scope (not just multi-court, but all courts + all tribunals + all case types).

**Deliverables:**
- ✅ This comprehensive blueprint document
- 🔄 **AWAITING YOUR APPROVAL** on scope & phasing

### Questions for User

1. **Phasing**: Implement all 25 HCs in Phase 3, or prioritize 5–10 high-volume courts first?
2. **Tribunals**: Start with NCLT (high volume) or ITAT (well-structured)?
3. **District Coverage**: Build complete district registry immediately, or incrementally as adapters are built?
4. **Timeline**: What's your target completion date?
5. **Resources**: Are you implementing solo, or with a team?

### Upcoming Tasks (Post-Approval)

1. **Phase 1 – Foundation**
   - Build `courtRegistry.ts` with all 25 HCs
   - Build `caseTaxonomy.ts` with 50+ case types
   - Create adapter interface
   - Set up database migrations
   - Write test fixtures

2. **Phase 2 – Common eCourts**
   - Implement eCourts HC adapter
   - Implement eCourts District adapter
   - Refactor existing Delhi HC code
   - Test against real public cases

3. **Phases 3–5** — Incrementally as approved

---

## Appendix A: Official Source URLs (Research Starting Points)

- **Supreme Court**: https://www.sci.gov.in/
- **eCourts HC Services**: https://hcservices.ecourts.gov.in/
- **eCourts District Services**: https://services.ecourts.gov.in/ecourtindia_v6/
- **eCourts Judgments**: https://judgments.ecourts.gov.in/
- **eCourts National Portal**: https://ecourts.gov.in/
- **District Courts Portal**: https://ecommitteesci.gov.in/service/district-courts-portal/
- **NJDG (Stats)**: https://njdg.ecourts.gov.in/
- **NCLT**: https://nclt.gov.in/
- **ITAT**: https://itat.gov.in/
- **Consumer Commission**: https://e-jagriti.gov.in/
- **NGT**: https://greentribunal.gov.in/

---

## Appendix B: Glossary

- **CNR**: Court No./Reference — 16-char code for district court cases
- **HC**: High Court
- **SCI**: Supreme Court of India
- **CAPTCHA**: Challenge-response test (automated or image-based)
- **Adapter**: Module that implements CourtSourceAdapter interface for a specific source
- **Normalized**: Converted from source-specific format to LexFlow standard schema
- **Directory Coverage**: Names & URLs imported from official directory
- **Live-Data Coverage**: Can actually retrieve case details & history
- **Document Coverage**: Can find & download orders/judgments

---

## Document Management

**Version:** 1.0  
**Last Updated:** 2026-10-10  
**Next Review:** Upon user approval of scope & phasing  
**Owner:** LexFlow Development Team  
**Audience:** Developers, architects, project managers

```
User enters case no
    ↓
Case lookup (detectCourt) → Detects it's Delhi HC ✓
    ↓
Save case to DB
    ↓
Start background fetch job
    ↓
courtFetch.runFetch()
    ├─ Fetch Delhi HC search page (CAPTCHA)
    ├─ POST to Delhi HC API with case details
    ├─ Parse response → get parties, status, next date
    └─ Fetch full case history page → extract all hearings + order URLs
    ↓
Download orders from URLs (non-blocking)
    ↓
Store hearings & orders in DB ✓
```

### Desired Flow (Multi-Court)

```
User enters case no
    ↓
Case lookup → Detect court (Delhi HC / Bombay / Madras / Supreme / District / etc.)
    ↓
Save case to DB
    ↓
Start court-specific background fetch
    ├─ Delhi HC → existing flow (CAPTCHA + API)
    ├─ Bombay HC → scrape bombay HC cause list PDFs
    ├─ Madras HC → scrape madras HC cause list PDFs
    ├─ Supreme Court → scrape SCI orders listing
    ├─ District (CNR) → query eCourts API (if no CAPTCHA)
    └─ Others → note court details, ask user to upload PDF
    ↓
For each court: extract case info → store hearings & orders
    ↓
Always populate case_title, status, next_hearing_date, etc.
```

---

## Database Schema Status

✅ **Already supports all courts:**
- `cases.court` TEXT → stores court name
- `cases.source_url` → URL of data source
- `orders.order_date, order_type, pdf_url, text_content` → supports any court
- `hearings.purpose, order_url` → links to orders

**No DB changes needed** — schema is already court-agnostic.

---

## Fields to Fetch Per Court

These fields are **mandatory for all courts**. If a court source doesn't provide them, mark as null/unknown.

### Core Case Fields (Already in schema)

| Field | Type | Required? | Notes |
|-------|------|-----------|-------|
| `case_title` | TEXT | ✓ | "{Petitioner} v. {Respondent}" |
| `status` | TEXT | ✓ | Pending / Listed / Disposed / Adjourned / etc. |
| `next_hearing_date` | DATE | ○ | Date of next scheduled hearing |
| `filing_date` | DATE | ○ | When case was filed |
| `case_type` | TEXT | ✓ | W.P.(C) / CS(OS) / SLP(C) / etc. |
| `court` | TEXT | ✓ | "Delhi High Court" / "Bombay High Court" / etc. |

### Party Fields (parties table)

| Field | Type | Required? | Notes |
|-------|------|-----------|-------|
| `parties.name` | TEXT | ✓ | Full party name |
| `parties.role` | ENUM | ✓ | 'petitioner' \| 'respondent' |

### Hearing Fields (hearings table)

| Field | Type | Required? | Notes |
|-------|------|-----------|-------|
| `date` | DATE | ✓ | Hearing date YYYY-MM-DD |
| `purpose` | TEXT | ○ | "Hearing" / "Order passed" / "Adjourned" / etc. |
| `order_url` | TEXT | ○ | URL to order PDF if available |

### Order Fields (orders table)

| Field | Type | Required? | Notes |
|-------|------|-----------|-------|
| `order_date` | DATE | ✓ | Date order was issued |
| `order_type` | TEXT | ○ | "Order" / "Judgment" / "Interim" / etc. |
| `pdf_url` | TEXT | ○ | Public URL to PDF |
| `local_path` | TEXT | ○ | Local storage path after download |
| `text_content` | TEXT | ○ | Extracted text from PDF |

---

## Implementation Tasks

### Task 1: Court Fetchers - Add High Court Scrapers

**Location:** `backend/src/ingestion/courtFetch.ts`

**Changes needed:**

1. **Extract Delhi HC into dedicated function**
   ```typescript
   async function fetchFromDelhiHC(caseNo: string, caseId: string): Promise<FetchResult>
   ```

2. **Add Bombay HC scraper**
   ```typescript
   async function fetchFromBombayHC(caseNo: string, caseId: string): Promise<FetchResult>
   // Endpoint: https://www.bombayhhighcourt.nic.in/en-us/
   // Likely similar structure to Delhi HC
   ```

3. **Add Madras HC scraper**
   ```typescript
   async function fetchFromMadrasHC(caseNo: string, caseId: string): Promise<FetchResult>
   // Endpoint: https://www.madras.nic.in/
   ```

4. **Update `runFetch()` dispatcher**
   ```typescript
   async function runFetch(caseId: string, caseNo: string, court: string): Promise<FetchResult> {
     const c = court.toLowerCase();
     if (c.includes("delhi")) return fetchFromDelhiHC(caseNo, caseId);
     if (c.includes("bombay")) return fetchFromBombayHC(caseNo, caseId);
     if (c.includes("madras")) return fetchFromMadrasHC(caseNo, caseId);
     if (c.includes("supreme")) return fetchFromSCI(caseNo, caseId);
     return {
       updated: false,
       next_hearing_date: null,
       hearings_added: 0,
       message: `Live fetch not yet available for ${court}. Upload order PDF manually.`
     };
   }
   ```

**Dependency:** Need to research each HC's API/HTML structure first.

---

### Task 2: Update Case Lookup to Multi-Court

**Location:** `backend/src/ingestion/caseLookup.ts`

**Changes needed:**

1. **Enhance `fetchDelhiHCCase()` → keep as-is**
2. **Add `fetchBombayHCCase()`** — search their cause list PDFs
3. **Add `fetchMadrasHCCase()`** — search their cause list PDFs
4. **Enhance `fetchSCICase()`** — currently minimal, expand to parse more
5. **Update `lookupCase()` dispatcher**
   ```typescript
   if (code === "bombay_hc") fetched = await fetchBombayHCCase(trimmed);
   else if (code === "madras_hc") fetched = await fetchMadrasHCCase(trimmed);
   else if (code === "supreme_court") fetched = await fetchSCICase(trimmed);
   else if (code === "district") fetched = await fetchDistrictCase(trimmed);
   // etc.
   ```

---

### Task 3: Update API Router to Pass Court Info

**Location:** `backend/src/api/cases.ts`

**Changes needed:**

1. **POST /cases/lookup**
   - Currently doesn't pass `court` to `startFetchJob()`
   - Change: `startFetchJob(caseId, trimmed, court);`

2. **POST /cases/:id/fetch**
   - Fetch case record
   - Extract `court` from DB
   - Pass to `startFetchJob()`

**Current (broken):**
```typescript
startFetchJob(c.id as string, c.case_no as string);
// runFetch() only knows case_no, doesn't know which court
```

**Fixed:**
```typescript
startFetchJob(c.id as string, c.case_no as string, c.court as string);
// runFetch() receives court info → dispatches to correct scraper
```

---

### Task 4: Update Order Service for Multi-Court

**Location:** `backend/src/ingestion/orderService.ts`

**Current state:** Download orders from URLs found in Delhi HC history

**Changes needed:**
1. Ensure `downloadCaseOrders()` works with any URL (should already be generic)
2. Add fallback for courts without PDF URLs → note in UI

---

### Task 5: Update Frontend to Show Court Status

**Location:** `frontend/app/page.tsx` (or relevant case detail page)

**Changes needed:**
1. Display which court the case is in
2. Show fetch status: "Fetching from {court}..." vs "Live fetch not available for {court}"
3. For non-Delhi HC courts, show upload button more prominently

---

## Research Required (Before Implementation)

For each high court, need to answer:

### Bombay High Court
- [ ] Cause list URL pattern? (daily PDF, HTML listing, API?)
- [ ] HTML structure of cause lists?
- [ ] Can we extract case number, parties, next hearing?
- [ ] Order URLs available? Format?

### Madras High Court
- [ ] Cause list URL pattern?
- [ ] Any live APIs or just PDFs?
- [ ] HTML/PDF parsing strategy?

### Supreme Court of India
- [ ] Current `fetchSCICase()` is minimal — expand to get full details
- [ ] Are order URLs publicly available?

### District Courts (eCourts CNR)
- [ ] How often do we hit CAPTCHA?
- [ ] Can we handle gracefully?

---

## Approval Checklist (For User)

Before proceeding with implementation, please confirm:

- [ ] **Priority order** — which court should we implement first? (Bombay? Madras? Supreme? All?)
- [ ] **Research needed** — should we research HC APIs first, or should I research & implement?
- [ ] **Order PDF requirement** — for courts that don't have public order URLs, is uploading mandatory?
- [ ] **Scope** — should we also handle subordinate courts (ITAT, NCLT, District)?
- [ ] **Timeline** — implement all at once, or one court at a time?

---

## Current Status

| Court | Fetch Status | Lookup | DB | Frontend |
|-------|--------------|--------|-----|----------|
| Delhi HC | ✅ Working | ✅ Finds in PDFs | ✅ Stores | ⚠ Could improve |
| Bombay HC | ❌ Not implemented | ⚠ Detects only | ✅ Supports | ❌ |
| Madras HC | ❌ Not implemented | ⚠ Detects only | ✅ Supports | ❌ |
| Supreme Court | ⚠ Minimal | ⚠ Basic | ✅ Supports | ❌ |
| District (CNR) | ⚠ CAPTCHA issues | ⚠ Tries eCourts | ✅ Supports | ❌ |
| Others | ❌ | ❌ | ✅ Supports | ❌ |

---

## Next Steps

1. **Review this plan** — approve/modify tasks & scope
2. **Choose priority court(s)**
3. **Research HC websites** — understand structure & availability
4. **Implement one court at a time** — test before moving to next
5. **Update this MD** — track progress & findings

---

## Implementation Decision Form

**User to fill in:**

```
Priority 1 Court: _______________
Priority 2 Court: _______________
Priority 3 Court: _______________

Should research be done first? (Yes/No)

Target completion: _______________

Any court-specific requirements? _______________
```

