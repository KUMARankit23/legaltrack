/**
 * Delhi High Court Adapter
 * Implements ICourtSourceAdapter interface for Delhi HC
 * Uses the Delhi HC DataTables API endpoint
 */

import axios from 'axios';
import { pool } from '../../db/client';
import { downloadCaseOrders } from '../../ingestion/orderService';
import {
  ICourtSourceAdapter,
  CaseSearchQuery,
  CaseSearchResult,
  NormalizedCaseDetails,
  NormalizedHearing,
  NormalizedOrder,
  AdapterCapabilities,
  AdapterStatusReport,
  BaseCourtSourceAdapter,
  CaptchaRequiredException,
  TimeoutException,
  NotFoundException,
  ParseErrorException,
  CourtType,
} from '../adapter.interface';

export class DelhiHCAdapter extends BaseCourtSourceAdapter implements ICourtSourceAdapter {
  readonly id = 'delhi_hc';
  readonly name = 'Delhi High Court';
  readonly supported_courts = ['delhi_hc'];
  readonly court_types: CourtType[] = ['high_court'];
  private baseUrl = 'https://delhihighcourt.nic.in';
  private searchPage = `${this.baseUrl}/app/get-case-type-status`;
  private apiUrl = `${this.baseUrl}/app/get-case-wise`;
  private userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

  getCapabilities(): AdapterCapabilities {
    return {
      supported_search_methods: ['case_number', 'party_name'],
      supported_data_fields: [
        'case_number', 'case_type', 'parties', 'advocates', 'status',
        'next_hearing_date', 'hearing_history', 'orders'
      ],
      requires_captcha: true,
      requires_authentication: false,
      rate_limit_per_hour: 60,
      session_timeout_minutes: 10,
    };
  }

  async discoverSearchMethods(court_id: string) {
    return [
      { method_name: 'case_number', description: 'Search by case number' },
      { method_name: 'party_name', description: 'Search by party name' },
    ] as any;
  }

  async searchCase(query: CaseSearchQuery, court_id: string): Promise<CaseSearchResult[]> {
    if (!query.case_number) {
      throw new ParseErrorException(this.id, 'case_number required for Delhi HC search');
    }

    const session = await this.ensureSession();
    if (!session.captchaCode) {
      throw new CaptchaRequiredException(this.id, 'Could not extract captcha code from Delhi HC page');
    }

    const parsed = this.parseCaseNo(query.case_number);
    if (!parsed.caseNumber) {
      throw new ParseErrorException(this.id, `Could not parse case number from "${query.case_number}"`);
    }

    console.log(`[delhi_hc_adapter] Querying ${parsed.caseType} ${parsed.caseNumber}/${parsed.year} | captcha: ${session.captchaCode}`);

    const formData = new URLSearchParams({
      draw: '1',
      start: '0',
      length: '50',
      'columns[0][data]': 'DT_RowIndex',
      'columns[1][data]': 'ctype',
      'columns[2][data]': 'pet',
      'columns[3][data]': 'orderdate',
      case_type: parsed.caseType,
      case_number: parsed.caseNumber,
      case_year: parsed.year,
      captchaInput: session.captchaCode,
      randomid: session.captchaCode,
      _token: session.token,
    });

    const apiRes = await axios.post(this.apiUrl, formData.toString(), {
      headers: {
        'User-Agent': this.userAgent,
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest',
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'Referer': this.searchPage,
        'Cookie': session.cookie,
        'Origin': this.baseUrl,
      },
      timeout: 15000,
    });

    const json = apiRes.data as any;
    if (!json.data || json.data.length === 0) {
      return [];
    }

    return json.data.map((record: any, idx: number) => ({
      case_number: query.case_number,
      petitioner: this.stripHtml(record.pet_name || '').split(/\bVS\.?\b/i)[0]?.trim() || 'Unknown',
      bench_id: 'bench_1',
      match_score: 100 - idx,
    })) as CaseSearchResult[];
  }

