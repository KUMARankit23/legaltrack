import express, { Request, Response, NextFunction } from "express";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
import { startCron } from "./ingestion/ingest";
import { clientsRouter } from "./api/clients";
import { casesRouter } from "./api/cases";
import { billingRouter } from "./api/billing";
import { sendDailyHearingReminders, sendHearingReminder } from "./notifications/emailService";
import { pool } from "./db/client";
import { UPLOADS_DIR } from "./ingestion/orderService";

dotenv.config();

const app = express();
const PORT = parseInt(process.env.PORT ?? "4000", 10);
const allowedOrigins = (process.env.CORS_ORIGIN ?? "http://localhost:3000")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(express.json());

app.use((req: Request, res: Response, next: NextFunction) => {
  const requestOrigin = req.headers.origin;
  if (typeof requestOrigin === "string" && allowedOrigins.includes(requestOrigin)) {
    res.setHeader("Access-Control-Allow-Origin", requestOrigin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
  next();
});
app.options("/{*path}", (_req, res) => res.sendStatus(204));

// ─── Core routes ──────────────────────────────────────────────────────────────
app.get("/", (_req, res) => {
  const appUrl = (process.env.CORS_ORIGIN ?? "http://localhost:3000").split(",")[0].trim();
  res.redirect(appUrl);
});

app.get("/health", (_req, res) => res.json({
  status: "ok",
  ts: new Date().toISOString(),
  email_configured: Boolean(process.env.EMAIL_USER && process.env.EMAIL_PASS),
}));

app.use("/clients", clientsRouter);
app.use("/cases",   casesRouter);
app.use("/billing", billingRouter);

// Saved order PDFs: /documents/<case-id>/<file>.pdf
app.get("/documents/:caseId/:fileName", (req, res) => {
  const caseId = String(req.params.caseId);
  const fileName = String(req.params.fileName);
  if (!/^[0-9a-f-]{36}$/i.test(caseId) || !/^[\w.-]+\.pdf$/i.test(fileName)) {
    res.status(400).json({ error: "Invalid document path" });
    return;
  }
  const filePath = path.resolve(UPLOADS_DIR, caseId, fileName);
  if (!filePath.startsWith(path.resolve(UPLOADS_DIR)) || !fs.existsSync(filePath)) {
    res.status(404).json({ error: "PDF not found" });
    return;
  }
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", "inline");
  res.sendFile(filePath);
});

// GET /search?q=  — global full-text search across cases + orders
app.get("/search", async (req: Request, res: Response): Promise<void> => {
  const q = ((req.query.q as string) ?? "").trim();
  if (!q) { res.json({ cases: [], orders: [] }); return; }
  try {
    const [caseResults, orderResults] = await Promise.all([
      pool.query(
        `SELECT c.id, c.case_no, c.case_title, c.status, c.next_hearing_date,
                cl.name AS client_name
         FROM cases c LEFT JOIN clients cl ON cl.id=c.client_id
         LEFT JOIN parties p ON p.case_id=c.id
         WHERE c.case_no ILIKE $1 OR c.case_title ILIKE $1 OR p.name ILIKE $1
         GROUP BY c.id, cl.name ORDER BY c.updated_at DESC LIMIT 20`,
        [`%${q}%`]
      ),
      pool.query(
        `SELECT o.id, o.case_id, o.order_date, o.order_type, o.court_no,
                LEFT(o.text_content, 300) AS snippet,
                c.case_no, c.case_title
         FROM orders o JOIN cases c ON c.id=o.case_id
         WHERE to_tsvector('english', COALESCE(o.text_content,'')) @@ plainto_tsquery('english', $1)
            OR o.text_content ILIKE $2
         ORDER BY o.order_date DESC LIMIT 10`,
        [q, `%${q}%`]
      ),
    ]);
    res.json({ cases: caseResults.rows, orders: orderResults.rows });
  } catch (e) { res.status(500).json({ error: (e as Error).message }); }
});

// ─── Notification routes ───────────────────────────────────────────────────────

// POST /notifications/test  — send a test email to verify config
app.post("/notifications/test", async (req: Request, res: Response): Promise<void> => {
  const { email } = req.body as { email?: string };
  const to = email ?? process.env.EMAIL_USER;
  if (!to) { res.status(400).json({ error: "Provide email in body or set EMAIL_USER in .env" }); return; }
  try {
    await sendHearingReminder({
      to,
      clientName: "Test Client",
      caseNo: "W.P.(C)-5972/2022",
      caseTitle: "SNAPDEAL LIMITED v. CENTRAL CONSUMER PROTECTION AUTHORITY",
      nextDate: "Wednesday, 27 November 2026",
      court: "Delhi High Court",
      advocate: "Prithvi Singh",
      daysAway: 2,
    });
    res.json({ ok: true, message: `Test email sent to ${to}` });
  } catch (e) { res.status(500).json({ error: (e as Error).message }); }
});

// POST /notifications/send-reminders  — trigger hearing reminders immediately
app.post("/notifications/send-reminders", async (_req: Request, res: Response): Promise<void> => {
  try {
    await sendDailyHearingReminders();
    res.json({ ok: true, message: "Hearing reminders sent" });
  } catch (e) { res.status(500).json({ error: (e as Error).message }); }
});

// GET /notifications/upcoming  — preview who would receive reminders
app.get("/notifications/upcoming", async (_req: Request, res: Response): Promise<void> => {
  try {
    const result = await pool.query(`
      SELECT
        c.case_no, c.case_title, c.next_hearing_date, c.court,
        cl.name AS client_name, cl.email AS client_email,
        (c.next_hearing_date - CURRENT_DATE) AS days_away
      FROM cases c
      JOIN clients cl ON cl.id = c.client_id
      WHERE
        c.next_hearing_date IS NOT NULL
        AND c.next_hearing_date >= CURRENT_DATE
      ORDER BY c.next_hearing_date
    `);
    res.json({
      total: result.rows.length,
      email_configured: !!process.env.EMAIL_USER,
      upcoming: result.rows,
    });
  } catch (e) { res.status(500).json({ error: (e as Error).message }); }
});

// PATCH /clients/:id/email  — quick update client email for notifications
app.patch("/notifications/client-email/:id", async (req: Request, res: Response): Promise<void> => {
  const { email } = req.body as { email: string };
  if (!email?.includes("@")) { res.status(400).json({ error: "Valid email required" }); return; }
  try {
    const r = await pool.query(
      "UPDATE clients SET email=$1, updated_at=NOW() WHERE id=$2 RETURNING id, name, email",
      [email, req.params.id]
    );
    if (!r.rows.length) { res.status(404).json({ error: "Client not found" }); return; }
    res.json({ ok: true, client: r.rows[0] });
  } catch (e) { res.status(500).json({ error: (e as Error).message }); }
});

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[server] API on http://localhost:${PORT}`);
  startCron();
});

export default app;
