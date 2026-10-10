/**
 * Real Court Integration - Fetch actual case data from Indian court systems
 * Integrates with:
 * - eCourts API (743+ district courts)
 * - High Court websites (scraped)
 * - Official APIs where available
 */

import axios from 'axios';
import type { CaseSearchResult, NormalizedCaseDetails, NormalizedHearing, NormalizedOrder } from './adapter.interface';

// ─────────────────────────────────────────────────────────────────────────────
// ECOURTS INTEGRATION - Real-time data from 743+ Indian district courts
// ─────────────────────────────────────────────────────────────────────────────
export async function searchCaseInECourts(caseNo: string, cnrNumber?: string): Promise<CaseSearchResult[]> {
  try {
    // eCourts API: https://ecourts.gov.in/
    // Uses CNR (Case Number Registry) which is standardized across all courts
    
    let apiUrl = 'https://ecourts.gov.in/ecourts_home/api_v1/case/';
    let params: Record<string, string> = {};

    if (cnrNumber && cnrNumber.length === 16) {
      // CNR format: DLHC01000123202401
      // DL = Delhi, HC = High Court, 01 = Code, 000123 = Case No, 2024 = Year, 01 = Check Digit
      params.cnr_number = cnrNumber;
    } else if (caseNo) {
      params.case_number = caseNo;
    }

    const response = await axios.get(apiUrl, {
      params,
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      }
    });

    if (!response.data || !response.data.cases) {
      return [];
    }

    return response.data.cases.map((c: any) => ({
      case_number: c.case_number || c.cnr_number,
      case_type: c.case_type || 'Case',
      case_year: parseInt(c.case_year) || new Date().getFullYear(),
      status: c.status || 'Pending',
      filing_date: c.filing_date,
      next_hearing_date: c.next_hearing_date,
    }));
  } catch (error) {
    console.error('[eCourts] Search failed:', error);
    return [];
  }
}

export async function getCaseDetailsFromECourts(cnrNumber: string): Promise<NormalizedCaseDetails | null> {
  try {
    // eCourts API for detailed case information
    const apiUrl = 'https://ecourts.gov.in/ecourts_home/api_v1/case/details/';
    
    const response = await axios.get(apiUrl, {
      params: { cnr: cnrNumber },
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      }
    });

    const data = response.data.case;
    if (!data) return null;

    const year = parseInt(data.case_year) || new Date().getFullYear();
    const now = new Date();

    return {
      case_number: data.case_number,
      case_type: data.case_type,
      case_year: year,
      status: data.status,
      cnr: data.cnr_number,
      parties: (data.parties || []).map((p: any) => ({
        name: p.name,
        role: (p.role === 'Petitioner' ? 'petitioner' : p.role === 'Respondent' ? 'respondent' : 'other') as 'petitioner' | 'respondent' | 'other',
      })),
      advocates: (data.advocates || []).map((a: any) => ({
        name: a.name,
        party_represented: a.party,
      })),
      filing_date: data.filing_date,
      next_hearing_date: data.next_hearing_date,
      hearing_history: (data.hearing_history || []).map((h: any) => ({
        date: h.date,
        purpose: h.purpose,
        outcome: h.outcome,
      })),
      orders: (data.orders || []).map((o: any) => ({
        order_date: o.order_date,
        order_type: o.order_type,
        pdf_url: o.pdf_url,
      })),
      source_url: `https://ecourts.gov.in/ecourts_home/case/${cnrNumber}`,
      source_id: `ecourts_${cnrNumber}`,
      fetch_timestamp: now.toISOString(),
      parser_version: '2.0.0',
    };
  } catch (error) {
    console.error('[eCourts] Get details failed:', error);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DELHI HIGH COURT - Real-time data scraping
// ─────────────────────────────────────────────────────────────────────────────
export async function searchCaseInDelhiHC(caseNo: string): Promise<CaseSearchResult[]> {
  try {
    const apiUrl = 'https://dhconline.nic.in/dhcqsrest/queryLesser';
    
    const response = await axios.post(apiUrl, {
      caseNo: caseNo.toUpperCase(),
      year: '',
      filingNo: '',
      filingYear: '',
    }, {
      timeout: 15000,
      headers: {
        'Content-Type': 'application/json',
      }
    });

    const results = response.data || [];
    return results.map((c: any) => ({
      case_number: c.caseNo,
      case_type: c.caseType,
      case_year: parseInt(c.caseYear) || new Date().getFullYear(),
      status: 'Pending',
      filing_date: c.filingDate,
    }));
  } catch (error) {
    console.error('[Delhi HC] Search failed:', error);
    return [];
  }
}

export async function getCaseDetailsFromDelhiHC(caseNo: string, caseYear: string): Promise<NormalizedCaseDetails | null> {
  try {
    const apiUrl = 'https://dhconline.nic.in/dhcqsrest/caseHistory';
    
    const response = await axios.post(apiUrl, {
      caseNo: caseNo.toUpperCase(),
      caseYear: caseYear,
    }, {
      timeout: 15000,
      headers: {
        'Content-Type': 'application/json',
      }
    });

    const data = response.data;
    if (!data) return null;

    const now = new Date();
    const year = parseInt(caseYear) || new Date().getFullYear();

    return {
      case_number: data.caseNo,
      case_type: data.caseType,
      case_year: year,
      status: data.status || 'Pending',
      parties: [
        { name: data.petitioner, role: 'petitioner' as const },
        { name: data.respondent, role: 'respondent' as const },
      ].filter(p => p.name),
      advocates: (data.counsel || []).map((c: any) => ({
        name: c.name,
        party_represented: c.party,
      })),
      filing_date: data.filingDate,
      next_hearing_date: data.nextHearingDate,
      hearing_history: (data.caseHistory || []).map((h: any) => ({
        date: h.date,
        purpose: h.purpose,
        outcome: h.outcome,
      })),
      orders: (data.orders || []).map((o: any) => ({
        order_date: o.orderDate,
        order_type: o.orderType,
        pdf_url: o.pdfUrl,
        order_number: o.orderNo,
      })),
      source_url: `https://dhconline.nic.in/dsc/executesearch.html?caseNo=${caseNo}&caseYear=${caseYear}`,
      source_id: `delhi_hc_${caseNo}_${caseYear}`,
      fetch_timestamp: now.toISOString(),
      parser_version: '2.0.0',
    };
  } catch (error) {
    console.error('[Delhi HC] Get details failed:', error);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// REAL-TIME INTEGRATION ROUTER
// ─────────────────────────────────────────────────────────────────────────────
export async function fetchRealTimeData(courtId: string, caseNo: string, cnrNumber?: string): Promise<{
  results: CaseSearchResult[];
  source: string;
}> {
  console.log(`[Real-Time] Attempting fetch from ${courtId}: ${caseNo}`);

  try {
    // Try eCourts first (works for all district courts)
    if (!courtId || courtId === 'district' || courtId === 'ecourts') {
      const ecourtResults = await searchCaseInECourts(caseNo, cnrNumber);
      if (ecourtResults.length > 0) {
        return {
          results: ecourtResults,
          source: 'eCourts API (Live)',
        };
      }
    }

    // Try specific high court APIs
    if (courtId === 'delhi_hc') {
      const results = await searchCaseInDelhiHC(caseNo);
      if (results.length > 0) {
        return { results, source: 'Delhi HC Website (Live)' };
      }
    }

    console.log(`[Real-Time] No live results found for ${courtId}`);
    return { results: [], source: 'No live data available' };
  } catch (error) {
    console.error('[Real-Time] Integration error:', error);
    throw error;
  }
}
