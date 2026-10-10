import { Router, Request, Response } from "express";
import { pool } from "../db/client";

export const clientsRouter = Router();

// GET /clients
clientsRouter.get("/", async (_req: Request, res: Response): Promise<void> => {
  try {
    const r = await pool.query(`
      SELECT c.*, 
        COUNT(DISTINCT ca.id)::int AS case_count,
        COUNT(DISTINCT i.id)::int  AS invoice_count,
        COALESCE(SUM(i.total) FILTER (WHERE i.status != 'paid'), 0) AS outstanding
      FROM clients c
      LEFT JOIN cases ca ON ca.client_id = c.id
      LEFT JOIN invoices i ON i.client_id = c.id
      GROUP BY c.id
      ORDER BY c.created_at DESC
    `);
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: (e as Error).message }); }
});

// POST /clients
clientsRouter.post("/", async (req: Request, res: Response): Promise<void> => {
  const { name, email, phone, company, notes } = req.body as Record<string, string>;
  if (!name?.trim()) { res.status(400).json({ error: "name is required" }); return; }
  try {
    const r = await pool.query(
      `INSERT INTO clients (name, email, phone, company, notes)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [name.trim(), email || null, phone || null, company || null, notes || null]
    );
    res.status(201).json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: (e as Error).message }); }
});

// GET /clients/:id  — full client with their cases + invoices
clientsRouter.get("/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const client = await pool.query(`SELECT * FROM clients WHERE id=$1`, [req.params.id]);
    if (!client.rows.length) { res.status(404).json({ error: "Not found" }); return; }
    const [cases, invoices] = await Promise.all([
      pool.query(`SELECT * FROM cases WHERE client_id=$1 ORDER BY updated_at DESC`, [req.params.id]),
      pool.query(`SELECT * FROM invoices WHERE client_id=$1 ORDER BY issue_date DESC`, [req.params.id]),
    ]);
    res.json({ ...client.rows[0], cases: cases.rows, invoices: invoices.rows });
  } catch (e) { res.status(500).json({ error: (e as Error).message }); }
});

// PATCH /clients/:id
clientsRouter.patch("/:id", async (req: Request, res: Response): Promise<void> => {
  const { name, email, phone, company, notes } = req.body as Record<string, string>;
  try {
    const r = await pool.query(
      `UPDATE clients SET name=COALESCE($1,name), email=COALESCE($2,email),
       phone=COALESCE($3,phone), company=COALESCE($4,company),
       notes=COALESCE($5,notes), updated_at=NOW()
       WHERE id=$6 RETURNING *`,
      [name || null, email || null, phone || null, company || null, notes || null, req.params.id]
    );
    if (!r.rows.length) { res.status(404).json({ error: "Not found" }); return; }
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: (e as Error).message }); }
});

// POST /clients/:id/link-case  — link an existing case to this client
clientsRouter.post("/:id/link-case", async (req: Request, res: Response): Promise<void> => {
  const { case_id } = req.body as { case_id: string };
  if (!case_id) { res.status(400).json({ error: "case_id required" }); return; }
  try {
    await pool.query(`UPDATE cases SET client_id=$1 WHERE id=$2`, [req.params.id, case_id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: (e as Error).message }); }
});
