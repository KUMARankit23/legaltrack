/**
 * Email notification service.
 *
 * Uses nodemailer with any SMTP provider (Gmail, Outlook, etc.).
 * Configure EMAIL_* vars in .env to activate.
 *
 * If EMAIL_USER is not set, notifications are logged to console only
 * (dev/demo mode — no real emails sent).
 */
import * as nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import * as dotenv from "dotenv";
import { pool } from "../db/client";

dotenv.config();

let transporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  // Always check current env values — don't use stale cache if config changed
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASS;
  
  if (!user || !pass || pass === "your-app-password" || pass === "your-bmu-password-here") {
    return null; // not configured or placeholder
  }
  
  // Recreate if config changed
  if (transporter) {
    const cached = transporter as Transporter & { options?: { auth?: { user?: string } } };
    if (cached.options?.auth?.user !== user) {
      transporter = null; // stale — recreate
    } else {
      return transporter;
    }
  }
  
  transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST ?? "smtp.gmail.com",
    port: parseInt(process.env.EMAIL_PORT ?? "587", 10),
    secure: false,
    auth: { user, pass },
    tls: { rejectUnauthorized: false }, // handles some corporate cert issues
  });
  return transporter;
}

// ─── Email templates ──────────────────────────────────────────────────────────
function hearingReminderHtml(opts: {
  clientName: string;
  caseNo: string;
  casTitle: string;
  nextDate: string;
  court: string;
  advocate: string;
  daysAway: number;
}) {
  const urgencyColor = opts.daysAway <= 1 ? "#b91c1c" : opts.daysAway <= 3 ? "#d97706" : "#1d4ed8";
  const urgencyLabel = opts.daysAway === 0 ? "TODAY" : opts.daysAway === 1 ? "TOMORROW" : `in ${opts.daysAway} days`;

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f3f4f8;margin:0;padding:20px">
  <div style="max-width:540px;margin:0 auto">
    <!-- Header -->
    <div style="background:#0f1f3d;padding:20px 24px;border-radius:10px 10px 0 0;display:flex;align-items:center;gap:12px">
      <div style="background:#2563eb;width:36px;height:36px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:700;color:#fff">L</div>
      <div>
        <div style="color:#fff;font-size:16px;font-weight:700">LegalTrack</div>
        <div style="color:rgba(255,255,255,0.5);font-size:11px">Hearing Reminder</div>
      </div>
    </div>

    <!-- Body -->
    <div style="background:#fff;padding:24px;border-left:1px solid #e5e7eb;border-right:1px solid #e5e7eb">

      <!-- Urgency banner -->
      <div style="background:${urgencyColor};color:#fff;padding:10px 16px;border-radius:8px;margin-bottom:20px;font-weight:700;font-size:14px;text-align:center">
        ⚖️ Hearing ${urgencyLabel} — ${opts.nextDate}
      </div>

      <p style="color:#374151;font-size:14px;margin:0 0 20px">Dear <strong>${opts.clientName}</strong>,</p>
      <p style="color:#374151;font-size:14px;margin:0 0 20px">
        This is a reminder that your case has a hearing scheduled <strong>${urgencyLabel}</strong>.
      </p>

      <!-- Case card -->
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:18px;margin-bottom:20px">
        <div style="display:grid;gap:10px">
          <div style="display:flex;gap:8px">
            <span style="color:#94a3b8;font-size:12px;min-width:110px">Case No.</span>
            <span style="color:#1e40af;font-family:monospace;font-weight:600;font-size:13px">${opts.caseNo}</span>
          </div>
          <div style="display:flex;gap:8px">
            <span style="color:#94a3b8;font-size:12px;min-width:110px">Parties</span>
            <span style="color:#111827;font-size:13px;font-weight:500">${opts.casTitle}</span>
          </div>
          <div style="display:flex;gap:8px">
            <span style="color:#94a3b8;font-size:12px;min-width:110px">Court</span>
            <span style="color:#111827;font-size:13px">${opts.court}</span>
          </div>
          <div style="display:flex;gap:8px">
            <span style="color:#94a3b8;font-size:12px;min-width:110px">Hearing Date</span>
            <span style="color:${urgencyColor};font-size:15px;font-weight:700">${opts.nextDate}</span>
          </div>
          <div style="display:flex;gap:8px">
            <span style="color:#94a3b8;font-size:12px;min-width:110px">Advocate</span>
            <span style="color:#111827;font-size:13px">${opts.advocate}</span>
          </div>
        </div>
      </div>

      <p style="color:#6b7280;font-size:12px;margin:0">
        Please ensure all case files, vakalatnama, and relevant documents are ready before the hearing.
      </p>
    </div>

    <!-- Footer -->
    <div style="background:#f9fafb;padding:14px 24px;border:1px solid #e5e7eb;border-radius:0 0 10px 10px;text-align:center">
      <p style="color:#9ca3af;font-size:11px;margin:0">
        LegalTrack · Automated case tracking system<br>
        This notification was sent because this case is linked to your client profile.
      </p>
    </div>
  </div>
</body>
</html>`;
}

function invoiceHtml(opts: {
  clientName: string;
  invoiceNumber: string;
  caseNo: string;
  total: string;
  dueDate: string;
  aiSummary: string;
}) {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f3f4f8;margin:0;padding:20px">
  <div style="max-width:540px;margin:0 auto">
    <div style="background:#0f1f3d;padding:20px 24px;border-radius:10px 10px 0 0">
      <div style="color:#fff;font-size:16px;font-weight:700">LegalTrack</div>
      <div style="color:rgba(255,255,255,0.5);font-size:11px;margin-top:2px">Invoice</div>
    </div>
    <div style="background:#fff;padding:24px;border:1px solid #e5e7eb;border-left:1px solid #e5e7eb;border-right:1px solid #e5e7eb">
      <h2 style="margin:0 0 4px;font-size:18px;color:#111827">Invoice ${opts.invoiceNumber}</h2>
      <p style="margin:0 0 20px;color:#6b7280;font-size:13px">For: ${opts.clientName}</p>

      <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:14px;margin-bottom:20px">
        <div style="font-size:12px;color:#1e40af;font-weight:600;margin-bottom:4px">Case</div>
        <div style="font-family:monospace;color:#1e40af;font-size:13px;font-weight:700">${opts.caseNo}</div>
      </div>

      <div style="display:flex;justify-content:space-between;padding:12px 0;border-bottom:1px solid #e5e7eb">
        <span style="color:#6b7280;font-size:13px">Amount Due</span>
        <span style="font-size:18px;font-weight:700;color:#1d4ed8">${opts.total}</span>
      </div>
      <div style="display:flex;justify-content:space-between;padding:10px 0">
        <span style="color:#6b7280;font-size:13px">Due Date</span>
        <span style="color:#111827;font-size:13px;font-weight:600">${opts.dueDate}</span>
      </div>

      ${opts.aiSummary ? `
      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:12px;margin-top:16px">
        <div style="font-size:11px;font-weight:700;color:#166534;margin-bottom:6px">✦ Work Summary</div>
        <p style="color:#166534;font-size:12px;margin:0;line-height:1.5">${opts.aiSummary}</p>
      </div>` : ""}

      <p style="color:#9ca3af;font-size:12px;margin:20px 0 0">
        Please make payment within the due date. Contact your advocate for payment details.
      </p>
    </div>
    <div style="background:#f9fafb;padding:12px 24px;border:1px solid #e5e7eb;border-radius:0 0 10px 10px;text-align:center">
      <p style="color:#9ca3af;font-size:11px;margin:0">LegalTrack · Automated legal practice management</p>
    </div>
  </div>
</body>
</html>`;
}