  async getCaseDetails(case_number: string, court_id: string): Promise<NormalizedCaseDetails> {
    const session = await this.ensureSession();
    if (!session.captchaCode) {
      throw new CaptchaRequiredException(this.id, 'Could not extract captcha code from Delhi HC page');
    }

    const parsed = this.parseCaseNo(case_number);
    if (!parsed.caseNumber) {
      throw new ParseErrorException(this.id, `Could not parse case number from "${case_number}"`);
    }

    const formData = new URLSearchParams({
      draw: '1',
      start: '0',
      length: '50',
      'columns[0][data]': 'DT_RowIndex',
      'columns[1][data]': 'ctype',
      'columns[2][data]': 'pet',
      'columns[3][data]': 'orderdate',
      case_type: parsed.caseType,
      case_number: parsed.caseNumber,
      case_year: parsed.year,
      captchaInput: session.captchaCode,
      randomid: session.captchaCode,
      _token: session.token,
    });

    const apiRes = await axios.post(this.apiUrl, formData.toString(), {
      headers: {
        'User-Agent': this.userAgent,
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest',
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'Referer': this.searchPage,
        'Cookie': session.cookie,
        'Origin': this.baseUrl,
      },
      timeout: 15000,
    });

    const json = apiRes.data as any;
    if (!json.data || json.data.length === 0) {
      throw new NotFoundException(this.id, `Case ${case_number} not found in Delhi High Court`);
    }

    const record = json.data[0];
    const parties = this.parsePartyNames(record.pet_name || '');
    const nextDate = record.date_disp ?? this.parseNextDate(record.orderdate ?? '') ?? null;
    const status = record.status_desc ?? 'Pending';
    const advocate = this.stripHtml(record.adv_name ?? '');
    const historyUrl = record.ctype ? this.extractCaseHistoryUrl(record.ctype) : null;

    return {
      case_number,
      case_type: parsed.caseType,
      case_year: parseInt(parsed.year),
      status: status === 'PENDING' ? 'Pending' : status,
      parties: [
        { name: parties.petitioner, role: 'petitioner' },
        { name: parties.respondent, role: 'respondent' },
      ],
      advocates: advocate ? [{ name: advocate }] : [],
      hearing_history: [],
      orders: [],
      source_url: historyUrl || `${this.baseUrl}/app/get-case-wise`,
      source_id: this.id,
      fetch_timestamp: new Date().toISOString(),
      parser_version: '1.0.0',
      next_hearing_date: nextDate,
    } as NormalizedCaseDetails;
  }

  async getHearingHistory(case_number: string, court_id: string): Promise<NormalizedHearing[]> {
    // Fetch case details first to get history URL
    const details = await this.getCaseDetails(case_number, court_id);
    if (!details.source_url) {
      return [];
    }

    const session = await this.ensureSession();
    const result: NormalizedHearing[] = [];
    const seen = new Set<string>();

    try {
      const res = await axios.get(details.source_url, {
        headers: {
          'User-Agent': this.userAgent,
          'Cookie': session.cookie,
          'Referer': this.searchPage,
        },
        timeout: 15000,
      });

      const html = res.data as string;
      const hearings = this.parseListingRows(html);

      for (const h of hearings) {
        if (seen.has(h.date)) continue;
        seen.add(h.date);
        result.push({
          date: h.date,
          purpose: h.purpose,
          court_number: undefined,
          outcome: undefined,
          next_date: undefined,
          notes: undefined,
        });
      }
    } catch (err) {
      console.warn(`[delhi_hc_adapter] Could not fetch history:`, (err as Error).message);
    }

    return result;
  }

  async getOrders(case_number: string, court_id: string): Promise<NormalizedOrder[]> {
    const hearings = await this.getHearingHistory(case_number, court_id);
    const rows = this.parseListingRows(''); // Will get from cache/history
    
    // For now, return empty - orders will be added in Phase 3
    return [];
  }

  async downloadOrderPDF(order_url: string): Promise<{ buffer: Buffer; filename: string }> {
    const res = await axios.get(order_url, {
      headers: { 'User-Agent': this.userAgent },
      responseType: 'arraybuffer',
      timeout: 30000,
    });
    const buffer = Buffer.from(res.data);
    const filename = `order_${Date.now()}.pdf`;
    return { buffer, filename };
  }

  async extractPDFText(pdf_buffer: Buffer): Promise<string> {
    // TODO: Implement PDF text extraction using pdfjs or similar
    return '';
  }

  async handleCaptcha(challenge_html: string): Promise<string | null> {
    // Delhi HC CAPTCHA is a plain number - document and fallback to manual
    console.warn('[delhi_hc_adapter] CAPTCHA encountered - manual intervention required');
    return null;
  }

  async handleRateLimit(): Promise<void> {
    await this.applyRateLimit();
  }

  async verify(): Promise<boolean> {
    try {
      const session = await this.ensureSession();
      return !!session.token && !!session.captchaCode;
    } catch {
      return false;
    }
  }

  // ───── Private helper methods ─────────────────────────────────────────────

  private sessionCache: any = null;
  private sessionExpiry = 0;

  private async ensureSession(): Promise<any> {
    if (this.sessionCache && Date.now() < this.sessionExpiry) {
      return this.sessionCache;
    }

    const res = await axios.get(this.searchPage, {
      headers: {
        'User-Agent': this.userAgent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      timeout: 15000,
    });

    const html = res.data as string;
    const captchaMatch = html.match(/name="randomid"\s+id="randomid"\s+value="(\d+)"/);
    const tokenMatch = html.match(/"_token"\s*:\s*"([A-Za-z0-9+/=]+)"/) ??
                       html.match(/name="_token"\s+value="([A-Za-z0-9+/=]+)"/) ??
                       html.match(/meta name="csrf-token" content="([^"]+)"/);

    const setCookie = res.headers['set-cookie'] ?? [];
    const cookie = (Array.isArray(setCookie) ? setCookie : [setCookie])
      .map((c: string) => c.split(';')[0])
      .join('; ');

    this.sessionCache = {
      token: tokenMatch?.[1] ?? '',
      captchaCode: captchaMatch?.[1] ?? '',
      cookie,
    };
    this.sessionExpiry = Date.now() + 10 * 60 * 1000; // 10 minute expiry

    return this.sessionCache;
  }

