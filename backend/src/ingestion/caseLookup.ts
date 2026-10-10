/**
 * Case Lookup — given a case number, detect the court, fetch available data,
 * and return a structured result the frontend can display and save.
 *
 * Court detection from case number patterns:
 *   Delhi HC : W.P.(C), CS(OS), CRL.A., FAO, RFA, MAT.APP., CRL.M.A., BAIL APPLN.,
 *              CRL.M.C., CM APPL., EX.P., CO, LPA, OMP, RSA, SLP (transferred), etc.
 *   Supreme Court : SLP(C), SLP(CRL), C.A., Crl.A., W.P.(C) [SCI prefix], Transfer Petition
 *   District / Sessions : CNR-based (16-char starting with state code), or
 *              CC, CS, CRL.REV., RC, MT, etc.
 *   NCLT/NCLAT : CP(IB), CA(AT)(Ins), MA
 *   Consumer   : CC, FA
 *   ITAT / Tax : ITA, MA
 *
 * Strategy per court:
 *   Delhi HC → scrape today's cause list PDFs (already works), also check archived lists
 *   Supreme Court → scrape sci.gov.in daily orders listing (no CAPTCHA on listing)
 *   District (CNR) → attempt eCourts CNR lookup (may hit CAPTCHA — handled gracefully)
 *   Others → return basic parsed info + note that live fetch isn't available
 */

import axios from "axios";
import { pool } from "../db/client";
import { parseCauseListText, ParsedCase } from "./parser";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { PDFParse } = require("pdf-parse") as {
  PDFParse: new (opts: { data: Buffer; verbosity?: number }) => {
    getText(): Promise<{ text: string }>;
  };
};

const UA = "Mozilla/5.0 (compatible; LegalMVP/1.0; +https://example.com/bot)";
const DELHI_HC_BASE = "https://delhihighcourt.nic.in";
const SCI_BASE = "https://main.sci.gov.in";

export interface CourtCaseInfo {
  case_no: string;
  court: string;
  court_code: string;      // "delhi_hc" | "supreme_court" | "district" | "nclt" | "other"
  case_type: string | null;
  case_year: number | null;
  case_title: string | null;
  petitioner: string | null;
  respondent: string | null;
  status: string;
  next_hearing_date: string | null;
  last_hearing_date: string | null;
  filing_date: string | null;
  bench: string | null;
  advocates: string[];
  hearing_history: { date: string; purpose: string }[];
  source: string;
  source_url: string | null;
  fetch_note: string;       // human-readable note about data quality
  raw_block: string | null; // raw text from PDF for debugging
}

