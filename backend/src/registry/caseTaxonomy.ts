/**
 * Case Taxonomy - Normalized case categories across all Indian courts
 * 
 * Maps source-specific case-type codes (e.g., "W.P.(C)", "CP", "ITA")
 * to normalized categories (e.g., "constitutional_writ", "insolvency", "tax_appeal")
 * 
 * Preserves original case type for accuracy while enabling cross-court search & analytics.
 */

export type NormalizedCategory =
  | "constitutional_writ"
  | "civil_suit"
  | "civil_appeal"
  | "commercial_dispute"
  | "criminal_case"
  | "criminal_appeal"
  | "criminal_revision"
  | "criminal_miscellaneous"
  | "bail"
  | "family"
  | "matrimonial_appeal"
  | "property_land"
  | "rent_tenancy"
  | "labour_employment"
  | "administrative_service"
  | "motor_accident"
  | "consumer"
  | "tax_customs_gst"
  | "company_insolvency"
  | "arbitration"
  | "environmental"
  | "intellectual_property"
  | "banking_debt_recovery"
  | "contempt"
  | "caveat"
  | "execution_enforcement"
  | "transfer_petition"
  | "election"
  | "public_interest_litigation"
  | "other";

export interface CaseTypeMapping {
  id: string;                              // UUID
  source_code: string;                     // "W.P.(C)", "CS", "CC", "CP", etc.
  source_court_code: string;               // "delhi_hc", "nclt", "supreme_court", etc.
  normalized_category: NormalizedCategory;
  full_name: string;                       // Human-readable: "Writ Petition (Civil)"
  is_appellate: boolean;
  parent_case_type?: string;               // If appellate: what's the original? "W.P.(C)" if this is appeal
  alternate_codes: string[];               // ["WPC", "W.P.C", "WP(C)"] for fuzzy matching
  case_number_format?: string;             // Regex or pattern: "TYPE-NUMBER/YEAR"
  jurisdiction?: "high_court" | "district" | "tribunal" | "commission";
  notes?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// CONSTITUTIONAL & WRIT (SCI, High Courts)
// ─────────────────────────────────────────────────────────────────────────────

export const constitutionalWritCases: CaseTypeMapping[] = [
  {
    id: "wpc_delhi",
    source_code: "W.P.(C)",
    source_court_code: "delhi_hc",
    normalized_category: "constitutional_writ",
    full_name: "Writ Petition (Civil)",
    is_appellate: false,
    alternate_codes: ["WPC", "W.P.C", "WP(C)", "writ petition civil"],
    case_number_format: "W.P.(C)-NUMBER/YEAR",
    jurisdiction: "high_court",
    notes: "Primary writ for civil remedies; habeas corpus, mandamus, certiorari, prohibition, quo warranto.",
  },
  {
    id: "wpcrl_delhi",
    source_code: "W.P.(CRL)",
    source_court_code: "delhi_hc",
    normalized_category: "constitutional_writ",
    full_name: "Writ Petition (Criminal)",
    is_appellate: false,
    alternate_codes: ["WPCRL", "W.P.(CRL)", "WP(CRL)"],
    case_number_format: "W.P.(CRL)-NUMBER/YEAR",
    jurisdiction: "high_court",
    notes: "Criminal remedies; used in criminal matters for HC jurisdiction.",
  },
  {
    id: "pil",
    source_code: "PIL",
    source_court_code: "delhi_hc",
    normalized_category: "public_interest_litigation",
    full_name: "Public Interest Litigation",
    is_appellate: false,
    alternate_codes: ["Public Interest Litigation", "PIL Writ"],
    jurisdiction: "high_court",
    notes: "Filed by any public-spirited person; does not require direct personal interest.",
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// CIVIL SUITS & APPEALS (District Courts, High Courts)
// ─────────────────────────────────────────────────────────────────────────────

export const civilCases: CaseTypeMapping[] = [
  {
    id: "cs",
    source_code: "CS",
    source_court_code: "delhi_hc",
    normalized_category: "civil_suit",
    full_name: "Civil Suit / Original Suit",
    is_appellate: false,
    alternate_codes: ["OS", "Civil Suit", "Original Suit"],
    case_number_format: "CS-NUMBER/YEAR or OS-NUMBER/YEAR",
    jurisdiction: "high_court",
    notes: "Civil disputes: contracts, property, declarations, injunctions, recovery.",
  },
  {
    id: "fao",
    source_code: "FAO",
    source_court_code: "delhi_hc",
    normalized_category: "civil_appeal",
    full_name: "First Appeal from Order (OS)",
    is_appellate: true,
    parent_case_type: "CS",
    alternate_codes: ["FAO(OS)", "First Appeal"],
    case_number_format: "FAO(OS)-NUMBER/YEAR",
    jurisdiction: "high_court",
    notes: "Appeal against district court judgment in original suit.",
  },
  {
    id: "rfa",
    source_code: "RFA",
    source_court_code: "delhi_hc",
    normalized_category: "civil_appeal",
    full_name: "Regular First Appeal",
    is_appellate: true,
    parent_case_type: "CS",
    alternate_codes: ["RFA(OS)", "Regular First Appeal"],
    case_number_format: "RFA(OS)-NUMBER/YEAR",
    jurisdiction: "high_court",
  },
  {
    id: "rca",
    source_code: "RCA",
    source_court_code: "delhi_hc",
    normalized_category: "civil_appeal",
    full_name: "Second Appeal",
    is_appellate: true,
    alternate_codes: ["Regular Second Appeal"],
  },
  {
    id: "lpa",
    source_code: "LPA",
    source_court_code: "delhi_hc",
    normalized_category: "civil_appeal",
    full_name: "Letters Patent Appeal",
    is_appellate: true,
    alternate_codes: ["Letters Patent", "LPA Appeal"],
    jurisdiction: "high_court",
    notes: "Intra-HC appeal against single-judge HC order.",
  },
  {
    id: "rsa",
    source_code: "RSA",
    source_court_code: "delhi_hc",
    normalized_category: "civil_appeal",
    full_name: "Regular Second Appeal",
    is_appellate: true,
    alternate_codes: [],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// COMMERCIAL DISPUTES (Commercial Courts, High Courts)
// ─────────────────────────────────────────────────────────────────────────────

export const commercialCases: CaseTypeMapping[] = [
  {
    id: "cscomm",
    source_code: "CS(COMM)",
    source_court_code: "delhi_hc",
    normalized_category: "commercial_dispute",
    full_name: "Commercial Suit",
    is_appellate: false,
    alternate_codes: ["CS COMM", "Commercial Suit"],
    case_number_format: "CS(COMM)-NUMBER/YEAR",
    jurisdiction: "high_court",
    notes: "Disputes exceeding Rs. 1 crore (threshold varies). Expedited hearing.",
  },
  {
    id: "arb",
    source_code: "ARB",
    source_court_code: "delhi_hc",
    normalized_category: "arbitration",
    full_name: "Arbitration Petition",
    is_appellate: false,
    alternate_codes: ["Arbitration", "Section 9", "Section 11", "Section 34"],
    notes: "Under Arbitration & Conciliation Act, 1996 (Sections 9, 11, 34, 37).",
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// CRIMINAL CASES (Sessions Court, High Court)
// ─────────────────────────────────────────────────────────────────────────────

export const criminalCases: CaseTypeMapping[] = [
  {
    id: "cc",
    source_code: "CC",
    source_court_code: "delhi_hc",
    normalized_category: "criminal_case",
    full_name: "Criminal Case",
    is_appellate: false,
    alternate_codes: ["Criminal Case", "Sessions Case"],
    case_number_format: "CC-NUMBER/YEAR",
  },
  {
    id: "crla",
    source_code: "CRL.A.",
    source_court_code: "delhi_hc",
    normalized_category: "criminal_appeal",
    full_name: "Criminal Appeal",
    is_appellate: true,
    parent_case_type: "CC",
    alternate_codes: ["CRL.A", "CRLA", "Criminal Appeal"],
    case_number_format: "CRL.A.-NUMBER/YEAR",
    jurisdiction: "high_court",
    notes: "Appeal against conviction/acquittal from Sessions or district court.",
  },
  {
    id: "crr",
    source_code: "CRR",
    source_court_code: "delhi_hc",
    normalized_category: "criminal_revision",
    full_name: "Criminal Revision",
    is_appellate: true,
    alternate_codes: ["Criminal Revision Petition", "CRL.REV.P."],
    jurisdiction: "high_court",
  },
  {
    id: "crlmc",
    source_code: "CRL.M.C.",
    source_court_code: "delhi_hc",
    normalized_category: "criminal_miscellaneous",
    full_name: "Criminal Miscellaneous Case",
    is_appellate: false,
    alternate_codes: ["CRLMC", "Misc. Criminal", "CRL.M.C"],
    case_number_format: "CRL.M.C.-NUMBER/YEAR",
  },
  {
    id: "crlma",
    source_code: "CRL.M.A.",
    source_court_code: "delhi_hc",
    normalized_category: "criminal_miscellaneous",
    full_name: "Criminal Miscellaneous Application",
    is_appellate: false,
    alternate_codes: ["CRLMA", "Crim. Misc. App."],
  },
  {
    id: "bail",
    source_code: "BAIL APPLN.",
    source_court_code: "delhi_hc",
    normalized_category: "bail",
    full_name: "Bail Application",
    is_appellate: false,
    alternate_codes: ["Bail", "Anticipatory Bail", "Regular Bail", "Interim Bail"],
    notes: "Anticipatory bail, bail cancellation, regular bail, interim bail.",
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// FAMILY CASES (Family Courts, High Courts)
// ─────────────────────────────────────────────────────────────────────────────

export const familyCases: CaseTypeMapping[] = [
  {
    id: "matapp",
    source_code: "MAT.APP.",
    source_court_code: "delhi_hc",
    normalized_category: "matrimonial_appeal",
    full_name: "Matrimonial Appeal",
    is_appellate: true,
    alternate_codes: ["MAT.APP", "MATAPP", "Matrimonial Appeal"],
    case_number_format: "MAT.APP.-NUMBER/YEAR",
    jurisdiction: "high_court",
    notes: "Appeal against Family Court order.",
  },
  {
    id: "matfc",
    source_code: "MAT.APP.(F.C.)",
    source_court_code: "delhi_hc",
    normalized_category: "family",
    full_name: "Matrimonial Application (Family Court)",
    is_appellate: false,
    alternate_codes: ["MAT APP FC"],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// COMPANY & INSOLVENCY (NCLT, High Courts)
// ─────────────────────────────────────────────────────────────────────────────

export const companyInsolvencyCases: CaseTypeMapping[] = [
  {
    id: "cp_nclt",
    source_code: "CP",
    source_court_code: "nclt",
    normalized_category: "company_insolvency",
    full_name: "Company Petition",
    is_appellate: false,
    alternate_codes: ["Company Petition", "CP(IB)", "CP(AT)"],
    notes: "NCLT: Oppression/mismanagement, schemes, mergers, insolvency.",
  },
  {
    id: "ca_nclt",
    source_code: "CA",
    source_court_code: "nclt",
    normalized_category: "company_insolvency",
    full_name: "Company Appeal",
    is_appellate: true,
    parent_case_type: "CP",
    alternate_codes: [],
    notes: "NCLT appeal to NCLAT.",
  },
  {
    id: "cirp",
    source_code: "CIRP",
    source_court_code: "nclt",
    normalized_category: "company_insolvency",
    full_name: "Corporate Insolvency Resolution Process",
    is_appellate: false,
    alternate_codes: ["Insolvency Application", "Section 7", "Section 9", "Section 10"],
    notes: "IBC 2016 insolvency applications.",
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// TAX, CUSTOMS, GST (ITAT, CESTAT, etc.)
// ─────────────────────────────────────────────────────────────────────────────

export const taxCases: CaseTypeMapping[] = [
  {
    id: "ita",
    source_code: "ITA",
    source_court_code: "itat",
    normalized_category: "tax_customs_gst",
    full_name: "Income Tax Appeal",
    is_appellate: true,
    alternate_codes: ["Income Tax Appeal", "ITA/"],
    case_number_format: "ITA-NUMBER/BENCH/YEAR",
    jurisdiction: "tribunal",
    notes: "Appeal against CIT(A) order; ITAT has nationwide jurisdiction by assessment year.",
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// ENVIRONMENTAL (NGT)
// ─────────────────────────────────────────────────────────────────────────────

export const environmentalCases: CaseTypeMapping[] = [
  {
    id: "ngt_oa",
    source_code: "OA",
    source_court_code: "ngt",
    normalized_category: "environmental",
    full_name: "Original Application (NGT)",
    is_appellate: false,
    alternate_codes: [],
    notes: "Environmental disputes, pollution, wetlands, forests.",
  },
  {
    id: "ngt_appeal",
    source_code: "Appeal",
    source_court_code: "ngt",
    normalized_category: "environmental",
    full_name: "Appeal (NGT)",
    is_appellate: true,
    alternate_codes: [],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// COMPLETE TAXONOMY REGISTRY
// ─────────────────────────────────────────────────────────────────────────────

const allCaseTypeMappings: CaseTypeMapping[] = [
  ...constitutionalWritCases,
  ...civilCases,
  ...commercialCases,
  ...criminalCases,
  ...familyCases,
  ...companyInsolvencyCases,
  ...taxCases,
  ...environmentalCases,
  // Additional case types to be added incrementally:
  // - Labour & Employment
  // - Administrative & Service
  // - Motor Accident
  // - Consumer
  // - Property & Land
  // - Rent & Tenancy
  // - Intellectual Property
  // - Banking & Debt Recovery
  // - Contempt
  // - Caveat
  // - Execution & Enforcement
  // - Transfer Petition
  // - Election
  // - Other state-specific types
];

// ─────────────────────────────────────────────────────────────────────────────
// CASE TAXONOMY CLASS
// ─────────────────────────────────────────────────────────────────────────────

export class CaseTaxonomy {
  private mappings: Map<string, CaseTypeMapping> = new Map();
  private byCode: Map<string, CaseTypeMapping[]> = new Map(); // Code -> all variants
  private byCategory: Map<NormalizedCategory, CaseTypeMapping[]> = new Map();

  constructor() {
    this.initialize();
  }

  private initialize(): void {
    allCaseTypeMappings.forEach(mapping => {
      this.mappings.set(mapping.id, mapping);

      // Index by source code
      const key = `${mapping.source_code}|${mapping.source_court_code}`;
      if (!this.byCode.has(mapping.source_code)) {
        this.byCode.set(mapping.source_code, []);
      }
      this.byCode.get(mapping.source_code)!.push(mapping);

      // Index by category
      if (!this.byCategory.has(mapping.normalized_category)) {
        this.byCategory.set(mapping.normalized_category, []);
      }
      this.byCategory.get(mapping.normalized_category)!.push(mapping);
    });
  }

  /**
   * Get mapping by ID
   */
  getMapping(id: string): CaseTypeMapping | null {
    return this.mappings.get(id) ?? null;
  }

  /**
   * Find mapping by source code (fuzzy search)
   */
  findBySourceCode(code: string, courtCode?: string): CaseTypeMapping | null {
    const variants = this.byCode.get(code.toUpperCase());
    if (!variants) return null;

    // If court specified, prefer exact match
    if (courtCode) {
      return variants.find(m => m.source_court_code === courtCode) ?? variants[0];
    }
    return variants[0];
  }

  /**
   * Search by alternate codes (fuzzy match)
   */
  searchByAlternateCode(code: string): CaseTypeMapping[] {
    const upper = code.toUpperCase().replace(/\s+/g, "");
    return allCaseTypeMappings.filter(m =>
      m.alternate_codes.some(alt => alt.toUpperCase().replace(/\s+/g, "") === upper) ||
      m.source_code.toUpperCase().replace(/\s+/g, "") === upper
    );
  }

  /**
   * Get all cases in a category
   */
  getCasesByCategory(category: NormalizedCategory): CaseTypeMapping[] {
    return this.byCategory.get(category) ?? [];
  }

  /**
   * Check if case type is appellate
   */
  isAppellate(id: string): boolean {
    return this.mappings.get(id)?.is_appellate ?? false;
  }

  /**
   * Get parent case type (if appellate)
   */
  getParentCaseType(id: string): string | undefined {
    return this.mappings.get(id)?.parent_case_type;
  }

  /**
   * Normalize case type code
   */
  normalize(sourceCode: string, courtCode?: string): NormalizedCategory | null {
    const mapping = this.findBySourceCode(sourceCode, courtCode);
    return mapping?.normalized_category ?? null;
  }

  /**
   * Get all mappings (for reference/debugging)
   */
  getAllMappings(): CaseTypeMapping[] {
    return allCaseTypeMappings;
  }

  /**
   * Get all categories
   */
  getAllCategories(): NormalizedCategory[] {
    return Array.from(this.byCategory.keys());
  }
}

// Singleton instance
export const caseTaxonomy = new CaseTaxonomy();
