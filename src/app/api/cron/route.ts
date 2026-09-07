import { runWorker } from "@/server/jobs/worker";
import { all, run, nowIso } from "@/server/db";
import { enqueueJob } from "@/server/jobs/queue";
import { ok } from "@/server/http";
import { safeJson } from "@/server/connectors/orders";

export const dynamic = "force-dynamic";

/**
 * Scheduled entrypoint (Vercel Cron / Supabase pg_cron / any scheduler).
 * Protected by CRON_SECRET. Enqueues periodic work then drains the queue.
 */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  const provided = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (secret && provided !== secret) return new Response("unauthorized", { status: 401 });

  // Delivery polling for merchants with active connectors that lack webhooks.
  const merchants = all<{ merchant_id: string }>(
    "SELECT DISTINCT merchant_id FROM delivery_connections WHERE is_active = 1 AND status = 'connected'",
  );
  for (const m of merchants) enqueueJob({ merchantId: m.merchant_id, type: "poll_delivery" });

  // Google Sheets auto-sync.
  const sheets = all<{ id: string; merchant_id: string; settings: string | null }>(
    "SELECT id, merchant_id, settings FROM integrations WHERE kind = 'google_sheets' AND status IN ('connected','error')",
  );
  for (const s of sheets) {
    const cfg = safeJson<{ auto_sync?: boolean }>(s.settings);
    if (cfg?.auto_sync) enqueueJob({ merchantId: s.merchant_id, type: "sync_sheet", payload: { integrationId: s.id } });
  }

  const result = await runWorker(50);
  run("UPDATE jobs SET status = 'pending' WHERE status = 'running' AND updated_at < ?", [
    new Date(Date.now() - 15 * 60_000).toISOString().slice(0, 19).replace("T", " "),
  ]);
  return ok({ ...result, at: nowIso() });
}

export async function GET(req: Request) {
  return POST(req);
}