// ─── Court detector ───────────────────────────────────────────────────────────
export function detectCourt(caseNo: string): { court: string; code: string } {
  const n = caseNo.trim().toUpperCase();

  // Supreme Court patterns
  if (/^SLP\s*\(C(?:RL)?\)|^C\.?A\.|^W\.?P\.\s*\(C\)\s+\d{1,5}\/\d{4}$/.test(n) ||
      /^TRANSFER\s+PET|^CONTEMPT\s+PET.*SCI|^REVIEW\s+PET.*SCI/.test(n) ||
      /^\d+\/\d{4}$/.test(n) && parseInt(n.split("/")[0]) > 10000) {
    // Ambiguous — default to Delhi HC unless very high number
  }
  if (/^SLP\s*\(/.test(n)) return { court: "Supreme Court of India", code: "supreme_court" };

  // NCLT / NCLAT
  if (/^C\.?P\.\s*\(I\.?B\.|^CA\s*\(AT\)|^IB\//i.test(n)) return { court: "NCLT", code: "nclt" };

  // ITAT
  if (/^ITA\/|^MA\/\d.*ITAT/i.test(n)) return { court: "ITAT", code: "itat" };

  // Consumer (NCDRC)
  if (/^R\.P\.|^F\.A\.\s*\d.*CC/i.test(n)) return { court: "NCDRC", code: "ncdrc" };

  // CNR (district court — 16 char alphanumeric)
  if (/^[A-Z]{4}\d{2}-\d{6}-\d{4}$/.test(n.replace(/\s+/g, ""))) {
    return { court: "District Court (eCourts)", code: "district" };
  }

  // Delhi HC patterns — the most common
  if (/W\.P\.\(C\)|W\.P\.\(CRL\)|CS\s*\(OS\)|CS\s*\(COMM\)|CRL\.A\.|CRL\.REV\.|CRL\.M\.A\.|CRL\.M\.C\.|BAIL\s+APPLN\.|FAO|RFA|MAT\.APP\.|LPA|OMP|EX\.P\.|CO\s+\d|RSA|CRL\.L\.P\.|CRL\.REF\.|CM\s+APPL\.|CRL\.M\.B\.A\./i.test(n)) {
    return { court: "Delhi High Court", code: "delhi_hc" };
  }

  // Bombay HC
  if (/W\.P\.\s*\(ST\.|PIL\//i.test(n)) return { court: "Bombay High Court", code: "bombay_hc" };

  // Madras HC
  if (/W\.P\.\s*\(MD\)|W\.A\.\s*\(MD\)/i.test(n)) return { court: "Madras High Court", code: "madras_hc" };

  // Default: treat as Delhi HC (most common user for this tool)
  return { court: "Delhi High Court", code: "delhi_hc" };
}

function extractYear(caseNo: string): number | null {
  const m = caseNo.match(/\/(\d{4})/);
  return m ? parseInt(m[1], 10) : null;
}

function extractCaseType(caseNo: string): string | null {
  const m = caseNo.match(/^([A-Z][A-Z.()\s]+?)\s*[-\d]/);
  return m ? m[1].trim() : null;
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

// ─── Buffer download ──────────────────────────────────────────────────────────
function streamToBuffer(url: string, n = 3): Promise<Buffer> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const https = require("https") as typeof import("https");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const http  = require("http")  as typeof import("http");
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https") ? https : http;
    const req = lib.get(url, { headers: { "User-Agent": UA, Accept: "application/pdf,*/*" }, timeout: 60_000 }, res => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        if (!n) return reject(new Error("Too many redirects"));
        const next = res.headers.location.startsWith("http") ? res.headers.location : `${DELHI_HC_BASE}${res.headers.location}`;
        return resolve(streamToBuffer(next, n - 1));
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(`HTTP ${res.statusCode}`)); }
      const ch: Buffer[] = [];
      res.on("data", (c: Buffer) => ch.push(c));
      res.on("end", () => resolve(Buffer.concat(ch)));
      res.on("error", reject);
    });
    req.on("timeout", () => { req.destroy(); reject(new Error("Timeout")); });
    req.on("error", reject);
  });
}

// ─── Delhi HC: search cause lists for a specific case number ─────────────────
async function fetchDelhiHCCase(caseNo: string): Promise<Partial<CourtCaseInfo>> {
  const LISTING_URL = `${DELHI_HC_BASE}/web/index.php/cause-lists/cause-list`;

  // Get listing page
  const listRes = await axios.get<string>(LISTING_URL, {
    headers: { "User-Agent": UA }, timeout: 20_000, responseType: "text",
  });
  const html = listRes.data as string;

  // Extract PDF links
  const pdfPat = /href="(\/files\/[^"]+\.pdf)"/gi;
  const pdfLinks: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = pdfPat.exec(html)) !== null) pdfLinks.push(m[1]);

  if (!pdfLinks.length) return { fetch_note: "No PDFs found on listing page", source: "delhi_hc_listing" };

  const normalised = caseNo.replace(/\s+/g, " ").trim().toUpperCase();
  const hearingHistory: { date: string; purpose: string }[] = [];
  let bestMatch: ParsedCase | null = null;
  let foundInPdf = "";

  // Try up to 5 most recent PDFs
  for (const href of pdfLinks.slice(0, 5)) {
    await sleep(1500);
    try {
      const buf = await streamToBuffer(`${DELHI_HC_BASE}${href}`);
      if (buf.slice(0, 4).toString("ascii") !== "%PDF") continue;

      const { text } = await new PDFParse({ data: buf, verbosity: 0 }).getText();

      // Check if this case number appears in the text
      const re = new RegExp(normalised.replace(/[.()/]/g, "\\$&").replace(/\s+/g, "\\s*"), "i");
      if (!re.test(text)) continue;

      // Parse the full PDF and find our case
      const parsed = parseCauseListText(text);
      const match = parsed.find(p => {
        const pNo = p.case_no.replace(/\s+/g, " ").trim().toUpperCase();
        return pNo === normalised || pNo.includes(normalised) || normalised.includes(pNo);
      });

      if (match) {
        bestMatch = match;
        foundInPdf = href;

        // Extract hearing date from PDF title/path
        const dateMatch = href.match(/(\d{4})-(\d{2})/);
        if (match.next_hearing_date) {
          hearingHistory.push({ date: match.next_hearing_date, purpose: "Listed in cause list" });
        }
        break;
      }
    } catch { continue; }
  }

  if (!bestMatch) {
    return {
      fetch_note: "Case not found in recent Delhi HC cause lists (last 5 PDFs searched). The case may not have a hearing listed this week, or may use a slightly different case number format.",
      source: "delhi_hc_listing",
      source_url: LISTING_URL,
    };
  }

  return {
    petitioner: bestMatch.petitioner || null,
    respondent: bestMatch.respondent || null,
    case_title: [bestMatch.petitioner, bestMatch.respondent].filter(Boolean).join(" v. ") || null,
    next_hearing_date: bestMatch.next_hearing_date,
    advocates: bestMatch.raw_advocates ? bestMatch.raw_advocates.split(";").map(s => s.trim()).filter(Boolean) : [],
    hearing_history: hearingHistory,
    source: "delhi_hc_cause_list",
    source_url: `${DELHI_HC_BASE}${foundInPdf}`,
    fetch_note: `Found in Delhi HC cause list. Parties, next hearing date, and advocates extracted from PDF.`,
    raw_block: null,
  };
}

