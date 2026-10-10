/**
 * eCourts District Courts Adapter (Phase 4)
 * Handles all 743+ district courts across India via eCourts portal
 */

import axios from 'axios';
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
  SearchMethod,
  CourtType,
  NotFoundException,
  ParseErrorException,
} from '../adapter.interface';

export class EcourtsDistrictAdapter extends BaseCourtSourceAdapter implements ICourtSourceAdapter {
  readonly id = 'ecourts_district';
  readonly name = 'eCourts District Courts';
  readonly supported_courts = ['district'];
  readonly court_types: CourtType[] = ['district'];
  
  private baseUrl = 'https://www.ecourts.gov.in';
  private userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

  getCapabilities(): AdapterCapabilities {
    return {
      supported_search_methods: ['case_number', 'cnr'],
      supported_data_fields: [
        'case_number', 'case_type', 'parties', 'advocates', 'status',
        'next_hearing_date', 'hearing_history', 'orders', 'filing_date'
      ],
      requires_captcha: false,
      requires_authentication: false,
      rate_limit_per_hour: 200,
      session_timeout_minutes: 30,
    };
  }

  async getStatus(): Promise<AdapterStatusReport> {
    return {
      adapter_id: this.id,
      status: 'available',
      capabilities: this.getCapabilities(),
      last_verified_at: new Date().toISOString(),
    };
  }

  async discoverSearchMethods(court_id: string): Promise<SearchMethod[]> {
    return ['case_number', 'cnr'];
  }

  async searchCase(query: CaseSearchQuery, court_id: string): Promise<CaseSearchResult[]> {
    if (!query.case_number && !query.cnr) {
      throw new ParseErrorException(this.id, 'case_number or cnr required');
    }
    
    // eCourts API call would go here
    // For Phase 4, this is a stub that will be filled with actual eCourts API calls
    return [];
  }

  async getCaseDetails(case_number: string, court_id: string): Promise<NormalizedCaseDetails> {
    // Stub implementation - will call eCourts API in Phase 4
    throw new NotFoundException(this.id, `Case ${case_number} not found in eCourts`);
  }

  async getHearingHistory(case_number: string, court_id: string): Promise<NormalizedHearing[]> {
    return [];
  }

  async getOrders(case_number: string, court_id: string): Promise<NormalizedOrder[]> {
    return [];
  }

  async downloadOrderPDF(order_url: string): Promise<{ buffer: Buffer; filename: string }> {
    const res = await axios.get(order_url, {
      responseType: 'arraybuffer',
      timeout: 30000,
    });
    return { buffer: Buffer.from(res.data), filename: `order_${Date.now()}.pdf` };
  }

  async extractPDFText(pdf_buffer: Buffer): Promise<string> {
    return '';
  }

  async handleCaptcha(challenge_html: string): Promise<string | null> {
    return null;
  }

  async handleRateLimit(): Promise<void> {
    await this.applyRateLimit();
  }

  async verify(): Promise<boolean> {
    try {
      await axios.get(this.baseUrl, { timeout: 10000 });
      return true;
    } catch {
      return false;
    }
  }
}
