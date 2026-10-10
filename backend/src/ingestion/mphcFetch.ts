/**
 * Madhya Pradesh High Court case search.
 * https://mphc.gov.in/case-status accepts a case type, number, and year
 * with no captcha. Their TLS chain does not verify on this machine, so
 * requests to this host only skip certificate verification.
 */
import axios from "axios";
import https from "https";
import { pool } from "../db/client";
import { saveManualOrder } from "./orderService";

const PAGE = "https://mphc.gov.in/case-status";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const agent = new https.Agent({ rejectUnauthorized: false });

const TYPE_CODES: Record<string, string> = {
  "W.P.(C)": "11",
  "WP(C)": "11",
  "W.P.": "11",
  "WP": "11",
  "WPS": "32",
  "WA": "57",
  "FA": "13",
  "SA": "14",
  "CRA": "51",
  "CRR": "53",
  "MCRC": "52",
  "LPA": "17",
  "MA": "12",
  "MCC": "18",
  "CONT": "15",
};

function mphcTypeCode(caseType: string): string | null {
  const key = caseType.toUpperCase().replace(/\s+/g, "");
  return TYPE_CODES[key] ?? (key.startsWith("W.P.(C)") ? "11" : null);
}

function strip(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function cell(html: string, label: string): string {
  const re = new RegExp(`label-cell[^>]*>[^<]*${label}[\\s\\S]*?</td>\\s*<td[^>]*>([\\s\\S]*?)</td>`, "i");
  return html.match(re)?.[1] ?? "";
}

function names(html: string, label: string): string[] {
  const block = cell(html, label);
  return [...block.matchAll(/fw-semibold">([^<]+)/g)]
    .map(m => strip(m[1]))
    .filter(Boolean);
}

function toIso(dmy: string | undefined): string | null {
  if (!dmy) return null;
  const m = dmy.match(/(\d{2})-(\d{2})-(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

export async function fetchMadhyaPradeshCase(
  caseId: string,
  caseType: string,
  caseNumber: string,
  year: string
): Promise<{
  updated: boolean;
  next_hearing_date: string | null;
  hearings_added: number;
  message: string;
  petitioner?: string;
  respondent?: string;
  status?: string;
  case_history_url?: string;
} | null> {
  const code = mphcTypeCode(caseType);
  if (!code || !caseNumber || !year) return null;

  const page = await axios.get(PAGE, {
    headers: { "User-Agent": UA, Accept: "text/html" },
    timeout: 20_000,
    httpsAgent: agent,
  });
  const token = String(page.data).match(/name="_token"\s+value="([^"]+)"/)?.[1] ?? "";
  const setCookie = page.headers["set-cookie"] ?? [];
  const cookie = (Array.isArray(setCookie) ? setCookie : [setCookie])
    .map((c: string) => c.split(";")[0])
    .join("; ");

  const body = new URLSearchParams({
    _token: token,
    branch: "01",
    fil_no: "",
    case_type: code,
    case_no: caseNumber,
    year_registration: year,
  });
  const res = await axios.post(PAGE, body.toString(), {
    headers: {
      "User-Agent": UA,
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: cookie,
      Referer: PAGE,
      Origin: "https://mphc.gov.in",
    },
    timeout: 25_000,
    httpsAgent: agent,
    validateStatus: () => true,
  });
  const html = String(res.data);
  if (!html.includes("case-details-table")) return null;

  const caseNoText = strip(cell(html, "Case No\\."));
  const petitioners = names(html, "Petitioner\\(s\\)");
  const respondents = names(html, "Respondent\\(s\\)");
  const statusText = strip(cell(html, "Status"));
  const disposed = /disposed/i.test(statusText) || /Disposed/.test(html.slice(html.indexOf("case-details-table"), html.indexOf("case-details-table") + 2500));
  const filing = toIso(caseNoText.match(/Registered On\s+(\d{2}-\d{2}-\d{4})/i)?.[1]);
  const cnr = caseNoText.match(/CNR:\s*([A-Z0-9]+)/i)?.[1] ?? null;
  const lastHeard = toIso(strip(cell(html, "Last Listed On")).match(/\d{2}-\d{2}-\d{4}/)?.[0]);
  const lastOrder = strip(cell(html, "Last Order")) || (disposed ? "Disposed" : "Listing");
  const title = [petitioners[0], respondents[0]].filter(Boolean).join(" v. ") || null;
  const status = disposed ? "Disposed" : "Pending";

  await pool.query(
    `UPDATE cases SET
       court = 'Madhya Pradesh High Court',
       case_title = COALESCE($1, case_title),
       case_type = $2,
       status = $3,
       filing_date = COALESCE($4::date, filing_date),
       cnr_number = COALESCE($5, cnr_number),
       next_hearing_date = CASE WHEN $3 = 'Disposed' THEN NULL ELSE next_hearing_date END,
       last_hearing_date = COALESCE($6::date, last_hearing_date),
       source_url = $7,
       last_fetched_at = NOW(),
       updated_at = NOW()
     WHERE id = $8`,
    [title, caseType, status, filing, cnr, lastHeard, PAGE, caseId]
  );

  if (petitioners.length || respondents.length) {
    await pool.query("DELETE FROM parties WHERE case_id = $1", [caseId]);
    for (const name of petitioners) {
      await pool.query(
        "INSERT INTO parties (case_id, name, role) VALUES ($1,$2,'petitioner')",
        [caseId, name]
      );
    }
    for (const name of respondents) {
      await pool.query(
        "INSERT INTO parties (case_id, name, role) VALUES ($1,$2,'respondent')",
        [caseId, name]
      );
    }
  }

  let hearingsAdded = 0;
  if (lastHeard) {
    const hr = await pool.query(
      `INSERT INTO hearings (case_id, date, purpose, source)
       VALUES ($1,$2,$3,'mphc')
       ON CONFLICT (case_id, date) DO UPDATE SET purpose = EXCLUDED.purpose
       RETURNING id`,
      [caseId, lastHeard, lastOrder]
    );
    hearingsAdded = hr.rowCount ?? 0;
  }

  let savedPdfs = 0;
  try {
    const docs = await axios.get("https://mphc.gov.in/judgements/case-number", {
      params: { branch: "01", case_type: code, case_no: caseNumber, year_registration: year },
      headers: {
        "User-Agent": UA,
        Accept: "application/json",
        "X-Requested-With": "XMLHttpRequest",
        Referer: "https://mphc.gov.in/judgements",
      },
      timeout: 20_000,
      httpsAgent: agent,
    });
    const items = (docs.data?.items ?? []) as { orderdate?: string; type?: string; pdf_url?: string }[];
    for (const item of items) {
      if (!item.pdf_url || !item.orderdate) continue;
      try {
        const file = await axios.get<ArrayBuffer>(item.pdf_url, {
          responseType: "arraybuffer",
          timeout: 30_000,
          httpsAgent: agent,
          headers: { "User-Agent": UA },
        });
        const buffer = Buffer.from(file.data);
        if (buffer.subarray(0, 5).toString("ascii") !== "%PDF-") continue;
        const orderType = String(item.type).toUpperCase() === "FO" ? "Judgment" : "Order";
        await saveManualOrder(caseId, item.orderdate.slice(0, 10), orderType, buffer, {
          source: "mphc",
          pdfUrl: item.pdf_url,
        });
        savedPdfs++;
      } catch (e) {
        console.warn("[fetch] MP order download failed:", (e as Error).message);
      }
    }
  } catch (e) {
    console.warn("[fetch] MP judgment list failed:", (e as Error).message);
  }

  const who = title ? ` ${title}.` : "";
  return {
    updated: true,
    next_hearing_date: disposed ? null : lastHeard,
    hearings_added: hearingsAdded,
    petitioner: petitioners[0],
    respondent: respondents[0],
    status,
    case_history_url: PAGE,
    message: `Fetched from Madhya Pradesh High Court: WP ${caseNumber}/${year}.${who} ${status}${cnr ? `, CNR ${cnr}` : ""}. Saved ${savedPdfs} order PDF${savedPdfs === 1 ? "" : "s"}.`,
  };
}
