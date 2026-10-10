/**
 * Order PDF service.
 *
 * Downloads order PDFs from Delhi HC (URLs found in the case history page),
 * extracts text using pdf-parse, and stores them in:
 *   - DB: orders table (order_date, type, text_content, pdf_url)
 *   - Disk: backend/uploads/<case_id>/<YYYY-MM-DD>.pdf
 */
import * as fs from "fs";
import * as path from "path";
import { pool } from "../db/client";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { PDFParse } = require("pdf-parse") as {
  PDFParse: new (opts: { data: Buffer; verbosity?: number }) => { getText(): Promise<{ text: string }> };
};

const UA = "Mozilla/5.0 (compatible; LegalMVP/1.0; +https://example.com/bot)";
export const UPLOADS_DIR = path.join(__dirname, "../../uploads");

// ─── Ensure uploads directory exists ─────────────────────────────────────────
function ensureDir(caseId: string): string {
  const dir = path.join(UPLOADS_DIR, caseId);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// ─── Stream buffer from URL ───────────────────────────────────────────────────
function streamToBuffer(url: string, maxMb = 10): Promise<Buffer> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const https = require("https") as typeof import("https");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const http  = require("http")  as typeof import("http");
  const maxBytes = maxMb * 1024 * 1024;

  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https") ? https : http;
    const req = lib.get(url, { headers: { "User-Agent": UA }, timeout: 30_000 }, res => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        const next = res.headers.location.startsWith("http") ? res.headers.location
          : `https://delhihighcourt.nic.in${res.headers.location}`;
        return resolve(streamToBuffer(next, maxMb));
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(`HTTP ${res.statusCode}`)); }
      const chunks: Buffer[] = [];
      let total = 0;
      res.on("data", (c: Buffer) => {
        total += c.length;
        if (total > maxBytes) { req.destroy(); return reject(new Error(`File too large (>${maxMb}MB)`)); }
        chunks.push(c);
      });
      res.on("end", () => resolve(Buffer.concat(chunks)));
      res.on("error", reject);
    });
    req.on("timeout", () => { req.destroy(); reject(new Error("Download timeout")); });
    req.on("error", reject);
  });
}

// ─── Classify order type from listing text ────────────────────────────────────
function classifyOrderType(purpose: string): string {
  const p = purpose.toUpperCase();
  if (p.includes("JUDGMENT") || p.includes("JUDGEMENT")) return "Judgment";
  if (p.includes("FINAL ORDER")) return "Final Order";
  if (p.includes("INTERIM") || p.includes("STAY") || p.includes("INJUNCTION")) return "Interim Order";
  if (p.includes("NOTICE")) return "Notice";
  if (p.includes("PRONOUNCEMENT")) return "Judgment";
  return "Order";
}

// ─── Extract court number from listing text ───────────────────────────────────
function extractCourtNo(text: string): string | null {
  const m = text.match(/COURT\s+NO\.?\s*(\d+)/i) ?? text.match(/\(Sitting Court\s*[-–]\s*(\d+)\)/i);
  return m ? `Court No. ${m[1]}` : null;
}

export interface OrderRecord {
  order_date: string;
  order_type: string;
  court_no: string | null;
  pdf_url: string;
  local_path: string | null;
  file_size: number | null;
  text_content: string | null;
}

/**
 * Download and process a single order PDF.
 * Returns the saved record or null if failed/already exists.
 */