// ─── Send functions ────────────────────────────────────────────────────────────
export async function sendHearingReminder(opts: {
  to: string;
  clientName: string;
  caseNo: string;
  caseTitle: string;
  nextDate: string;
  court: string;
  advocate: string;
  daysAway: number;
}): Promise<void> {
  const t = getTransporter();
  const subject = `⚖️ Hearing Reminder: ${opts.caseNo} — ${opts.nextDate}`;
  const html = hearingReminderHtml({
    clientName: opts.clientName,
    caseNo: opts.caseNo,
    casTitle: opts.caseTitle,
    nextDate: opts.nextDate,
    court: opts.court,
    advocate: opts.advocate,
    daysAway: opts.daysAway,
  });

  if (!t) {
    console.log(`[email] (dev mode) Would send to ${opts.to}: ${subject}`);
    return;
  }
  await t.sendMail({ from: process.env.EMAIL_FROM, to: opts.to, subject, html });
  console.log(`[email] Hearing reminder sent to ${opts.to} for ${opts.caseNo}`);
}

export async function sendInvoice(opts: {
  to: string;
  clientName: string;
  invoiceNumber: string;
  caseNo: string;
  total: string;
  dueDate: string;
  aiSummary: string;
}): Promise<void> {
  const t = getTransporter();
  const subject = `Invoice ${opts.invoiceNumber} from LegalTrack — ${opts.total}`;
  const html = invoiceHtml(opts);

  if (!t) {
    console.log(`[email] (dev mode) Would send invoice ${opts.invoiceNumber} to ${opts.to}`);
    return;
  }
  await t.sendMail({ from: process.env.EMAIL_FROM, to: opts.to, subject, html });
  console.log(`[email] Invoice sent to ${opts.to}`);
}

// ─── Daily hearing reminders job ─────────────────────────────────────────────
export async function sendDailyHearingReminders(): Promise<void> {
  console.log("[notifications] Running daily hearing reminder job…");

  // Find all cases with next_hearing_date within the next 7 days that have a client email
  const result = await pool.query(`
    SELECT
      c.id, c.case_no, c.case_title, c.court, c.next_hearing_date,
      cl.name AS client_name, cl.email AS client_email
    FROM cases c
    JOIN clients cl ON cl.id = c.client_id
    WHERE
      cl.email IS NOT NULL
      AND cl.email LIKE '%@%.%'
      AND c.next_hearing_date IS NOT NULL
      AND c.next_hearing_date >= CURRENT_DATE
  `);

  if (result.rows.length === 0) {
    console.log("[notifications] No upcoming hearings to notify about.");
    return;
  }

  let sent = 0;
  for (const row of result.rows) {
    const nextDate = new Date(row.next_hearing_date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const daysAway = Math.round((nextDate.getTime() - today.getTime()) / 86400000);

    const formattedDate = nextDate.toLocaleDateString("en-IN", {
      weekday: "long", day: "numeric", month: "long", year: "numeric",
    });

    try {
      await sendHearingReminder({
        to: row.client_email,
        clientName: row.client_name,
        caseNo: row.case_no,
        caseTitle: row.case_title ?? row.case_no,
        nextDate: formattedDate,
        court: row.court ?? "Delhi High Court",
        advocate: "Your Advocate",
        daysAway,
      });
      sent++;
    } catch (err) {
      console.error(`[notifications] Failed to send to ${row.client_email}:`, (err as Error).message);
    }
  }

  console.log(`[notifications] Sent ${sent} hearing reminder(s).`);
}
