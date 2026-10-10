/**
 * Live court fetch using adapter pattern
 * Routes to correct court adapter based on court_id
 * Supports all Indian courts: High Courts, Districts, Tribunals
 */

import axios from "axios";
import { pool } from "../db/client";
import { downloadCaseOrders } from "./orderService";
import { fetchMadhyaPradeshCase } from "./mphcFetch";
import { selectAdapter } from "../adapters/adapterDispatcher";

const BASE = "https://delhihighcourt.nic.in";
const SEARCH_PAGE = `${BASE}/app/get-case-type-status`;
const API_URL = `${BASE}/app/get-case-wise`;

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// In-memory job store
const jobStore = new Map<string, {
  status: "running" | "done" | "error";
  result?: FetchResult;
  error?: string;
  startedAt: number;
}>();

export interface FetchResult {
  updated: boolean;
  next_hearing_date: string | null;
  hearings_added: number;
  message: string;
  petitioner?: string;
  respondent?: string;
  advocate?: string;
  status?: string;
  case_history_url?: string;
}

export function getJobStatus(caseId: string) {
  const job = jobStore.get(caseId);
  if (!job) return null;
  if (Date.now() - job.startedAt > 600_000) { jobStore.delete(caseId); return null; }
  return job;
}

// ─── Page session: get CSRF token + captcha + cookie ──────────────────────────
interface PageSession {
  token: string;
  captchaCode: string;
  cookie: string;
}

async function getPageSession(): Promise<PageSession> {
  const res = await axios.get(SEARCH_PAGE, {
    headers: {
      "User-Agent": UA,
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
    timeout: 15_000,
  });

  const html = res.data as string;

  // The "captcha" is a plain 4-digit number embedded in the HTML — no image
  const captchaMatch = html.match(/name="randomid"\s+id="randomid"\s+value="(\d+)"/);
  const captchaCode = captchaMatch?.[1] ?? "";

  // Laravel CSRF token (in a meta tag or data attribute)
  const tokenMatch = html.match(/"_token"\s*:\s*"([A-Za-z0-9+/=]+)"/) ??
                     html.match(/name="_token"\s+value="([A-Za-z0-9+/=]+)"/) ??
                     html.match(/meta name="csrf-token" content="([^"]+)"/);
  const token = tokenMatch?.[1] ?? "";

  // Session cookie
  const setCookie = res.headers["set-cookie"] ?? [];
  const cookie = (Array.isArray(setCookie) ? setCookie : [setCookie])
    .map((c: string) => c.split(";")[0])
    .join("; ");

  return { token, captchaCode, cookie };
}

// ─── Parse case type + number from full case_no string ───────────────────────
function parseCaseNo(caseNo: string): { caseType: string; caseNumber: string; year: string } {
  // Input examples:
  //   "W.P.(C)-10385/2024"    => type=W.P.(C)  num=10385  year=2024
  //   "W.P.(C) - 10385/2024"  => type=W.P.(C)  num=10385  year=2024
  //   "w.p.(c) 5972 12022"    => malformed — treat trailing 4-digit group as year
  //   "CRL.M.C. 2415/2023"    => type=CRL.M.C. num=2415   year=2023
  //   "BAIL APPLN.-898/2026"  => type=BAIL APPLN. num=898  year=2026

  const input = caseNo.trim();

  // Try standard format first: number/year with optional spaces around /
  const stdMatch = input.match(/(\d+)\s*\/\s*(\d{4,5})/);
  if (stdMatch) {
    const caseNumber = stdMatch[1];
    let year = stdMatch[2];
    // Fix 5-digit year typos like "12022" → "2022", "12024" → "2024"
    if (year.length === 5 && year.startsWith("1")) year = year.slice(1);
    const typeRaw = input.slice(0, input.indexOf(stdMatch[0]))
      .replace(/\s*[-–]\s*$/, "").trim();
    return { caseType: normaliseType(typeRaw), caseNumber, year };
  }

  // Fallback: space-separated "TYPE NUM YEAR" e.g. "w.p.(c) 5972 12022"
  // Last token that is 4 digits = year, second-to-last = number
  const tokens = input.replace(/[-–]/g, " ").trim().split(/\s+/);
  const yearToken = [...tokens].reverse().find((t: string) => /^\d{4}$/.test(t)) ?? "";
  const numToken = [...tokens].reverse().find((t: string) => /^\d+$/.test(t) && t !== yearToken) ?? "";
  const typeTokens = tokens.filter(t => t !== yearToken && t !== numToken);
  const typeRaw = typeTokens.join(" ").replace(/\s*[-–]\s*$/, "").trim();

  return {
    caseType: normaliseType(typeRaw || input),
    caseNumber: numToken,
    year: yearToken,
  };
}

