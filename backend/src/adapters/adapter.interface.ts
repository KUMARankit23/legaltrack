/**
 * Court Source Adapter Interface
 * 
 * Defines the contract for all court-specific data fetchers.
 * Each adapter implements this interface to fetch case data from a specific source
 * (e.g., Delhi HC, eCourts, NCLT, etc.)
 */

// ─────────────────────────────────────────────────────────────────────────────
// TYPES & INTERFACES
// ─────────────────────────────────────────────────────────────────────────────

export type CourtType = "high_court" | "district" | "tribunal" | "commission";

export type SearchMethod = 
  | "case_number" 
  | "cnr" 
  | "party_name" 
  | "advocate_name" 
  | "diary_number" 
  | "case_type";

export type DataField = 
  | "case_number" 
  | "case_type" 
  | "parties" 
  | "advocates" 
  | "status" 
  | "filing_date" 
  | "next_hearing_date" 
  | "hearing_history" 
  | "orders" 
  | "judge_name" 
  | "cnr" 
  | "case_title";

export type AdapterStatus = 
  | "available" 
  | "unavailable" 
  | "rate_limited" 
  | "captcha_required" 
  | "error";

// ─────────────────────────────────────────────────────────────────────────────
// REQUEST/RESPONSE TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface CaseSearchQuery {
  case_number?: string;
  case_type?: string;
  party_name?: string;
  advocate_name?: string;
  cnr?: string;
  diary_number?: string;
  year?: number;
  bench_id?: string;
}

export interface CaseSearchResult {
  case_number: string;
  case_type: string;
  case_year: number;
  parties?: string;
  status?: string;
  filing_date?: string;
  next_hearing_date?: string;
  source_url?: string;
  source_id?: string;
}

export interface NormalizedParty {
  name: string;
  role: "petitioner" | "respondent" | "complainant" | "accused" | "other";
}

export interface NormalizedAdvocate {
  name: string;
  party_represented?: string;
  bar_registration?: string;
}

export interface NormalizedHearing {
  date: string; // YYYY-MM-DD
  purpose: string;
  court_number?: string;
  outcome?: string;
  next_date?: string;
  notes?: string;
}

export interface NormalizedOrder {
  order_date: string; // YYYY-MM-DD
  order_type: string;
  order_number?: string;
  pdf_url?: string;
  order_summary?: string;
}

export interface NormalizedCaseDetails {
  // Identification
  case_number: string;
  case_type: string;
  case_year: number;
  cnr?: string;
  case_title?: string;

  // Parties & Representation
  parties: NormalizedParty[];
  advocates: NormalizedAdvocate[];

  // Status & Dates
  status: string;
  filing_date?: string;
  next_hearing_date?: string;
  last_hearing_date?: string;
  disposal_date?: string;

  // Judge
  judge_name?: string;
  bench_name?: string;

  // History & Orders
  hearing_history: NormalizedHearing[];
  orders: NormalizedOrder[];

  // Source & Quality
  source_url: string;
  source_id: string;
  fetch_timestamp: string; // ISO 8601
  parser_version: string;
  data_quality_score?: number; // 0-100
  
  // Operational
  restrictions?: string[];  // e.g., ["sealed_record", "juvenile_case"]
  incomplete_fields?: string[]; // Fields that couldn't be populated
}

// ─────────────────────────────────────────────────────────────────────────────
// ADAPTER STATUS REPORT
// ─────────────────────────────────────────────────────────────────────────────

export interface AdapterCapabilities {
  supported_search_methods: SearchMethod[];
  supported_data_fields: DataField[];
  requires_captcha: boolean;
  requires_authentication: boolean;
  rate_limit_per_hour: number;
  session_timeout_minutes: number;
}

export interface AdapterStatusReport {
  adapter_id: string;
  status: AdapterStatus;
  capabilities: AdapterCapabilities;
  last_verified_at: string;
  error?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN ADAPTER INTERFACE
// ─────────────────────────────────────────────────────────────────────────────

export interface ICourtSourceAdapter {
  /**
   * Adapter metadata
   */
  readonly id: string;
  readonly name: string;
  readonly supported_courts: string[]; // Court IDs, or ["all"]
  readonly court_types: CourtType[];

  /**
   * Get adapter capabilities and status
   */
  getCapabilities(): AdapterCapabilities;
  getStatus(): Promise<AdapterStatusReport>;

  /**
   * Discover available search methods for a specific court
   */
  discoverSearchMethods(court_id: string): Promise<SearchMethod[]>;

  /**
   * Search for cases matching query
   * 
   * @param query Search parameters
   * @param court_id Court to search
   * @param bench_id Optional bench within court
   * @returns Array of matching cases (basic info)
   */
  searchCase(
    query: CaseSearchQuery,
    court_id: string,
    bench_id?: string
  ): Promise<CaseSearchResult[]>;

  /**
   * Get full case details
   * 
   * @param case_number Case number
   * @param court_id Court
   * @param bench_id Optional bench
   * @returns Normalized case details
   * @throws CaptchaRequiredException, TimeoutException, NotFoundException
   */
  getCaseDetails(
    case_number: string,
    court_id: string,
    bench_id?: string
  ): Promise<NormalizedCaseDetails>;

  /**
   * Get hearing history for case
   * 
   * @param case_number Case number
   * @param court_id Court
   * @returns Array of hearings
   */
  getHearingHistory(
    case_number: string,
    court_id: string
  ): Promise<NormalizedHearing[]>;