// ─── Supreme Court: scrape daily orders listing ───────────────────────────────
async function fetchSCICase(caseNo: string): Promise<Partial<CourtCaseInfo>> {
  try {
    // SCI publishes an HTML listing of orders — no CAPTCHA on the listing page itself
    const ordersUrl = `${SCI_BASE}/supremecourt/2024/index.php`;
    const res = await axios.get<string>(ordersUrl, {
      headers: { "User-Agent": UA }, timeout: 15_000, responseType: "text"
    });
    const html = res.data as string;
    const normalised = caseNo.replace(/\s+/g, " ").trim().toUpperCase();
    // Look for case number in links
    const linkPat = new RegExp(`href="([^"]+)"[^>]*>[^<]*${normalised.replace(/[.()/]/g, "\\$&")}`, "i");
    const found = linkPat.exec(html);

    if (found) {
      return {
        source: "sci_orders",
        source_url: SCI_BASE,
        fetch_note: "Found in SCI daily orders listing. Full case details require the SCI case status form which uses CAPTCHA.",
      };
    }
  } catch { /* ignore */ }

  return {
    source: "sci_manual",
    source_url: "https://main.sci.gov.in/case-status",
    fetch_note: "Supreme Court case status requires manual lookup at sci.gov.in/case-status — CAPTCHA prevents automated fetch. Case has been saved with the information you provided.",
  };
}

// ─── District Court (CNR) ─────────────────────────────────────────────────────
async function fetchDistrictCase(caseNo: string): Promise<Partial<CourtCaseInfo>> {
  // Try eCourts CNR lookup — this often returns a CAPTCHA page
  const cnr = caseNo.replace(/\s+/g, "").toUpperCase();
  try {
    const res = await axios.get<string>(`https://services.ecourts.gov.in/ecourtindia_v6/?p=casestatus/index&CNR=${cnr}`, {
      headers: { "User-Agent": UA }, timeout: 12_000, responseType: "text"
    });
    const html = res.data as string;

    // If CAPTCHA page returned
    if (html.toLowerCase().includes("captcha") || html.toLowerCase().includes("verify you are human")) {
      return {
        source: "ecourts_blocked",
        source_url: `https://services.ecourts.gov.in/ecourtindia_v6/?p=casestatus/index`,
        fetch_note: `eCourts portal returned a CAPTCHA challenge. To view this case: visit services.ecourts.gov.in and enter CNR: ${cnr}`,
      };
    }

    // Try to extract data from the response
    const statusMatch = html.match(/Case Status[^:]*:\s*([^<\n]+)/i);
    const partyMatch = html.match(/Petitioner\s*[^:]*:\s*([^<\n]+)/i);
    const dateMatch = html.match(/Next Hearing[^:]*:\s*(\d{2}-\d{2}-\d{4})/i);

    if (statusMatch || partyMatch) {
      return {
        status: statusMatch?.[1]?.trim() ?? "Pending",
        petitioner: partyMatch?.[1]?.trim() ?? null,
        next_hearing_date: dateMatch ? `${dateMatch[1].split("-")[2]}-${dateMatch[1].split("-")[1]}-${dateMatch[1].split("-")[0]}` : null,
        source: "ecourts_cnr",
        source_url: `https://services.ecourts.gov.in/ecourtindia_v6/?p=casestatus/index`,
        fetch_note: "Case data fetched from eCourts CNR lookup.",
      };
    }
  } catch { /* ignore */ }

  return {
    source: "district_manual",
    source_url: "https://services.ecourts.gov.in",
    fetch_note: `District court case. Enter CNR ${cnr} at services.ecourts.gov.in for full details. Automated fetch blocked by CAPTCHA.`,
  };
}

