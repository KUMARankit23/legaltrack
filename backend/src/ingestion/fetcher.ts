/**
 * Fetches the Delhi HC cause-list index page, finds the best PDF for today,
 * downloads it, and returns the raw text.
 *
 * "Best PDF" = the "ADVANCE CAUSE LIST OF CASES FOR <date>" entry.
 * If that's absent (non-court day, etc.), returns null so the caller can skip.
 */
import axios, { AxiosError } from "axios";

// pdf-parse v2 uses class-based API: new PDFParse({ data, verbosity }).getText()
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { PDFParse } = require("pdf-parse") as {
  PDFParse: new (opts: { data: Buffer; verbosity?: number }) => {
    getText(opts?: object): Promise<{ text: string }>;
  };
};

const BASE_URL = "https://delhihighcourt.nic.in";
const LISTING_URL = `${BASE_URL}/web/index.php/cause-lists/cause-list`;

// Rate-limit: wait this many ms before each HTTP request
const REQUEST_DELAY_MS = 3000;

const HTTP_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (compatible; LegalMVP/1.0; +https://example.com/bot)",
  Accept: "text/html,application/pdf",
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface CauseListEntry {
  title: string;
  date: string;   // "DD-MM-YYYY"
  href: string;   // relative path, e.g. "/files/2026-09/cause-list/foo.pdf"
}

/**
 * Scrape the listing page and return all PDF entries.
 */
async function fetchListingEntries(): Promise<CauseListEntry[]> {
  let html: string;
  try {
    const res = await axios.get<string>(LISTING_URL, {
      headers: HTTP_HEADERS,
      timeout: 20_000,
      responseType: "text",
    });
    html = res.data;
  } catch (err) {
    const axErr = err as AxiosError;
    throw new Error(
      `Listing page fetch failed (${axErr.response?.status ?? "network error"}): ${axErr.message}`
    );
  }

  // Check for CAPTCHA page (site sometimes returns a challenge page)
  if (
    html.toLowerCase().includes("captcha") ||
    html.toLowerCase().includes("access denied") ||
    html.toLowerCase().includes("403 forbidden")
  ) {
    throw new Error("CAPTCHA or access-denied response from listing page — pausing adapter");
  }

  const rowPattern =
    /<td[^>]*views-field-title[^>]*>([\s\S]*?)<\/td>[\s\S]*?views-field-field-date[^>]*>([\s\S]*?)<\/td>[\s\S]*?href="(\/files\/[^"]+\.pdf)"/gi;

  const entries: CauseListEntry[] = [];
  let m: RegExpExecArray | null;
  while ((m = rowPattern.exec(html)) !== null) {
    entries.push({
      title: m[1].replace(/<[^>]+>/g, "").trim(),
      date: m[2].replace(/<[^>]+>/g, "").trim(),
      href: m[3].trim(),
    });
  }
  return entries;
}

/**
 * Pick the best entry for daily ingestion:
 * Prefer the "ADVANCE CAUSE LIST OF CASES FOR <date>" (not mediation, not supplementary).
 */
function selectMainEntry(entries: CauseListEntry[]): CauseListEntry | null {
  return (
    entries.find(
      (e) =>
        /ADVANCE CAUSE LIST OF CASES FOR\s+\d/i.test(e.title) &&
        !/MEDIATION|SUPPLEMENTARY|ORIGINAL SIDE/i.test(e.title)
    ) ?? null
  );
}

/**
 * Download a PDF via a raw Node https stream (avoids undici body-size limits
 * that abort large arraybuffer downloads on Node 22) and extract text.
 */
async function downloadAndParse(relHref: string): Promise<string> {
  const url = `${BASE_URL}${relHref}`;
  console.log(`[fetcher] Downloading PDF: ${url}`);

  const buffer = await streamToBuffer(url);

  // Sanity-check: if the response is HTML (CAPTCHA/blocked) rather than PDF
  const magic = buffer.slice(0, 4).toString("ascii");
  if (magic !== "%PDF") {
    throw new Error(
      `Downloaded file is not a PDF (starts with "${magic}") — site may have returned a CAPTCHA/block page`
    );
  }

  console.log(`[fetcher] PDF buffered (${(buffer.length / 1024).toFixed(0)} KB), parsing...`);
  const parsed = await new PDFParse({ data: buffer, verbosity: 0 }).getText();
  return parsed.text;
}

/**
 * Download a URL into a Buffer using Node's built-in https module.
 * Follows up to 3 redirects, times out after 60 s.
 */
function streamToBuffer(url: string, redirectsLeft = 3): Promise<Buffer> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const https = require("https") as typeof import("https");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const http  = require("http")  as typeof import("http");

  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https") ? https : http;
    const req = lib.get(
      url,
      {
        headers: {
          "User-Agent": HTTP_HEADERS["User-Agent"],
          Accept: "application/pdf",
        },
        timeout: 60_000,
      },
      (res) => {
        // Follow redirects
        if (
          res.statusCode &&
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location
        ) {
          res.resume(); // drain
          if (redirectsLeft === 0) {
            return reject(new Error("Too many redirects"));
          }
          const next = res.headers.location.startsWith("http")
            ? res.headers.location
            : `${BASE_URL}${res.headers.location}`;
          return resolve(streamToBuffer(next, redirectsLeft - 1));
        }

        if (res.statusCode && res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`HTTP ${res.statusCode} downloading PDF`));
        }

        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => resolve(Buffer.concat(chunks)));
        res.on("error", reject);
      }
    );
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("PDF download timed out after 60 s"));
    });
    req.on("error", reject);
  });
}

export interface FetchResult {
  title: string;
  date: string;
  text: string;
}

/**
 * Main entry point: fetch the listing, pick today's cause list, download and parse it.
 * Returns null if there's no main cause list available today (e.g. court holiday).
 */
export async function fetchDelhiHCCauseList(): Promise<FetchResult | null> {
  console.log("[fetcher] Fetching Delhi HC cause-list index...");
  const entries = await fetchListingEntries();
  console.log(`[fetcher] Found ${entries.length} entries on listing page`);

  if (entries.length === 0) {
    console.warn("[fetcher] No entries found — site structure may have changed");
    return null;
  }

  const entry = selectMainEntry(entries);
  if (!entry) {
    console.warn(
      "[fetcher] No main 'ADVANCE CAUSE LIST' entry found — may be a non-court day"
    );
    return null;
  }

  console.log(`[fetcher] Selected: "${entry.title}" (${entry.date})`);

  // Polite delay before fetching the PDF
  await sleep(REQUEST_DELAY_MS);

  const text = await downloadAndParse(entry.href);
  console.log(`[fetcher] Extracted ${text.length} characters from PDF`);

  return { title: entry.title, date: entry.date, text };
}
