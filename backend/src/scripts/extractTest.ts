/**
 * Step 2: Download one Delhi HC cause-list PDF and print raw extracted text.
 * Run with: npm run extract-test
 *
 * Purpose: confirm pdf-parse works on the real site before writing any parser.
 */
import axios from "axios";
import * as dotenv from "dotenv";

// pdf-parse v2 uses class-based API
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { PDFParse } = require("pdf-parse") as {
  PDFParse: new (opts: { data: Buffer; verbosity?: number }) => {
    getText(opts?: object): Promise<{ text: string }>;
  };
};

dotenv.config();

const BASE_URL = "https://delhihighcourt.nic.in";

// The listing page we scrape to find today's main cause list PDF
const LISTING_URL = `${BASE_URL}/web/index.php/cause-lists/cause-list`;

/**
 * Fetch the HTML of the cause-list index page and return all PDF hrefs.
 */
async function fetchListingPdfLinks(): Promise<{ title: string; href: string; date: string }[]> {
  const res = await axios.get(LISTING_URL, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; LegalMVP/1.0; +https://example.com/bot)",
    },
    timeout: 15_000,
    responseType: "text",
  });

  const html: string = res.data;

  // Pull rows from the table. Each row has: title, date, and a pdf href.
  const rowPattern =
    /<tr[\s\S]*?views-field-title[^>]*>([\s\S]*?)<\/td>[\s\S]*?views-field-field-date[^>]*>([\s\S]*?)<\/td>[\s\S]*?href="(\/files\/[^"]+\.pdf)"[\s\S]*?<\/tr>/gi;

  const results: { title: string; href: string; date: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = rowPattern.exec(html)) !== null) {
    const title = m[1].replace(/<[^>]+>/g, "").trim();
    const date = m[2].replace(/<[^>]+>/g, "").trim();
    const href = m[3].trim();
    results.push({ title, date, href });
  }
  return results;
}

/**
 * Download a PDF from a relative href and return parsed text.
 */
async function downloadAndExtractPdf(relativeHref: string): Promise<string> {
  const url = `${BASE_URL}${relativeHref}`;
  console.log(`[extract] Downloading: ${url}`);

  const res = await axios.get(url, {
    responseType: "arraybuffer",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; LegalMVP/1.0; +https://example.com/bot)",
    },
    timeout: 30_000,
  });

  const buffer = Buffer.from(res.data);
  const data = await new PDFParse({ data: buffer, verbosity: 0 }).getText();
  return data.text;
}

async function main() {
  console.log("[extract] Fetching cause-list index...");
  const links = await fetchListingPdfLinks();
  console.log(`[extract] Found ${links.length} PDF links on listing page`);

  if (links.length === 0) {
    console.error("[extract] No PDFs found — site structure may have changed");
    process.exit(1);
  }

  // Pick the first "ADVANCE CAUSE LIST OF CASES FOR" entry (the main daily list)
  // Skip mediation/supplementary lists — they have fewer cases.
  const mainList =
    links.find(
      (l) =>
        /ADVANCE CAUSE LIST OF CASES FOR \d/i.test(l.title) &&
        !/MEDIATION|SUPPLEMENTARY/i.test(l.title)
    ) ?? links[0];

  console.log(`[extract] Using: "${mainList.title}" (${mainList.date})`);

  const text = await downloadAndExtractPdf(mainList.href);

  console.log("\n========== RAW EXTRACTED TEXT (first 3000 chars) ==========\n");
  console.log(text.substring(0, 3000));
  console.log("\n========== END ==========\n");
  console.log(`[extract] Total chars extracted: ${text.length}`);
}

main().catch((err) => {
  console.error("[extract] Fatal error:", (err as Error).message);
  process.exit(1);
});