// ─── Main lookup entrypoint ───────────────────────────────────────────────────
export async function lookupCase(caseNo: string): Promise<CourtCaseInfo> {
  const trimmed = caseNo.trim();
  const { court, code } = detectCourt(trimmed);
  const year = extractYear(trimmed);
  const caseType = extractCaseType(trimmed);

  const base: CourtCaseInfo = {
    case_no: trimmed,
    court,
    court_code: code,
    case_type: caseType,
    case_year: year,
    case_title: null,
    petitioner: null,
    respondent: null,
    status: "Pending",
    next_hearing_date: null,
    last_hearing_date: null,
    filing_date: null,
    bench: null,
    advocates: [],
    hearing_history: [],
    source: "manual",
    source_url: null,
    fetch_note: "",
    raw_block: null,
  };

  try {
    let fetched: Partial<CourtCaseInfo> = {};

    if (code === "delhi_hc" || code === "bombay_hc" || code === "madras_hc") {
      fetched = await fetchDelhiHCCase(trimmed);
    } else if (code === "supreme_court") {
      fetched = await fetchSCICase(trimmed);
    } else if (code === "district") {
      fetched = await fetchDistrictCase(trimmed);
    } else {
      fetched = {
        fetch_note: `${court} — automated fetch not yet available. Case saved with provided details.`,
        source: "manual",
      };
    }

    return { ...base, ...fetched };
  } catch (err) {
    return { ...base, fetch_note: `Fetch error: ${(err as Error).message}` };
  }
}

// ─── Save a looked-up case to DB (upsert) ────────────────────────────────────
export async function saveLookedUpCase(
  info: CourtCaseInfo,
  clientId?: string
): Promise<string> {
  const caseTitle = info.case_title ??
    ([info.petitioner, info.respondent].filter(Boolean).join(" v. ") || info.case_no);

  const r = await pool.query(
    `INSERT INTO cases
     (case_no, cnr_number, case_year, case_title, court, case_type, status,
      client_id, filing_date, next_hearing_date, last_hearing_date, source_url, last_fetched_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW())
     ON CONFLICT (case_no) DO UPDATE SET
       case_title        = COALESCE(EXCLUDED.case_title, cases.case_title),
       court             = COALESCE(EXCLUDED.court, cases.court),
       case_type         = COALESCE(EXCLUDED.case_type, cases.case_type),
       status            = COALESCE(EXCLUDED.status, cases.status),
       client_id         = COALESCE(EXCLUDED.client_id, cases.client_id),
       next_hearing_date = COALESCE(EXCLUDED.next_hearing_date, cases.next_hearing_date),
       source_url        = COALESCE(EXCLUDED.source_url, cases.source_url),
       last_fetched_at   = NOW(),
       updated_at        = NOW()
     RETURNING id`,
    [
      info.case_no,
      info.court_code === "district" ? info.case_no.replace(/\s+/g, "") : null,
      info.case_year,
      caseTitle,
      info.court,
      info.case_type,
      info.status,
      clientId ?? null,
      info.filing_date,
      info.next_hearing_date,
      info.last_hearing_date,
      info.source_url,
    ]
  );
  const caseId = r.rows[0].id as string;

  // Upsert parties
  if (info.petitioner || info.respondent) {
    await pool.query("DELETE FROM parties WHERE case_id = $1", [caseId]);
    if (info.petitioner) await pool.query(
      "INSERT INTO parties (case_id, name, role) VALUES ($1,$2,'petitioner')", [caseId, info.petitioner]);
    if (info.respondent) await pool.query(
      "INSERT INTO parties (case_id, name, role) VALUES ($1,$2,'respondent')", [caseId, info.respondent]);
  }

  // Upsert hearings
  for (const h of info.hearing_history) {
    await pool.query(
      `INSERT INTO hearings (case_id, date, purpose, source)
       VALUES ($1,$2,$3,'lookup')
       ON CONFLICT (case_id, date) DO NOTHING`,
      [caseId, h.date, h.purpose]
    );
  }
  if (info.next_hearing_date) {
    await pool.query(
      `INSERT INTO hearings (case_id, date, purpose, source)
       VALUES ($1,$2,'Listed in cause list','lookup')
       ON CONFLICT (case_id, date) DO NOTHING`,
      [caseId, info.next_hearing_date]
    );
  }

  return caseId;
}