  private parseCaseNo(caseNo: string): { caseType: string; caseNumber: string; year: string } {
    const input = caseNo.trim();

    const stdMatch = input.match(/(\d+)\s*\/\s*(\d{4,5})/);
    if (stdMatch) {
      const caseNumber = stdMatch[1];
      let year = stdMatch[2];
      if (year.length === 5 && year.startsWith('1')) year = year.slice(1);
      const typeRaw = input.slice(0, input.indexOf(stdMatch[0]))
        .replace(/\s*[-–]\s*$/, '').trim();
      return { caseType: this.normaliseType(typeRaw), caseNumber, year };
    }

    const tokens = input.replace(/[-–]/g, ' ').trim().split(/\s+/);
    const yearToken = [...tokens].reverse().find((t: string) => /^\d{4}$/.test(t)) ?? '';
    const numToken = [...tokens].reverse().find((t: string) => /^\d+$/.test(t) && t !== yearToken) ?? '';
    const typeTokens = tokens.filter(t => t !== yearToken && t !== numToken);
    const typeRaw = typeTokens.join(' ').replace(/\s*[-–]\s*$/, '').trim();

    return {
      caseType: this.normaliseType(typeRaw || input),
      caseNumber: numToken,
      year: yearToken,
    };
  }

  private normaliseType(raw: string): string {
    if (!raw) return raw;

    const upper = raw.toUpperCase().replace(/\s+(?=[(])/g, '').replace(/\s+/g, ' ').trim();

    const typeMap: [string, string][] = [
      ['W.P.(C)', 'W.P.(C)'],
      ['W.P.(CRL)', 'W.P.(CRL)'],
      ['CRL.M.C.', 'CRL.M.C.'],
      ['CRL.A.', 'CRL.A.'],
      ['BAIL APPLN.', 'BAIL APPLN.'],
      ['CS(OS)', 'CS(OS)'],
      ['FAO', 'FAO'],
      ['O.M.P.', 'O.M.P.'],
    ];

    for (const [k, v] of typeMap) {
      if (upper === k.toUpperCase() || upper.startsWith(k.toUpperCase())) return v;
    }

    return raw.trim();
  }

  private stripHtml(html: string): string {
    return html.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ').trim();
  }

  private parsePartyNames(petHtml: string): { petitioner: string; respondent: string } {
    const text = this.stripHtml(petHtml);
    const vsPat = /\bVS\.?\s*/i;
    const vsIdx = text.search(vsPat);
    if (vsIdx === -1) return { petitioner: text.trim(), respondent: '' };
    return {
      petitioner: text.substring(0, vsIdx).trim(),
      respondent: text.substring(vsIdx).replace(/^VS\.?\s*/i, '').trim(),
    };
  }

  private parseNextDate(orderdate: string): string | null {
    const nextMatch = orderdate.match(/NEXT DATE:\s*[\n\t\s]*(\d{4}-\d{2}-\d{2})/i) ??
                      orderdate.match(/(\d{4}-\d{2}-\d{2})/);
    return nextMatch?.[1] ?? null;
  }

  private extractCaseHistoryUrl(ctypeHtml: string): string | null {
    const m = ctypeHtml.match(/href=(https:\/\/delhihighcourt\.nic\.in\/app\/online-cause-history\/[^\s"'<>]+)/);
    return m?.[1] ?? null;
  }

  private parseListingRows(html: string): { date: string; purpose: string; order_url?: string }[] {
    const listingIdx = html.indexOf('listingDetailsSection');
    const filingIdx = html.indexOf('filingDetailsSection');
    const listingHtml = listingIdx >= 0
      ? html.slice(listingIdx, filingIdx > listingIdx ? filingIdx : undefined)
      : html;

    const rows: { date: string; purpose: string; order_url?: string }[] = [];
    const rowPat = /<tr[\s\S]*?<\/tr>/gi;
    let rowMatch: RegExpExecArray | null;

    while ((rowMatch = rowPat.exec(listingHtml)) !== null) {
      const row = rowMatch[0];
      const dateMatch = row.match(/(\d{2}-\d{2}-\d{4})/);
      if (!dateMatch) continue;
      const [dd, mm, yyyy] = dateMatch[1].split('-');
      if (!dd || !mm || !yyyy) continue;
      const isoDate = `${yyyy}-${mm}-${dd}`;

      const orderUrlMatch = row.match(/href="(https?:\/\/delhihighcourt\.nic\.in\/app\/download[^"]+)"/i);
      const order_url = orderUrlMatch?.[1];

      const cells = (row.match(/<td[^>]*>([\s\S]*?)<\/td>/gi) ?? [])
        .map(c => this.stripHtml(c))
        .filter(t => t.length > 3 && !/^\d+$/.test(t.trim()) && !/^\d{2}-\d{2}-\d{4}$/.test(t.trim()));

      const purpose = cells.join(' — ').replace(/\s+/g, ' ').trim() || 'Listing';
      if (!order_url && purpose === 'Listing') continue;

      rows.push({ date: isoDate, purpose, ...(order_url ? { order_url } : {}) });
    }

    return rows;
  }
}