  /**
   * Get orders/judgments for case
   * 
   * @param case_number Case number
   * @param court_id Court
   * @returns Array of orders with URLs
   */
  getOrders(
    case_number: string,
    court_id: string
  ): Promise<NormalizedOrder[]>;

  /**
   * Download order PDF (if permitted)
   * 
   * @param order_url URL to PDF
   * @returns Buffer and filename
   * @throws AccessDeniedException, NotFoundException
   */
  downloadOrderPDF(order_url: string): Promise<{ buffer: Buffer; filename: string }>;

  /**
   * Extract text from PDF
   * 
   * @param pdf_buffer PDF bytes
   * @returns Extracted text
   */
  extractPDFText(pdf_buffer: Buffer): Promise<string>;

  /**
   * Handle CAPTCHA challenge (if required)
   * 
   * Called if search/fetch returns CAPTCHA.
   * Adapter may attempt to solve or request manual intervention.
   * 
   * @param challenge_html HTML of CAPTCHA page
   * @returns Solution string, or null if manual intervention needed
   */
  handleCaptcha(challenge_html: string): Promise<string | null>;

  /**
   * Handle rate limiting
   * 
   * Called if adapter detects rate limiting.
   * Should implement exponential backoff.
   */
  handleRateLimit(): Promise<void>;

  /**
   * Verify adapter is still working
   * 
   * Should test against known public case.
   */
  verify(): Promise<boolean>;
}

// ─────────────────────────────────────────────────────────────────────────────
// CUSTOM EXCEPTIONS
// ─────────────────────────────────────────────────────────────────────────────

export class AdapterException extends Error {
  constructor(
    public adapter_id: string,
    public error_type: "captcha" | "timeout" | "not_found" | "access_denied" | "rate_limited" | "parse_error" | "other",
    message: string
  ) {
    super(message);
    this.name = "AdapterException";
  }
}

export class CaptchaRequiredException extends AdapterException {
  constructor(adapter_id: string, message: string) {
    super(adapter_id, "captcha", message);
    this.name = "CaptchaRequiredException";
  }
}

export class TimeoutException extends AdapterException {
  constructor(adapter_id: string, message: string) {
    super(adapter_id, "timeout", message);
    this.name = "TimeoutException";
  }
}

export class NotFoundException extends AdapterException {
  constructor(adapter_id: string, message: string) {
    super(adapter_id, "not_found", message);
    this.name = "NotFoundException";
  }
}

export class AccessDeniedException extends AdapterException {
  constructor(adapter_id: string, message: string) {
    super(adapter_id, "access_denied", message);
    this.name = "AccessDeniedException";
  }
}

export class RateLimitedException extends AdapterException {
  constructor(adapter_id: string, public retry_after_seconds: number, message: string) {
    super(adapter_id, "rate_limited", message);
    this.name = "RateLimitedException";
  }
}

export class ParseErrorException extends AdapterException {
  constructor(adapter_id: string, message: string) {
    super(adapter_id, "parse_error", message);
    this.name = "ParseErrorException";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// BASE ADAPTER CLASS (Optional, for common logic)
// ─────────────────────────────────────────────────────────────────────────────

export abstract class BaseCourtSourceAdapter implements ICourtSourceAdapter {
  abstract readonly id: string;
  abstract readonly name: string;
  abstract readonly supported_courts: string[];
  abstract readonly court_types: CourtType[];

  protected request_count = 0;
  protected last_request_time = 0;
  protected rate_limit_remaining = 0;

  abstract getCapabilities(): AdapterCapabilities;

  async getStatus(): Promise<AdapterStatusReport> {
    const verified = await this.verify();
    return {
      adapter_id: this.id,
      status: verified ? "available" : "unavailable",
      capabilities: this.getCapabilities(),
      last_verified_at: new Date().toISOString(),
    };
  }

  abstract discoverSearchMethods(court_id: string): Promise<SearchMethod[]>;
  abstract searchCase(query: CaseSearchQuery, court_id: string, bench_id?: string): Promise<CaseSearchResult[]>;
  abstract getCaseDetails(case_number: string, court_id: string, bench_id?: string): Promise<NormalizedCaseDetails>;
  abstract getHearingHistory(case_number: string, court_id: string): Promise<NormalizedHearing[]>;
  abstract getOrders(case_number: string, court_id: string): Promise<NormalizedOrder[]>;
  abstract downloadOrderPDF(order_url: string): Promise<{ buffer: Buffer; filename: string }>;
  abstract extractPDFText(pdf_buffer: Buffer): Promise<string>;
  abstract handleCaptcha(challenge_html: string): Promise<string | null>;
  abstract handleRateLimit(): Promise<void>;
  abstract verify(): Promise<boolean>;

  /**
   * Helper: Apply rate limiting (exponential backoff)
   */
  protected async applyRateLimit(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.last_request_time;
    const min_interval_ms = (3600 * 1000) / this.getCapabilities().rate_limit_per_hour;

    if (elapsed < min_interval_ms) {
      const wait_ms = min_interval_ms - elapsed;
      await new Promise(r => setTimeout(r, wait_ms));
    }

    this.last_request_time = Date.now();
    this.request_count++;
  }

  /**
   * Helper: Parse basic HTML to extract data
   */
  protected extractText(html: string, selector?: string): string {
    // Remove HTML tags
    const text = html.replace(/<[^>]+>/g, " ");
    // Clean whitespace
    return text.replace(/\s+/g, " ").trim();
  }
}
