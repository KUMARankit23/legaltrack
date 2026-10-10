/**
 * AI Invoice Generator
 *
 * Builds an invoice automatically from:
 *  1. Unbilled billing_entries for the case
 *  2. Hearing history (auto-generates entries for hearings without billing)
 *  3. Predicts next hearing date from historical pattern
 *
 * "AI" here = rule-based analysis of hearing frequency + billing patterns.
 * Swap the summarise() function body with an LLM call (OpenAI/Gemini) when ready.
 */
import { pool } from "../db/client";

interface GenerateArgs {
  client_id: string;
  case_id: string;
  tax_pct: number;
  notes?: string;
}

// ─── Next-date prediction from hearing history ────────────────────────────────
export function predictNextHearing(hearingDates: Date[]): Date | null {
  if (hearingDates.length < 2) return null;
  const sorted = [...hearingDates].sort((a, b) => a.getTime() - b.getTime());
  // Calculate average gap between consecutive hearings
  const gaps: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    gaps.push(sorted[i].getTime() - sorted[i - 1].getTime());
  }
  const avgGapMs = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  const last = sorted[sorted.length - 1];
  const predicted = new Date(last.getTime() + avgGapMs);
  // Skip weekends
  while (predicted.getDay() === 0 || predicted.getDay() === 6) {
    predicted.setDate(predicted.getDate() + 1);
  }
  return predicted;
}

// ─── Rule-based AI summary ────────────────────────────────────────────────────
function summariseCaseWork(
  caseNo: string,
  clientName: string,
  hearings: { date: string; purpose: string }[],
  entries: { description: string; amount: number; entry_type: string }[],
  predictedNext: Date | null
): string {
  const totalHearings = hearings.length;
  const totalAmount = entries.reduce((s, e) => s + Number(e.amount), 0);
  const entryTypes = [...new Set(entries.map(e => e.entry_type))];
  const lastHearing = hearings[0]?.date ? new Date(hearings[0].date).toLocaleDateString("en-IN") : "N/A";
  const prediction = predictedNext
    ? `Based on the hearing pattern, the next hearing is predicted around ${predictedNext.toLocaleDateString("en-IN")}.`
    : "";

  return `This invoice covers legal services rendered in matter ${caseNo} on behalf of ${clientName}. ` +
    `${totalHearings} court appearance${totalHearings !== 1 ? "s" : ""} were attended, ` +
    `with the last hearing on ${lastHearing}. ` +
    `Services include: ${entryTypes.join(", ")}. ` +
    `Total professional fees billed: ₹${totalAmount.toLocaleString("en-IN")}. ` +
    prediction;
}

// ─── Invoice number generator ─────────────────────────────────────────────────
async function nextInvoiceNumber(): Promise<string> {
  const r = await pool.query(
    `SELECT COUNT(*) AS cnt FROM invoices WHERE invoice_number LIKE $1`,
    [`INV-${new Date().getFullYear()}-%`]
  );
  const seq = parseInt(r.rows[0].cnt, 10) + 1;
  return `INV-${new Date().getFullYear()}-${String(seq).padStart(4, "0")}`;
}

// ─── Main generator ───────────────────────────────────────────────────────────
export async function generateInvoiceAI({ client_id, case_id, tax_pct, notes }: GenerateArgs) {
  // Fetch all the data we need
  const [clientRes, caseRes, hearingsRes, unbilledRes] = await Promise.all([
    pool.query(`SELECT * FROM clients WHERE id=$1`, [client_id]),
    pool.query(`SELECT * FROM cases WHERE id=$1`, [case_id]),
    pool.query(`SELECT * FROM hearings WHERE case_id=$1 ORDER BY date DESC`, [case_id]),
    pool.query(
      `SELECT * FROM billing_entries WHERE case_id=$1 AND is_billed=FALSE ORDER BY entry_date`,
      [case_id]
    ),
  ]);

  if (!clientRes.rows.length) throw new Error("Client not found");
  if (!caseRes.rows.length) throw new Error("Case not found");

  const client = clientRes.rows[0];
  const caseRow = caseRes.rows[0];
  const hearings = hearingsRes.rows;
  let entries = unbilledRes.rows;

  // If no explicit billing entries, auto-generate from hearing history
  if (entries.length === 0 && hearings.length > 0) {
    const DEFAULT_HEARING_FEE = 5000; // ₹5,000 per appearance
    entries = hearings.slice(0, 5).map((h) => ({
      case_id,
      client_id,
      hearing_id: h.id,
      description: `Court appearance on ${new Date(h.date).toLocaleDateString("en-IN")} — ${h.purpose || "Hearing"}`,
      entry_date: h.date,
      hours: 3,
      rate: DEFAULT_HEARING_FEE / 3,
      amount: DEFAULT_HEARING_FEE,
      entry_type: "hearing",
      is_billed: false,
    }));
  }

  if (entries.length === 0) {
    throw new Error("No billable entries found for this case. Attend at least one hearing or add billing entries first.");
  }

  // Predict next hearing
  const hearingDates = hearings.map(h => new Date(h.date)).filter(d => !isNaN(d.getTime()));
  const predictedNext = predictNextHearing(hearingDates);

  // Build line items
  const subtotal = entries.reduce((s: number, e: { amount: number }) => s + Number(e.amount), 0);
  const taxAmount = parseFloat(((subtotal * tax_pct) / 100).toFixed(2));
  const total = parseFloat((subtotal + taxAmount).toFixed(2));

  // AI summary
  const aiSummary = summariseCaseWork(
    caseRow.case_no,
    client.name,
    hearings,
    entries,
    predictedNext
  );

  const invoiceNumber = await nextInvoiceNumber();
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 30);

  // Insert invoice
  const invRes = await pool.query(
    `INSERT INTO invoices
     (invoice_number, client_id, case_id, issue_date, due_date, subtotal, tax_pct, tax_amount, total, status, notes, ai_summary)
     VALUES ($1,$2,$3,CURRENT_DATE,$4,$5,$6,$7,$8,'draft',$9,$10)
     RETURNING *`,
    [invoiceNumber, client_id, case_id, dueDate.toISOString().slice(0, 10),
     subtotal, tax_pct, taxAmount, total, notes || null, aiSummary]
  );
  const invoice = invRes.rows[0];

  // Insert line items
  for (const e of entries) {
    await pool.query(
      `INSERT INTO invoice_items (invoice_id, billing_id, description, quantity, unit_price, amount)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [invoice.id, e.id || null, e.description, 1, e.amount, e.amount]
    );
  }

  // Mark billing entries as billed
  if (unbilledRes.rows.length > 0) {
    const ids = unbilledRes.rows.map((e: { id: string }) => e.id);
    await pool.query(
      `UPDATE billing_entries SET is_billed=TRUE WHERE id=ANY($1::uuid[])`,
      [ids]
    );
  }

  // Fetch complete invoice with line items
  const items = await pool.query(
    `SELECT * FROM invoice_items WHERE invoice_id=$1`, [invoice.id]
  );

  return {
    ...invoice,
    client_name: client.name,
    case_no: caseRow.case_no,
    case_title: caseRow.case_title,
    items: items.rows,
    predicted_next_hearing: predictedNext?.toISOString().slice(0, 10) ?? null,
    ai_summary: aiSummary,
  };
}