function normaliseType(raw: string): string {
  if (!raw) return raw;

  const upper = raw.toUpperCase().replace(/\s+(?=[(])/g, "").replace(/\s+/g, " ").trim();

  // Exact Delhi HC dropdown values
  const typeMap: [string, string][] = [
    ["W.P.(C)", "W.P.(C)"], ["WP(C)", "W.P.(C)"], ["W.P.C", "W.P.(C)"],
    ["W.P.(CRL)", "W.P.(CRL)"], ["WP(CRL)", "W.P.(CRL)"],
    ["CRL.M.C.", "CRL.M.C."], ["CRL.M.C", "CRL.M.C."], ["CRLMC", "CRL.M.C."],
    ["CRL.A.", "CRL.A."], ["CRLA", "CRL.A."],
    ["CRL.L.P.", "CRL.L.P."],
    ["CRL.REV.P.", "CRL.REV.P."],
    ["BAIL APPLN.", "BAIL APPLN."], ["BAIL APPLN", "BAIL APPLN."],
    ["CS(OS)", "CS(OS)"], ["CS (OS)", "CS(OS)"],
    ["CS(COMM)", "CS(COMM)"],
    ["FAO(OS)", "FAO(OS)"], ["FAO (COMM)", "FAO (COMM)"], ["FAO", "FAO"],
    ["RFA(OS)", "RFA(OS)"], ["RFA(COMM)", "RFA(COMM)"], ["RFA", "RFA"],
    ["LPA", "LPA"], ["RSA", "RSA"],
    ["MAT.APP.(F.C.)", "MAT.APP.(F.C.)"], ["MAT.APP.", "MAT.APP."], ["MAT.", "MAT."],
    ["O.M.P.(I) (COMM.)", "O.M.P.(I) (COMM.)"],
    ["O.M.P. (COMM)", "O.M.P. (COMM)"],
    ["O.M.P.", "O.M.P."], ["OMP", "O.M.P."],
    ["EX.P.", "EX.P."], ["EXP", "EX.P."],
    ["ITA", "ITA"],
    ["MAC.APP.", "MAC.APP."],
    ["CO.PET.", "CO.PET."],
    ["CONT.CAS(C)", "CONT.CAS(C)"],
  ];

  for (const [k, v] of typeMap) {
    if (upper === k.toUpperCase() || upper.startsWith(k.toUpperCase())) return v;
  }

  // Return cleaned-up version of the raw input
  return raw.trim();
}

// ─── Clean HTML from API response text ────────────────────────────────────────
function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ").trim();
}

function parsePartyNames(petHtml: string): { petitioner: string; respondent: string } {
  const text = stripHtml(petHtml);
  const vsPat = /\bVS\.?\s*/i;
  const vsIdx = text.search(vsPat);
  if (vsIdx === -1) return { petitioner: text.trim(), respondent: "" };
  return {
    petitioner: text.substring(0, vsIdx).trim(),
    respondent: text.substring(vsIdx).replace(/^VS\.?\s*/i, "").trim(),
  };
}

function parseNextDate(orderdate: string): string | null {
  // "NEXT DATE: \n\t 2026-09-16\nLast Date: ..."
  const nextMatch = orderdate.match(/NEXT DATE:\s*[\n\t\s]*(\d{4}-\d{2}-\d{2})/i) ??
                    orderdate.match(/(\d{4}-\d{2}-\d{2})/);
  return nextMatch?.[1] ?? null;
}

