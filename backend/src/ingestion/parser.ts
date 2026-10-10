/**
 * Step 3: Parse Delhi HC cause-list PDF text into structured records.
 *
 * The Delhi HC cause-list PDF extracts as a stream of lines. When rendered
 * by pdf-parse the columnar table layout merges into a line-by-line sequence
 * that looks roughly like:
 *
 *   ITEM\nNUMBER CASE NUMBER\nPARTY NAME\n...  (header)
 *   ...
 *   1\n
 *   W.P.(C)-1234/2026\n
 *   SOME PETITIONER NAME\n
 *   V/s SOME RESPONDENT NAME\n
 *   ADV NAME\n
 *   SOME NOTES\n
 *   \n
 *   2\n
 *   BAIL APPLN.-5678/2026\n
 *   ...
 *
 * Because the PDF is multi-column, pdf-parse often merges columns into a
 * single line like:
 *   "1  W.P.(C)-1234/2026  PETITIONER V/s RESPONDENT  Adv Name  Notes"
 *
 * We handle both: the "merged single line" format and the "each field on its
 * own line" format.
 *
 * Key patterns:
 *   - Case numbers: W.P.(C)-NNNN/YYYY, BAIL APPLN.-NNNN/YYYY, CS(OS)-NNN/YYYY,
 *                   CRL.A.-NNN/YYYY, FAO(OS)-NNN/YYYY, etc.
 *   - Party separator: "V/s", "Vs.", "VERSUS", "vs."
 *   - Date header: "CAUSELIST FOR DD-MM-YYYY" or "FOR DD.MM.YYYY"
 */

export interface ParsedCase {
  case_no: string;
  case_year: number | null;
  petitioner: string;
  respondent: string;
  /** The date from the cause-list header, i.e. the hearing date */
  next_hearing_date: string | null; // ISO YYYY-MM-DD
  raw_advocates: string;
}

// Matches Delhi HC case number formats, e.g.:
//   W.P.(C)-1234/2026   W.P.(CRL)-5/2024   BAIL APPLN.-898/2026
//   CS(OS)-123/2025     CS(COMM)-1/2026     FAO(OS)-44/2026
//   CRL.A.-100/2024     CRL.M.A.-5/2026     MAT.APP.(F.C.)-1/2026
//   RFA-5/2026          CM APPL.-123/2026    EX.P.-1/2026
//   SLP(C)-1/2026       ITA-5/2026           OMP(I)(COMM)-1/2026
const CASE_NO_PATTERN =
  /(?:W\.P\.|BAIL\s+APPLN\.|CS(?:\(OS\)|\(COMM\))?|FAO(?:\(OS\)|\(COMM\))?|CRL\.[A-Z.]+|MAT\.APP\.[A-Z.()\s]+|RFA|CM\s+APPL\.|EX\.P\.|SLP[A-Z.()\s]*|ITA|OMP[A-Z.()\s]*|RSA|LPA|IA\s+No\.|CO)[^\n/]*\/\d{4}/gi;

// Simpler extractor for the year from a case number
function extractYear(caseNo: string): number | null {
  const m = caseNo.match(/\/(\d{4})$/);
  return m ? parseInt(m[1], 10) : null;
}

/**
 * Extract the hearing date from lines like:
 *   "CAUSELIST FOR 02-03-2026"
 *   "FOR 08.09.2026"
 *   "WEDNESDAY, THE 03RD JUNE, 2026"
 *   "09.09.2026" (in filename embedded in the PDF header)
 */
function extractHearingDateFromText(text: string): string | null {
  // Pattern 1: DD-MM-YYYY or DD.MM.YYYY
  const p1 = text.match(/\b(\d{2})[-.](\d{2})[-.](\d{4})\b/);
  if (p1) {
    return `${p1[3]}-${p1[2]}-${p1[1]}`;
  }
  // Pattern 2: Month name like "03RD JUNE, 2026" or "3 JUNE 2026"
  const months: Record<string, string> = {
    JANUARY: "01", FEBRUARY: "02", MARCH: "03", APRIL: "04",
    MAY: "05", JUNE: "06", JULY: "07", AUGUST: "08",
    SEPTEMBER: "09", OCTOBER: "10", NOVEMBER: "11", DECEMBER: "12",
  };
  const p2 = text.match(/(\d{1,2})(?:ST|ND|RD|TH)?\s+(JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER)[,\s]+(\d{4})/i);
  if (p2) {
    const month = months[p2[2].toUpperCase()];
    const day = p2[1].padStart(2, "0");
    return `${p2[3]}-${month}-${day}`;
  }
  return null;
}

/**
 * Normalise a party name: trim, collapse whitespace, remove trailing dots.
 */
