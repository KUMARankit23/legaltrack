import { Router, Request, Response } from "express";
import { pool } from "../db/client";
import { generateInvoiceAI } from "../ai/invoiceAI";

export const billingRouter = Router();

// GET /billing?client_id=&case_id=
billingRouter.get("/", async (req: Request, res: Response): Promise<void> => {
  const { client_id, case_id } = req.query as Record<string, string>;
  try {
    const where: string[] = [];
    const params: string[] = [];
    if (client_id) { where.push(`b.client_id=$${params.length + 1}`); params.push(client_id); }
    if (case_id)   { where.push(`b.case_id=$${params.length + 1}`);   params.push(case_id); }
    const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const r = await pool.query(
      `SELECT b.*, c.case_no, c.case_title, cl.name AS client_name
       FROM billing_entries b
       LEFT JOIN cases c ON c.id=b.case_id
       LEFT JOIN clients cl ON cl.id=b.client_id
       ${clause}
       ORDER BY b.entry_date DESC`,
      params
    );
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: (e as Error).message }); }
});

// POST /billing  — add a billing entry
billingRouter.post("/", async (req: Request, res: Response): Promise<void> => {
  const { case_id, client_id, hearing_id, description, entry_date, hours, rate, amount, entry_type } =
    req.body as Record<string, string>;
  if (!case_id || !description || !amount) {
    res.status(400).json({ error: "case_id, description, amount required" });
    return;
  }
  try {
    const r = await pool.query(
      `INSERT INTO billing_entries (case_id, client_id, hearing_id, description, entry_date, hours, rate, amount, entry_type)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [case_id, client_id || null, hearing_id || null, description, entry_date || new Date().toISOString().slice(0,10),
       parseFloat(hours || "0"), parseFloat(rate || "0"), parseFloat(amount), entry_type || "hearing"]
    );
    res.status(201).json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: (e as Error).message }); }
});

// GET /billing/invoices?client_id=
billingRouter.get("/invoices", async (req: Request, res: Response): Promise<void> => {
  const { client_id } = req.query as Record<string, string>;
  try {
    const where = client_id ? "WHERE i.client_id=$1" : "";
    const params = client_id ? [client_id] : [];
    const r = await pool.query(
      `SELECT i.*, cl.name AS client_name, c.case_no
       FROM invoices i
       LEFT JOIN clients cl ON cl.id=i.client_id
       LEFT JOIN cases c ON c.id=i.case_id
       ${where}
       ORDER BY i.issue_date DESC`,
      params
    );
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: (e as Error).message }); }
});

// POST /billing/invoices/generate  — AI-generate invoice for a case/client
billingRouter.post("/invoices/generate", async (req: Request, res: Response): Promise<void> => {
  const { client_id, case_id, tax_pct, notes } = req.body as Record<string, string>;
  if (!client_id || !case_id) {
    res.status(400).json({ error: "client_id and case_id required" });
    return;
  }
  try {
    const invoice = await generateInvoiceAI({ client_id, case_id, tax_pct: parseFloat(tax_pct || "18"), notes });
    res.status(201).json(invoice);
  } catch (e) { res.status(500).json({ error: (e as Error).message }); }
});

// PATCH /billing/invoices/:id/status
billingRouter.patch("/invoices/:id/status", async (req: Request, res: Response): Promise<void> => {
  const { status } = req.body as { status: string };
  const valid = ["draft", "sent", "paid", "overdue", "cancelled"];
  if (!valid.includes(status)) { res.status(400).json({ error: "Invalid status" }); return; }
  try {
    const r = await pool.query(
      `UPDATE invoices SET status=$1, updated_at=NOW() WHERE id=$2 RETURNING *`,
      [status, req.params.id]
    );
    if (!r.rows.length) { res.status(404).json({ error: "Not found" }); return; }
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: (e as Error).message }); }
});
