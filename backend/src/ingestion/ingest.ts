/**
 * Step 5: Main ingestion pipeline + node-cron scheduler.
 *
 * Can be run directly (npm run ingest-now) for an immediate run,
 * or imported into the server to start the cron job.
 */
import * as cron from "node-cron";
import * as dotenv from "dotenv";
import { fetchDelhiHCCauseList } from "./fetcher";
import { parseCauseListText } from "./parser";
import { upsertCases } from "./upsert";
import { sendDailyHearingReminders } from "../notifications/emailService";

dotenv.config();

/**
 * Run one full ingestion cycle: fetch → parse → upsert.
 */
export async function runIngestion(): Promise<void> {
  const startTime = Date.now();
  console.log(`\n[ingest] ===== Starting ingestion at ${new Date().toISOString()} =====`);

  try {
    // Step 1: Fetch the PDF text
    const fetchResult = await fetchDelhiHCCauseList();
    if (!fetchResult) {
      console.log("[ingest] No cause list to process today. Skipping.");
      return;
    }

    // Step 2: Parse into structured records
    const parsed = parseCauseListText(fetchResult.text);
    console.log(`[ingest] Parsed ${parsed.length} case records from "${fetchResult.title}"`);

    if (parsed.length === 0) {
      console.warn(
        "[ingest] Parser returned 0 records — PDF format may have changed. " +
        "Run 'npm run extract-test' and review the raw text output."
      );
      return;
    }

    // Log a sample for sanity checking
    console.log("[ingest] Sample record:", JSON.stringify(parsed[0], null, 2));

    // Step 3: Upsert into Postgres
    const result = await upsertCases(parsed);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(
      `[ingest] Done in ${elapsed}s — inserted: ${result.inserted}, updated: ${result.updated}, errors: ${result.errors}`
    );
  } catch (err) {
    // Log clearly so it's visible in cron logs — but don't crash the process
    console.error(`[ingest] Pipeline failed: ${(err as Error).message}`);
    if ((err as Error).stack) {
      console.error((err as Error).stack);
    }
  }
}

/**
 * Start the cron scheduler.
 * Default: every day at 06:00 AM IST (00:30 UTC).
 * Court portals are throttled 10am–2pm; early morning is safest.
 *
 * Override via env: CRON_SCHEDULE="0 6 * * *"
 */
export function startCron(): void {
  const schedule = process.env.CRON_SCHEDULE ?? "30 0 * * *"; // 06:00 IST = 00:30 UTC
  console.log(`[cron] Scheduled ingestion with pattern: "${schedule}"`);

  cron.schedule(schedule, () => {
    runIngestion().catch((err) => {
      console.error("[cron] Unexpected uncaught error:", (err as Error).message);
    });
  });

  // Daily hearing reminders at 08:00 IST (02:30 UTC)
  const notifSchedule = process.env.NOTIF_SCHEDULE ?? "30 2 * * *";
  cron.schedule(notifSchedule, () => {
    sendDailyHearingReminders().catch((err) => {
      console.error("[cron] Notification error:", (err as Error).message);
    });
  });
  console.log(`[cron] Hearing reminders scheduled at "${notifSchedule}" (08:00 IST)`);
}

// Allow running directly: `npm run ingest-now`
if (require.main === module) {
  runIngestion().then(() => process.exit(0)).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