function normaliseName(raw: string): string {
  return raw
    .replace(/\s+/g, " ")
    .replace(/\.+$/, "")
    .trim();
}

/**
 * Split "PETITIONER V/s RESPONDENT" or "PETITIONER Vs. RESPONDENT"
 * Returns [petitioner, respondent] or [raw, ''] if no separator found.
 */
function splitParties(partyStr: string): [string, string] {
  const sep = partyStr.search(/\bV\/[sS]\b|\bVs?\.?\s+|\bVERSUS\b/);
  if (sep === -1) {
    return [normaliseName(partyStr), ""];
  }
  const petitioner = normaliseName(partyStr.substring(0, sep));
  // skip past "V/s" or "Vs." and whitespace
  const afterSep = partyStr.substring(sep).replace(/^V\/[sS]\.?\s*|^Vs?\.?\s*/i, "");
  const respondent = normaliseName(afterSep);
  return [petitioner, respondent];
}

/**
 * Main parser: accepts the full PDF text string, returns an array of ParsedCase.
 */
export function parseCauseListText(text: string): ParsedCase[] {
  const results: ParsedCase[] = [];

  // Normalise line endings
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");

  // Extract the hearing date from the first ~30 lines (it's in the header)
  const headerText = lines.slice(0, 30).join(" ");
  const hearingDate = extractHearingDateFromText(headerText);

  // We work with a single concatenated block and find all case-number positions
  const fullText = lines.join("\n");

  // Find all case number matches with their positions
  const caseNoRegex = new RegExp(CASE_NO_PATTERN.source, "gi");
  let match: RegExpExecArray | null;
  const caseMatches: { index: number; caseNo: string }[] = [];

  while ((match = caseNoRegex.exec(fullText)) !== null) {
    caseMatches.push({ index: match.index, caseNo: match[0].trim() });
  }

  if (caseMatches.length === 0) {
    return results;
  }

  for (let i = 0; i < caseMatches.length; i++) {
    const { index, caseNo } = caseMatches[i];

    // Skip CM APPL / sub-applications — they are filed within a main case,
    // not standalone cases. They appear as child entries in the cause list block.
    if (/^CM\s+APPL\./i.test(caseNo)) continue;

    const nextIndex = caseMatches[i + 1]?.index ?? fullText.length;

    // The "block" for this case is from the case-number to the next case-number
    const block = fullText.substring(index, nextIndex).trim();
    const blockLines = block.split("\n").map((l) => l.trim()).filter(Boolean);

    // blockLines[0] is the case number itself (possibly with trailing text on same line)
    // Look for party line containing V/s
    let petitioner = "";
    let respondent = "";
    let advocateLines: string[] = [];
    let foundParty = false;

    for (let j = 1; j < blockLines.length; j++) {
      const line = blockLines[j];

      // Skip the line that is just the case number
      if (j === 0) continue;

      // Skip sub-application numbers (CM APPL lines within the block) —
      // but do NOT abort the party search, the petitioner comes AFTER them.
      const isCmAppl = /^CM\s+APPL\./i.test(line);
      if (isCmAppl) continue;

      // Skip lines that look like other main case numbers
      if (!isCmAppl && CASE_NO_PATTERN.test(line)) continue;

      if (!foundParty) {
        // Check "V/s RESPONDENT" at start of line first (petitioner was on previous line)
        if (/^V\/[sS]\s*/i.test(line)) {
          respondent = normaliseName(line.replace(/^V\/[sS]\.?\s*/i, ""));
          foundParty = true;
          continue;
        }
        // Check "PETITIONER V/s RESPONDENT" all on one line
        if (/\bV\/[sS]\b|\bVs?\.?\s+\w/i.test(line)) {
          [petitioner, respondent] = splitParties(line);
          foundParty = true;
          continue;
        }
        // If we haven't found petitioner yet and line looks like a name
        // (mostly uppercase, at least 3 chars, no URL-like content)
        if (
          /^[A-Z0-9& .,()'\-/]+$/.test(line) &&
          line.length > 3 &&
          !line.startsWith("http") &&
          !line.includes("@") &&
          !petitioner
        ) {
          petitioner = normaliseName(line);
          continue;
        }
      } else {
        // After parties, remaining lines are advocate names / notes
        advocateLines.push(line);
      }
    }

    // Only record if we have at least a case number
    if (caseNo) {
      results.push({
        case_no: caseNo.replace(/\s+/g, " ").trim(),
        case_year: extractYear(caseNo),
        petitioner,
        respondent,
        next_hearing_date: hearingDate,
        raw_advocates: advocateLines.slice(0, 3).join("; "),
      });
    }
  }

  return results;
}