export async function downloadAndSaveOrder(
  caseId: string,
  orderDate: string,   // ISO YYYY-MM-DD
  pdfUrl: string,
  purpose: string
): Promise<OrderRecord | null> {
  // Check if already downloaded
  const existing = await pool.query(
    "SELECT id, local_path FROM orders WHERE case_id=$1 AND order_date=$2",
    [caseId, orderDate]
  );
  if (existing.rows[0]?.local_path) return null;

  let orderType = classifyOrderType(purpose);
  const courtNo = extractCourtNo(purpose);
  const dir = ensureDir(caseId);
  const filename = `${orderDate}.pdf`;
  const localPath = path.join(dir, filename);
  const relativePath = `${caseId}/${filename}`;

  let buffer: Buffer | null = null;
  let textContent: string | null = null;
  let fileSize: number | null = null;

  try {
    buffer = await streamToBuffer(pdfUrl, 15);
    // Verify it's a PDF
    if (buffer.subarray(0, 4).toString("ascii") !== "%PDF") {
      console.warn(`[orders] Not a PDF at ${pdfUrl}`);
      return null;
    }

    fileSize = buffer.length;

    // Save to disk
    fs.writeFileSync(localPath, buffer);

    // Extract text
    try {
      const parsed = await new PDFParse({ data: buffer, verbosity: 0 }).getText();
      textContent = parsed.text?.substring(0, 50000) ?? null; // cap at 50KB text
      if (textContent && /judgment pronounced|judgement pronounced|\bJUDGMENT\b/i.test(textContent.slice(0, 2500))) {
        orderType = "Judgment";
      }
    } catch { textContent = null; }

  } catch (e) {
    console.warn(`[orders] Failed to download ${pdfUrl}:`, (e as Error).message);
    // Still save the record with just the URL, no local file
  }

  // Upsert into DB
  await pool.query(
    `INSERT INTO orders (case_id, order_date, order_type, court_no, pdf_url, local_path, file_size, text_content, source)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'dhc_history')
     ON CONFLICT (case_id, order_date) DO UPDATE SET
       order_type = EXCLUDED.order_type,
       pdf_url = EXCLUDED.pdf_url,
       local_path = COALESCE(EXCLUDED.local_path, orders.local_path),
       file_size = COALESCE(EXCLUDED.file_size, orders.file_size),
       text_content = COALESCE(EXCLUDED.text_content, orders.text_content)`,
    [caseId, orderDate, orderType, courtNo, pdfUrl, buffer ? relativePath : null, fileSize, textContent]
  );

  return {
    order_date: orderDate,
    order_type: orderType,
    court_no: courtNo,
    pdf_url: pdfUrl,
    local_path: buffer ? relativePath : null,
    file_size: fileSize,
    text_content: textContent,
  };
}

/**
 * Download all orders for a case from its listing history.
 * Called after fetchCaseHistory completes.
 */
export async function downloadCaseOrders(
  caseId: string,
  hearings: { date: string; purpose: string; order_url?: string }[]
): Promise<number> {
  let downloaded = 0;
  let attempted = 0;

  for (const h of hearings) {
    if (!h.order_url || attempted >= 200) continue;
    attempted++;
    await new Promise(r => setTimeout(r, 500));
    try {
      const result = await downloadAndSaveOrder(caseId, h.date, h.order_url, h.purpose);
      if (result) { downloaded++; console.log(`[orders] Downloaded ${h.date} order for case ${caseId}`); }
    } catch { /* skip individual failures */ }
  }

  return downloaded;
}

const ORDER_TYPES = new Set(["Order", "Judgment", "Final Order", "Interim Order", "Notice"]);

/** Save a PDF the user uploaded when the court site has no file. */
export async function saveManualOrder(
  caseId: string,
  orderDate: string,
  orderType: string,
  buffer: Buffer,
  meta?: { source?: string; pdfUrl?: string }
): Promise<OrderRecord> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(orderDate)) throw new Error("Order date must be YYYY-MM-DD");
  if (!ORDER_TYPES.has(orderType)) throw new Error("Unknown order type");
  if (buffer.subarray(0, 5).toString("ascii") !== "%PDF-") throw new Error("File is not a PDF");

  const dir = ensureDir(caseId);
  const filename = `${orderDate}.pdf`;
  fs.writeFileSync(path.join(dir, filename), buffer);
  const relativePath = `${caseId}/${filename}`;

  let textContent: string | null = null;
  try {
    const parsed = await new PDFParse({ data: buffer, verbosity: 0 }).getText();
    textContent = parsed.text?.substring(0, 50000) ?? null;
  } catch { textContent = null; }

  const source = meta?.source ?? "manual";
  const pdfUrl = meta?.pdfUrl ?? "manual";

  await pool.query(
    `INSERT INTO orders (case_id, order_date, order_type, pdf_url, local_path, file_size, text_content, source)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (case_id, order_date) DO UPDATE SET
       order_type = EXCLUDED.order_type,
       pdf_url = EXCLUDED.pdf_url,
       local_path = EXCLUDED.local_path,
       file_size = EXCLUDED.file_size,
       text_content = EXCLUDED.text_content,
       source = EXCLUDED.source`,
    [caseId, orderDate, orderType, pdfUrl, relativePath, buffer.length, textContent, source]
  );

  return {
    order_date: orderDate,
    order_type: orderType,
    court_no: null,
    pdf_url: pdfUrl,
    local_path: relativePath,
    file_size: buffer.length,
    text_content: textContent,
  };
}
