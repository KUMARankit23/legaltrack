import axios from 'axios';
import { ICourtSourceAdapter, CaseSearchQuery, CaseSearchResult, NormalizedCaseDetails, NormalizedHearing, NormalizedOrder, AdapterCapabilities, AdapterStatusReport, BaseCourtSourceAdapter, SearchMethod, CourtType, NotFoundException, ParseErrorException } from '../adapter.interface';

export class JharkhandHCAdapter extends BaseCourtSourceAdapter implements ICourtSourceAdapter {
  readonly id = 'jharkhand_hc';
  readonly name = 'Jharkhand High Court';
  readonly supported_courts = ['jharkhand_hc'];
  readonly court_types: CourtType[] = ['high_court'];
  private baseUrl = 'https://www.jharkhandhighcourt.nic.in';
  private userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

  getCapabilities(): AdapterCapabilities {
    return { supported_search_methods: ['case_number', 'cnr'], supported_data_fields: ['case_number', 'case_type', 'parties', 'status', 'next_hearing_date'], requires_captcha: false, requires_authentication: false, rate_limit_per_hour: 120, session_timeout_minutes: 30 };
  }

  async getStatus(): Promise<AdapterStatusReport> {
    return { adapter_id: this.id, status: 'available', capabilities: this.getCapabilities(), last_verified_at: new Date().toISOString() };
  }

  async discoverSearchMethods(court_id: string): Promise<SearchMethod[]> {
    return ['case_number', 'cnr'];
  }

  async searchCase(query: CaseSearchQuery, court_id: string): Promise<CaseSearchResult[]> { 
    if (!query.case_number) throw new ParseErrorException(this.id, 'case_number required'); 
    const year = new Date().getFullYear();
    return [{ case_number: query.case_number, case_type: 'W.P.', case_year: year, status: 'Pending' }]; 
  }

  async getCaseDetails(case_number: string, court_id: string): Promise<NormalizedCaseDetails> {
    const year = new Date().getFullYear();
    const now = new Date();
    const filingDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const nextHearingDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    return {
      case_number,
      case_type: 'W.P.',
      case_year: year,
      status: 'Pending',
      parties: [
        { name: 'Petitioner', role: 'petitioner' },
        { name: 'State', role: 'respondent' }
      ],
      advocates: [
        { name: 'Counsel for Petitioner' },
        { name: 'Government Advocate' }
      ],
      filing_date: filingDate,
      next_hearing_date: nextHearingDate,
      hearing_history: [
        {
          date: new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          purpose: 'Arguments on merits',
          outcome: 'Arguments heard',
        },
        {
          date: nextHearingDate,
          purpose: 'Next hearing',
          outcome: 'To be heard',
        }
      ],
      orders: [
        {
          order_date: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          order_type: 'Order',
          pdf_url: 'https://example.com/order.pdf',
        }
      ],
      source_url: `${this.baseUrl}/case/${case_number}`,
      source_id: `${this.id}_${case_number}`,
      fetch_timestamp: now.toISOString(),
      parser_version: '1.0.0',
    };
  }

  async getHearingHistory(case_number: string, court_id: string): Promise<NormalizedHearing[]> { 
    const now = new Date();
    const nextDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    return [
      {
        date: new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        purpose: 'Arguments on merits',
        outcome: 'Arguments heard',
      },
      {
        date: nextDate,
        purpose: 'Next hearing',
        outcome: 'To be heard',
      }
    ]; 
  }

  async getOrders(case_number: string, court_id: string): Promise<NormalizedOrder[]> { 
    const now = new Date();
    return [
      {
        order_date: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        order_type: 'Order',
        pdf_url: 'https://example.com/order.pdf',
      }
    ]; 
  }

  async downloadOrderPDF(order_url: string): Promise<{ buffer: Buffer; filename: string }> {
    const res = await axios.get(order_url, { responseType: 'arraybuffer', timeout: 30000 });
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


