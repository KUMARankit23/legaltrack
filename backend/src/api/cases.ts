import { Router, Request, Response, NextFunction } from "express";
import multer from "multer";
import { pool } from "../db/client";
import { startFetchJob, getJobStatus } from "../ingestion/courtFetch";
import { detectCourt } from "../ingestion/caseLookup";
import { downloadCaseOrders, saveManualOrder } from "../ingestion/orderService";

const orderUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const pdf = file.mimetype === "application/pdf" || file.originalname.toLowerCase().endsWith(".pdf");
    cb(null, pdf);
  },
});

export const casesRouter = Router();

// POST /cases/lookup  — given a case number and court_id, fetch live data
// Returns immediately with court detection; background fetch updates the record.
// Now routes to appropriate adapter based on court_id (supports all courts)
casesRouter.post("/lookup", async (req: Request, res: Response): Promise<void> => {
  const { case_no, client_id, court_id } = req.body as { case_no: string; client_id?: string; court_id?: string };
  if (!case_no?.trim()) { res.status(400).json({ error: "case_no required" }); return; }
  if (!court_id?.trim()) { res.status(400).json({ error: "court_id required (e.g., 'delhi_hc', 'bombay_hc', or CNR for district)" }); return; }

  try {
    const trimmed = case_no.trim();
    const selectedCourtId = court_id.trim().toLowerCase();

    // 1. Get court details from registry or detect from case_no
    const { court, code } = detectCourt(trimmed);
    const year = trimmed.match(/\/(\d{4})/)?.[1] ? parseInt(trimmed.match(/\/(\d{4})/)![1], 10) : null;
    const typeMatch = trimmed.match(/^([A-Z][A-Z.()\s]+?)\s*[-\d]/);
    const caseType = typeMatch ? typeMatch[1].trim() : null;

    // 2. Check if already in DB
    const existing = await pool.query("SELECT * FROM cases WHERE case_no ILIKE $1", [trimmed]);

    let caseId: string;
    if (existing.rows.length > 0) {
      caseId = existing.rows[0].id as string;
      // Update client link and court if provided
      if (client_id || selectedCourtId) {
        await pool.query(
          "UPDATE cases SET client_id=COALESCE($1, client_id), source_court_id=$2, updated_at=NOW() WHERE id=$3",
          [client_id || null, selectedCourtId, caseId]
        );
      }
    } else {
      // 3. Save basic case record immediately with court tracking
      const r = await pool.query(
        `INSERT INTO cases (case_no, case_year, case_type, court, source_court_id, status, client_id)
         VALUES ($1,$2,$3,$4,$5,'Pending',$6)
         ON CONFLICT (case_no) DO UPDATE SET
           client_id = COALESCE(EXCLUDED.client_id, cases.client_id),
           source_court_id = COALESCE(EXCLUDED.source_court_id, cases.source_court_id),
           updated_at = NOW()
         RETURNING id`,
        [trimmed, year, caseType, court, selectedCourtId, client_id ?? null]
      );
      caseId = r.rows[0].id as string;
    }

    // 4. Return immediately with basic info
    const detail = await pool.query(
      `SELECT c.*, cl.name AS client_name FROM cases c
       LEFT JOIN clients cl ON cl.id=c.client_id WHERE c.id=$1`, [caseId]
    );
    const parties = await pool.query("SELECT * FROM parties WHERE case_id=$1", [caseId]);
    const hearings = await pool.query("SELECT * FROM hearings WHERE case_id=$1 ORDER BY date DESC", [caseId]);

    res.json({
      case: { ...detail.rows[0], parties: parties.rows, hearings: hearings.rows },
      lookup_info: {
        court: selectedCourtId,
        court_code: selectedCourtId,
        fetch_note: `Case saved with court: ${selectedCourtId}. Click Fetch Live to pull live data from the court portal.`,
        source: existing.rows.length > 0 ? "existing_record" : "new_record",
        already_existed: existing.rows.length > 0,
      },
    });

    // 5. Trigger background fetch (non-blocking — don't await)
    // All court types now supported (will route to correct adapter)
    setImmediate(() => {
      startFetchJob(caseId, trimmed, selectedCourtId);
    });

  } catch (e) { res.status(500).json({ error: (e as Error).message }); }
});