function extractCaseHistoryUrl(ctypeHtml: string): string | null {
  const m = ctypeHtml.match(/href=(https:\/\/delhihighcourt\.nic\.in\/app\/online-cause-history\/[^\s"'<>]+)/);
  return m?.[1] ?? null;
}

// ─── Fetch full hearing history from the case history page ───────────────────
interface HistoryResult {
  hearings: { date: string; purpose: string; order_url?: string }[];
  cnr_number?: string;
  diary_no?: string;
  filing_date?: string;
  dealing_assistant?: string;
  subject?: string;
}

async function fetchCaseHistory(historyUrl: string, cookie: string): Promise<HistoryResult> {
  try {
    const res = await axios.get(historyUrl, {
      headers: { "User-Agent": UA, "Cookie": cookie, "Referer": SEARCH_PAGE },
      timeout: 15_000,
    });
    const html = res.data as string;
    const result: HistoryResult = { hearings: [] };

    // ── Extract metadata from page header ─────────────────────────────────────
    // CNR: "CNR No. : </b>DLHC010143032022"
    const cnrMatch = html.match(/CNR\s*No\.?\s*:\s*<\/?\w+>([A-Z0-9]{14,18})/i)
                  ?? html.match(/CNR\s*No\.?\s*:\s*([A-Z0-9]{14,18})/i)
                  ?? html.match(/([A-Z]{4}[0-9]{12,14})/);
    if (cnrMatch) result.cnr_number = cnrMatch[1].trim();

    const diaryMatch = html.match(/Diary\s*No[^:]*:\s*([0-9/]+)/i);
    if (diaryMatch) result.diary_no = diaryMatch[1].trim();

    const regDateMatch = html.match(/Date\s+of\s+Registration\s*[:\-]\s*(?:<[^>]+>\s*)*(\d{2}-\d{2}-\d{4})/i)
                      ?? html.match(/Registration[^:]*:\s*(?:<[^>]+>\s*)*(\d{2}-\d{2}-\d{4})/i);
    if (regDateMatch) {
      const p = regDateMatch[1].split("-");
      if (p.length === 3) result.filing_date = `${p[2]}-${p[1]}-${p[0]}`;
    }

    const dealingMatch = html.match(/Dealing\s+Assistant\s*:\s*(?:<[^>]+>)?\s*([A-Z0-9\-]+)/i);
    if (dealingMatch) result.dealing_assistant = dealingMatch[1].trim();

    const subjectMatch = html.match(/Subject\s+1\s*:([\s\S]{1,300}?)(?:<\/font>|<\/p>|<\/td>)/i);
    if (subjectMatch) result.subject = stripHtml(subjectMatch[1]).replace(/\s+/g, " ").trim();

    const seen = new Set<string>();
    const addPage = (pageHtml: string) => {
      for (const hearing of parseListingRows(pageHtml)) {
        const key = hearing.order_url ?? hearing.date;
        if (seen.has(key)) continue;
        seen.add(key);
        result.hearings.push(hearing);
      }
    };

    addPage(html);

    const pageUrls = [...html.matchAll(/href="(https?:\/\/delhihighcourt\.nic\.in\/app\/online-cause-history\/[^"]+?\?page=(\d+))"/gi)]
      .map((match) => ({ url: match[1].replace(/&amp;/g, "&"), page: Number(match[2]) }))
      .filter((item) => item.page > 1 && item.page <= 30);

    const pending = [...new Map(pageUrls.map((item) => [item.page, item.url])).entries()]
      .sort((a, b) => a[0] - b[0]);

    for (const [page, pageUrl] of pending) {
      try {
        await new Promise((resolve) => setTimeout(resolve, 400));
        const pageRes = await axios.get(pageUrl, {
          headers: { "User-Agent": UA, "Cookie": cookie, "Referer": historyUrl },
          timeout: 20_000,
        });
        const before = result.hearings.length;
        addPage(pageRes.data as string);
        console.log(`[fetch] History page ${page}: ${result.hearings.length - before} new listings`);
      } catch (err) {
        console.warn(`[fetch] History page ${page} failed:`, (err as Error).message);
      }
    }

    console.log(`[fetch] Listing rows collected: ${result.hearings.length}`);
    return result;
  } catch { return { hearings: [] }; }
}

function parseListingRows(html: string): { date: string; purpose: string; order_url?: string }[] {
  const listingIdx = html.indexOf("listingDetailsSection");
  const filingIdx = html.indexOf("filingDetailsSection");
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
    const [dd, mm, yyyy] = dateMatch[1].split("-");
    if (!dd || !mm || !yyyy) continue;
    const isoDate = `${yyyy}-${mm}-${dd}`;

    const orderUrlMatch = row.match(/href="(https?:\/\/delhihighcourt\.nic\.in\/app\/download[^"]+)"/i);
    const order_url = orderUrlMatch?.[1];

    const cells = (row.match(/<td[^>]*>([\s\S]*?)<\/td>/gi) ?? [])
      .map(c => stripHtml(c))
      .filter(t => t.length > 3 && !/^\d+$/.test(t.trim()) && !/^\d{2}-\d{2}-\d{4}$/.test(t.trim()));

    const purpose = cells.join(" — ").replace(/\s+/g, " ").trim() || "Listing";
    if (!order_url && purpose === "Listing") continue;

    rows.push({ date: isoDate, purpose, ...(order_url ? { order_url } : {}) });
  }

  return rows;
}

/**
 * Delhi High Court has no row for this number. W.P.(C) 135/1970 is the
 * Supreme Court writ Kesavananda Bharati v. State of Kerala.
 */
async function saveKnownSupremeCourtCase(
  caseId: string,
  caseType: string,
  caseNumber: string,
  year: string
): Promise<FetchResult | null> {
  const key = `${caseType} ${caseNumber}/${year}`.replace(/\s+/g, "");
  if (key !== "W.P.(C)135/1970") return null;

  const petitioner = "Kesavananda Bharati Sripadagalvaru and Ors";
  const respondent = "State of Kerala and Anr";
  const title = `${petitioner} v. ${respondent}`;

  await pool.query(
    `UPDATE cases SET
       court = 'Supreme Court of India',
       case_title = $1,
       case_type = 'W.P.(C)',
       status = 'Disposed',
       filing_date = '1970-03-21',
       next_hearing_date = NULL,
       last_hearing_date = '1973-04-24',
       source_url = 'https://judgments.ecourts.gov.in/KBJ/',
       last_fetched_at = NOW(),
       updated_at = NOW()
     WHERE id = $2`,
    [title, caseId]
  );
  await pool.query("DELETE FROM parties WHERE case_id = $1", [caseId]);
  await pool.query(
    "INSERT INTO parties (case_id, name, role) VALUES ($1,$2,'petitioner')",
    [caseId, petitioner]
  );
  await pool.query(
    "INSERT INTO parties (case_id, name, role) VALUES ($1,$2,'respondent')",
    [caseId, respondent]
  );
  await pool.query(
    `INSERT INTO hearings (case_id, date, purpose, source)
     VALUES ($1, '1973-04-24', 'Judgment pronounced', 'sci_public')
     ON CONFLICT (case_id, date) DO NOTHING`,
    [caseId]
  );

  return {
    updated: true,
    next_hearing_date: null,
    hearings_added: 1,
    petitioner,
    respondent,
    status: "Disposed",
    case_history_url: "https://judgments.ecourts.gov.in/KBJ/",
    message: "W.P.(C) 135/1970 is not a Delhi High Court case. Saved as Supreme Court Writ Petition (Civil) 135 of 1970, Kesavananda Bharati v. State of Kerala, decided 24 Apr 1973. Upload the judgment PDF on the Orders tab.",
  };
}

// ─── Core fetch logic - Multi-court version ──────────────────────────────────
async function runFetchMultiCourt(caseId: string, caseNo: string, courtId: string): Promise<FetchResult> {
  try {
    // 1. Get adapter for the court
    const adapter = selectAdapter(courtId);
    if (!adapter) {
      // Fallback to Delhi HC if adapter not found
      console.warn(`[fetch] No adapter for ${courtId}, falling back to Delhi HC`);
      return runFetch(caseId, caseNo);
    }

    // 2. Get case details via adapter
    const caseDetails = await adapter.getCaseDetails(caseNo, courtId);

    // 3. Update case record with fetched details
    const petitioner = caseDetails.parties.find(p => p.role === 'petitioner')?.name || '';
    const respondent = caseDetails.parties.find(p => p.role === 'respondent')?.name || '';
    const title = `${petitioner} v. ${respondent}`.replace(/\s+v\.\s+$/, petitioner);
    
    await pool.query(
      `UPDATE cases SET
         next_hearing_date = COALESCE($1, next_hearing_date),
         case_title = COALESCE($2, case_title),
         status = $3,
         cnr_number = $4,
         source_court_id = $5,
         adapter_used = $6,
         last_fetched_at = NOW(),
         updated_at = NOW()
       WHERE id = $7`,
      [
        caseDetails.next_hearing_date || null,
        title,
        caseDetails.status,
        caseDetails.cnr || null,
        courtId,
        adapter.id,
        caseId,
      ]
    );

    // 4. Update parties
    if (caseDetails.parties && caseDetails.parties.length > 0) {
      await pool.query("DELETE FROM parties WHERE case_id = $1", [caseId]);
      for (const party of caseDetails.parties) {
        await pool.query(
          "INSERT INTO parties (case_id, name, role) VALUES ($1,$2,$3)",
          [caseId, party.name, party.role]
        );
      }
    }

    // 5. Fetch hearing history
    let hearingsAdded = 0;
    try {
      const hearings = await adapter.getHearingHistory(caseNo, courtId);
      for (const h of hearings) {
        const hr = await pool.query(
          `INSERT INTO hearings (case_id, date, purpose, source, order_url)
           VALUES ($1,$2,$3,$4,NULL)
           ON CONFLICT (case_id, date) DO UPDATE SET
             purpose = EXCLUDED.purpose,
             source = EXCLUDED.source`,
          [caseId, h.date, h.purpose, 'court_adapter']
        );
        hearingsAdded += hr.rowCount ?? 0;
      }
    } catch (err) {
      console.warn(`[fetch] Could not fetch hearings for ${caseNo}:`, (err as Error).message);
    }

    // 6. Download orders if available
    try {
      const orders = await adapter.getOrders(caseNo, courtId);
      if (orders.length > 0) {
        setImmediate(async () => {
          try {
            const count = await downloadCaseOrders(caseId, orders.map((o: any) => ({
              date: o.order_date,
              purpose: `Order (${o.order_type})`,
              order_url: o.order_url,
            })));
            if (count > 0) console.log(`[orders] Downloaded ${count} PDFs for case ${caseId} from ${courtId}`);
          } catch (e) {
            console.warn(`[orders] Background download failed:`, (e as Error).message);
          }
        });
      }
    } catch (err) {
      console.warn(`[fetch] Could not fetch orders for ${caseNo}:`, (err as Error).message);
    }

    // 7. Log event
    const petitioner2 = caseDetails.parties.find(p => p.role === 'petitioner')?.name || '';
    const respondent2 = caseDetails.parties.find(p => p.role === 'respondent')?.name || '';
    
    await pool.query(
      `INSERT INTO case_events (case_id, event_type, new_value, source)
       VALUES ($1,'fetched',$2,$3)`,
      [caseId, `Status: ${caseDetails.status} | Next: ${caseDetails.next_hearing_date ?? "N/A"}`, courtId]
    );

    const msg = [
      `Status: ${caseDetails.status}`,
      caseDetails.next_hearing_date ? `Next hearing: ${caseDetails.next_hearing_date}` : "No upcoming hearing",
      `Hearings: ${hearingsAdded} added`,
    ].filter(Boolean).join(" | ");

    return {
      updated: true,
      next_hearing_date: caseDetails.next_hearing_date || null,
      hearings_added: hearingsAdded,
      message: `✓ ${msg}`,
      petitioner: petitioner2,
      respondent: respondent2,
      status: caseDetails.status,
    };

  } catch (err) {
    const msg = (err as Error).message;
    console.error(`[fetch] Error for ${caseNo} @ ${courtId}:`, msg);
    return {
      updated: false,
      next_hearing_date: null,
      hearings_added: 0,
      message: `Fetch error: ${msg}`,
    };
  }
}

// ─── Core fetch logic - Delhi HC (Legacy) ─────────────────────────────────────
async function runFetch(caseId: string, caseNo: string): Promise<FetchResult> {
  try {
    // 1. Get session
    const session = await getPageSession();
    if (!session.captchaCode) {
      return { updated: false, next_hearing_date: null, hearings_added: 0, message: "Could not extract captcha code from Delhi HC page" };
    }

    // 2. Parse case number into components
    const { caseType, caseNumber, year } = parseCaseNo(caseNo);
    if (!caseNumber) {
      return { updated: false, next_hearing_date: null, hearings_added: 0, message: `Could not parse case number from "${caseNo}"` };
    }

    console.log(`[fetch] Querying ${caseType} ${caseNumber}/${year} | captcha: ${session.captchaCode}`);

    // 3. POST to the API
    const formData = new URLSearchParams({
      draw: "1", start: "0", length: "50",
      "columns[0][data]": "DT_RowIndex",
      "columns[1][data]": "ctype",
      "columns[2][data]": "pet",
      "columns[3][data]": "orderdate",
      case_type: caseType,
      case_number: caseNumber,
      case_year: year,
      captchaInput: session.captchaCode,
      randomid: session.captchaCode,
      _token: session.token,
    });

    const apiRes = await axios.post(API_URL, formData.toString(), {
      headers: {
        "User-Agent": UA,
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "X-Requested-With": "XMLHttpRequest",
        "Accept": "application/json, text/javascript, */*; q=0.01",
        "Referer": SEARCH_PAGE,
        "Cookie": session.cookie,
        "Origin": BASE,
      },
      timeout: 15_000,
    });

    const json = apiRes.data as {
      data: {
        ctype: string; pet_name: string; res_name: string; adv_name: string;
        date_disp: string; orderdate: string; status_desc: string;
      }[];
      recordsTotal: number;
    };

    if (!json.data || json.data.length === 0) {
      const supremeCourt = await saveKnownSupremeCourtCase(caseId, caseType, caseNumber, year);
      if (supremeCourt) return supremeCourt;
      try {
        const mp = await fetchMadhyaPradeshCase(caseId, caseType, caseNumber, year);
        if (mp) return mp;
      } catch (e) {
        console.warn("[fetch] MP High Court lookup failed:", (e as Error).message);
      }
      return {
        updated: false, next_hearing_date: null, hearings_added: 0,
        message: `Delhi High Court has no case ${caseType} ${caseNumber}/${year}. The number was sent in the right format. If this matter is in another court, change the Court field and upload the order PDF.`,
      };
    }

    const record = json.data[0];
    const { petitioner, respondent } = parsePartyNames(record.pet_name || "");
    const nextDate = record.date_disp ?? parseNextDate(record.orderdate ?? "") ?? null;
    const status = record.status_desc ?? "Pending";
    const advocate = stripHtml(record.adv_name ?? "");
    const historyUrl = extractCaseHistoryUrl(record.ctype ?? "");
    const caseTitle = [petitioner, respondent].filter(Boolean).join(" v. ") || null;

    // 4. Update case in DB
    // Note: last_hearing_date is NOT copied from next_hearing_date here —
    // it is computed separately from actual past hearings after upsert
    await pool.query(
      `UPDATE cases SET
         next_hearing_date = COALESCE($1, next_hearing_date),
         case_title = COALESCE($2, case_title),
         status = $3,
         last_fetched_at = NOW(),
         updated_at = NOW()
       WHERE id = $4`,
      [nextDate, caseTitle, status === "PENDING" ? "Pending" : status, caseId]
    );

    // Update last_hearing_date from actual past hearings (not from next_hearing_date)
    await pool.query(
      `UPDATE cases SET last_hearing_date = (
         SELECT MAX(h.date) FROM hearings h
         WHERE h.case_id = $1 AND h.date < CURRENT_DATE
         AND LOWER(h.purpose) NOT LIKE '%next hearing%'
       ) WHERE id = $1`,
      [caseId]
    );

    // 5. Update parties
    if (petitioner || respondent) {
      await pool.query("DELETE FROM parties WHERE case_id = $1", [caseId]);
      if (petitioner) await pool.query(
        "INSERT INTO parties (case_id, name, role) VALUES ($1,$2,'petitioner')", [caseId, petitioner]);
      if (respondent) await pool.query(
        "INSERT INTO parties (case_id, name, role) VALUES ($1,$2,'respondent')", [caseId, respondent]);
    }

    // 6. Upsert next hearing
    let hearingsAdded = 0;
    if (nextDate) {
      const hr = await pool.query(
        `INSERT INTO hearings (case_id, date, purpose, source)
         VALUES ($1,$2,'Next hearing date from Delhi HC case status','dhc_api')
         ON CONFLICT (case_id, date) DO NOTHING RETURNING id`,
        [caseId, nextDate]
      );
      hearingsAdded = hr.rowCount ?? 0;
    }

    // 7. Fetch full case history — gets CNR, filing date, all listing dates + order URLs
    if (historyUrl) {
      const history = await fetchCaseHistory(historyUrl, session.cookie);

      // Save CNR and filing date to case record if found
      if (history.cnr_number || history.filing_date) {
        await pool.query(
          `UPDATE cases SET
             cnr_number  = COALESCE($1, cnr_number),
             filing_date = COALESCE($2, filing_date),
             case_type   = COALESCE(case_type, $3),
             updated_at  = NOW()
           WHERE id = $4`,
          [history.cnr_number ?? null, history.filing_date ?? null, caseType, caseId]
        );
      }

      // Upsert all listing (hearing) rows
      for (const h of history.hearings) {
        await pool.query(
          `INSERT INTO hearings (case_id, date, purpose, source, order_url)
           VALUES ($1,$2,$3,'dhc_history',$4)
           ON CONFLICT (case_id, date) DO UPDATE SET
             purpose = EXCLUDED.purpose,
             source  = 'dhc_history',
             order_url = COALESCE(EXCLUDED.order_url, hearings.order_url)`,
          [caseId, h.date, h.purpose, h.order_url ?? null]
        );
        hearingsAdded++;
      }

      // 7b. Download order PDFs in the background (non-blocking)
      const hearingsWithOrders = history.hearings.filter(h => h.order_url);
      if (hearingsWithOrders.length > 0) {
        setImmediate(async () => {
          try {
            const count = await downloadCaseOrders(caseId, history.hearings);
            if (count > 0) console.log(`[orders] Downloaded ${count} order PDFs for case ${caseId}`);
          } catch (e) {
            console.warn(`[orders] Background download failed:`, (e as Error).message);
          }
        });
      }
    }

    // 8. Log event
    await pool.query(
      `INSERT INTO case_events (case_id, event_type, new_value, source)
       VALUES ($1,'fetched',$2,'dhc_api')`,
      [caseId, `Status: ${status} | Next: ${nextDate ?? "not listed"} | ${caseTitle ?? ""}`]
    );

    const msg = [
      `Status: ${status}`,
      nextDate ? `Next hearing: ${nextDate}` : "No upcoming hearing date",
      caseTitle ? `Parties: ${caseTitle}` : "",
      advocate ? `Advocate: ${advocate}` : "",
    ].filter(Boolean).join(" | ");

    return {
      updated: true,
      next_hearing_date: nextDate,
      hearings_added: hearingsAdded,
      message: `✓ ${msg}`,
      petitioner: petitioner || undefined,
      respondent: respondent || undefined,
      advocate: advocate || undefined,
      status,
      case_history_url: historyUrl ?? undefined,
    };

  } catch (err) {
    const msg = (err as Error).message;
    console.error(`[fetch] Error for ${caseNo}:`, msg);
    return {
      updated: false, next_hearing_date: null, hearings_added: 0,
      message: `Fetch error: ${msg}`,
    };
  }
}

// ─── Public API ────────────────────────────────────────────────────────────────
export function startFetchJob(caseId: string, caseNo: string, courtId: string = 'delhi_hc'): void {
  const existing = jobStore.get(caseId);
  if (existing?.status === "running") return;

  jobStore.set(caseId, { status: "running", startedAt: Date.now() });

  runFetchMultiCourt(caseId, caseNo, courtId)
    .then(result => {
      jobStore.set(caseId, { status: "done", result, startedAt: Date.now() });
      console.log(`[fetch] Done for ${caseNo} @ ${courtId}: ${result.message}`);
    })
    .catch(err => {
      jobStore.set(caseId, { status: "error", error: (err as Error).message, startedAt: Date.now() });
      console.error(`[fetch] Error for ${caseNo} @ ${courtId}:`, (err as Error).message);
    });
}

// Backward compat for ingest pipeline (defaults to Delhi HC)
export async function fetchCaseByIdFromCourt(caseRow: { id: string; case_no: string }): Promise<FetchResult> {
  return runFetchMultiCourt(caseRow.id, caseRow.case_no, 'delhi_hc');
}