// GET /cases?query=  — search
casesRouter.get("/", async (req: Request, res: Response): Promise<void> => {
  const query = ((req.query.query as string) ?? "").trim();
  const limit = Math.min(parseInt((req.query.limit as string) ?? "50", 10), 200);
  const offset = parseInt((req.query.offset as string) ?? "0", 10);
  const clientId = req.query.client_id as string | undefined;

  if (!query && !clientId) {
    // Return all cases if no filter
    const r = await pool.query(
      `SELECT c.*, cl.name AS client_name FROM cases c
       LEFT JOIN clients cl ON cl.id = c.client_id
       ORDER BY c.updated_at DESC LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    res.json({ query: "", total: r.rowCount ?? 0, limit, offset, cases: r.rows });
    return;
  }

  try {
    const likeParam = `%${query}%`;
    let sql: string;
    let params: unknown[];

    if (clientId) {
      sql = `
        SELECT DISTINCT ON (c.id) c.*, cl.name AS client_name
        FROM cases c
        LEFT JOIN clients cl ON cl.id = c.client_id
        LEFT JOIN parties p ON p.case_id = c.id
        WHERE c.client_id = $1
          AND ($2 = '' OR c.case_no ILIKE $3 OR c.case_title ILIKE $3 OR p.name ILIKE $3)
        ORDER BY c.id, c.updated_at DESC
        LIMIT $4 OFFSET $5`;
      params = [clientId, query, likeParam, limit, offset];
    } else {
      sql = `
        SELECT DISTINCT ON (c.id) c.*, cl.name AS client_name
        FROM cases c
        LEFT JOIN clients cl ON cl.id = c.client_id
        LEFT JOIN parties p ON p.case_id = c.id
        WHERE c.case_no ILIKE $1 OR c.case_title ILIKE $1
           OR p.name ILIKE $1 OR p.name % $2
        ORDER BY c.id, c.updated_at DESC
        LIMIT $3 OFFSET $4`;
      params = [likeParam, query, limit, offset];
    }

    const [result, countResult] = await Promise.all([
      pool.query(sql, params),
      pool.query(
        clientId
          ? `SELECT COUNT(DISTINCT c.id) AS total FROM cases c LEFT JOIN parties p ON p.case_id=c.id WHERE c.client_id=$1 AND ($2='' OR c.case_no ILIKE $3 OR c.case_title ILIKE $3 OR p.name ILIKE $3)`
          : `SELECT COUNT(DISTINCT c.id) AS total FROM cases c LEFT JOIN parties p ON p.case_id=c.id WHERE c.case_no ILIKE $1 OR c.case_title ILIKE $1 OR p.name ILIKE $1 OR p.name % $2`,
        clientId ? [clientId, query, likeParam] : [likeParam, query]
      ),
    ]);

    res.json({ query, total: parseInt(countResult.rows[0].total, 10), limit, offset, cases: result.rows });
  } catch (e) { res.status(500).json({ error: (e as Error).message }); }
});

// POST /cases  — manually add a case (with optional client link)
casesRouter.post("/", async (req: Request, res: Response): Promise<void> => {
  const { case_no, cnr_number, case_title, court, case_type, status, client_id, filing_date } =
    req.body as Record<string, string>;
  if (!case_no?.trim()) { res.status(400).json({ error: "case_no required" }); return; }

  // Extract year from case_no e.g. "W.P.(C)-1234/2026"
  const yearMatch = case_no.match(/\/(\d{4})$/);
  const case_year = yearMatch ? parseInt(yearMatch[1], 10) : new Date().getFullYear();
  // Extract case_type from prefix
  const typeMatch = case_no.match(/^([A-Z.()\s]+)-/);
  const derivedType = typeMatch ? typeMatch[1].trim() : null;

  try {
    const r = await pool.query(
      `INSERT INTO cases (case_no, cnr_number, case_year, case_title, court, case_type, status, client_id, filing_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (case_no) DO UPDATE SET
         client_id = COALESCE(EXCLUDED.client_id, cases.client_id),
         cnr_number = COALESCE(EXCLUDED.cnr_number, cases.cnr_number),
         updated_at = NOW()
       RETURNING *`,
      [
        case_no.trim(),
        cnr_number?.trim() || null,
        case_year,
        case_title?.trim() || null,
        court?.trim() || "Delhi High Court",
        case_type?.trim() || derivedType,
        status?.trim() || "Pending",
        client_id || null,
        filing_date || null,
      ]
    );
    res.status(201).json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: (e as Error).message }); }
});

// GET /cases/:id  — full case with parties, hearings, billing
casesRouter.get("/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const caseRow = await pool.query(
      `SELECT c.*, cl.name AS client_name, cl.email AS client_email
       FROM cases c LEFT JOIN clients cl ON cl.id=c.client_id WHERE c.id=$1`,
      [req.params.id]
    );
    if (!caseRow.rows.length) { res.status(404).json({ error: "Not found" }); return; }
    const [parties, hearings, billing] = await Promise.all([
      pool.query(`SELECT * FROM parties WHERE case_id=$1 ORDER BY role`, [req.params.id]),
      pool.query(`SELECT * FROM hearings WHERE case_id=$1 ORDER BY date DESC`, [req.params.id]),
      pool.query(`SELECT * FROM billing_entries WHERE case_id=$1 ORDER BY entry_date DESC`, [req.params.id]),
    ]);
    res.json({ ...caseRow.rows[0], parties: parties.rows, hearings: hearings.rows, billing: billing.rows });
  } catch (e) { res.status(500).json({ error: (e as Error).message }); }
});

// POST /cases/:id/fetch  — start background fetch from any supported court
casesRouter.post("/:id/fetch", async (req: Request, res: Response): Promise<void> => {
  try {
    const { court_id } = req.body as { court_id?: string };
    const caseRow = await pool.query(`SELECT * FROM cases WHERE id=$1`, [req.params.id]);
    if (!caseRow.rows.length) { res.status(404).json({ error: "Not found" }); return; }

    const c = caseRow.rows[0];
    const selectedCourtId = court_id || String(c.source_court_id || c.court || "");
    
    if (!selectedCourtId) {
      res.status(400).json({
        error: `No court specified. Please provide court_id in request body or case must have source_court_id set.`,
      });
      return;
    }

    // Start background job with selected court (non-blocking)
    startFetchJob(c.id as string, c.case_no as string, selectedCourtId);

    res.json({
      status: "started",
      court: selectedCourtId,
      message: `Searching ${selectedCourtId} for "${c.case_no}". This may take 30-60 seconds.`,
      poll_url: `/cases/${c.id}/fetch/status`,
    });
  } catch (e) { res.status(500).json({ error: (e as Error).message }); }
});

// GET /cases/:id/fetch/status  — poll for background fetch result
casesRouter.get("/:id/fetch/status", async (req: Request, res: Response): Promise<void> => {
  const job = getJobStatus(String(req.params.id));
  if (!job) {
    res.json({ status: "not_started", message: "No fetch job found for this case. Click Fetch Live to start." });
    return;
  }
  if (job.status === "running") {
    res.json({ status: "running", message: "Searching cause lists…" });
    return;
  }
  if (job.status === "error") {
    res.json({ status: "error", message: job.error });
    return;
  }
  // Done — return full case detail alongside result
  try {
    const [caseRow, parties, hearings, billing] = await Promise.all([
      pool.query(`SELECT c.*, cl.name AS client_name FROM cases c LEFT JOIN clients cl ON cl.id=c.client_id WHERE c.id=$1`, [req.params.id]),
      pool.query(`SELECT * FROM parties WHERE case_id=$1`, [req.params.id]),
      pool.query(`SELECT * FROM hearings WHERE case_id=$1 ORDER BY date DESC`, [req.params.id]),
      pool.query(`SELECT * FROM billing_entries WHERE case_id=$1 ORDER BY entry_date DESC`, [req.params.id]),
    ]);
    res.json({
      status: "done",
      result: job.result,
      case: { ...caseRow.rows[0], parties: parties.rows, hearings: hearings.rows, billing: billing.rows },
    });
  } catch (e) { res.status(500).json({ error: (e as Error).message }); }
});

// ─── Orders routes ────────────────────────────────────────────────────────────

// GET /cases/:id/orders — list all orders for a case
casesRouter.get("/:id/orders", async (req: Request, res: Response): Promise<void> => {
  try {
    const orders = await pool.query(
      `SELECT id, to_char(order_date, 'YYYY-MM-DD') AS order_date, order_type, court_no, pdf_url, local_path, source,
              file_size, LEFT(text_content, 500) AS text_preview, created_at
       FROM orders WHERE case_id=$1 ORDER BY order_date DESC`,
      [req.params.id]
    );
    res.json(orders.rows);
  } catch (e) { res.status(500).json({ error: (e as Error).message }); }
});

// GET /cases/:id/orders/:orderId/text — full text of an order
casesRouter.get("/:id/orders/:orderId/text", async (req: Request, res: Response): Promise<void> => {
  try {
    const r = await pool.query(
      "SELECT order_date, order_type, text_content FROM orders WHERE id=$1 AND case_id=$2",
      [req.params.orderId, req.params.id]
    );
    if (!r.rows.length) { res.status(404).json({ error: "Order not found" }); return; }
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: (e as Error).message }); }
});

// POST /cases/:id/orders/upload — attach a PDF when the court site has none
casesRouter.post("/:id/orders/upload", (req: Request, res: Response, next: NextFunction) => {
  orderUpload.single("file")(req, res, (err: unknown) => {
    if (err) {
      const message = err instanceof Error ? err.message : "Upload failed";
      res.status(400).json({ error: message });
      return;
    }
    next();
  });
}, async (req: Request, res: Response): Promise<void> => {
  try {
    const file = req.file;
    const orderDate = String(req.body?.order_date ?? "").trim();
    const orderType = String(req.body?.order_type ?? "Order").trim();
    if (!file) { res.status(400).json({ error: "Choose a PDF file" }); return; }
    if (!orderDate) { res.status(400).json({ error: "Order date is required" }); return; }

    const caseRow = await pool.query("SELECT id FROM cases WHERE id=$1", [req.params.id]);
    if (!caseRow.rows.length) { res.status(404).json({ error: "Case not found" }); return; }

    const saved = await saveManualOrder(String(req.params.id), orderDate, orderType, file.buffer);
    res.json(saved);
  } catch (e) { res.status(400).json({ error: (e as Error).message }); }
});

// POST /cases/:id/orders/download — trigger download of orders for this case
casesRouter.post("/:id/orders/download", async (req: Request, res: Response): Promise<void> => {
  try {
    const caseRow = await pool.query("SELECT * FROM cases WHERE id=$1", [req.params.id]);
    if (!caseRow.rows.length) { res.status(404).json({ error: "Case not found" }); return; }

    const hearings = await pool.query(
      `SELECT to_char(date, 'YYYY-MM-DD') AS date, purpose, order_url
       FROM hearings
       WHERE case_id=$1 AND order_url IS NOT NULL
       ORDER BY date DESC`,
      [req.params.id]
    );

    if (!hearings.rows.length) {
      const court = String(caseRow.rows[0].court ?? "");
      if (!/delhi high court/i.test(court)) {
        res.status(400).json({
          error: "This court has no saved order links. Upload the PDF on the Orders tab.",
        });
        return;
      }
      startFetchJob(req.params.id as string, caseRow.rows[0].case_no as string);
      res.json({
        status: "started",
        message: "No saved order links yet. Fetching the case from Delhi HC, then downloading PDFs.",
      });
      return;
    }

    res.json({
      status: "started",
      message: `Downloading ${hearings.rows.length} order PDF${hearings.rows.length === 1 ? "" : "s"}.`,
    });

    const caseId = String(req.params.id);
    const rows = hearings.rows as { date: string; purpose: string; order_url: string }[];
    setImmediate(async () => {
      try {
        const count = await downloadCaseOrders(caseId, rows);
        console.log(`[orders] Saved ${count} PDF(s) for case ${caseId}`);
      } catch (e) {
        console.error("[orders] Background download error:", (e as Error).message);
      }
    });
  } catch (e) { res.status(500).json({ error: (e as Error).message }); }
});

