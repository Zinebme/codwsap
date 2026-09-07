import "server-only";
import { all, get, run, nowIso } from "@/server/db";
import { claimJobs, completeJob, failJob, enqueueJob, type Job } from "@/server/jobs/queue";
import { deliverQueuedMessage, markMessageFailed } from "@/server/services/messaging";
import { refreshTracking } from "@/server/services/delivery";
import { runNoResponseReminder } from "@/server/services/automations";
import { syncGoogleSheet, safeJson } from "@/server/connectors/orders";
import { decryptSecret } from "@/server/crypto";
import { apiLog } from "@/server/services/audit";

async function handle(job: Job): Promise<void> {
  const payload = safeJson<Record<string, string>>(job.payload) ?? {};
  switch (job.type) {
    case "send_whatsapp": {
      const res = await deliverQueuedMessage(payload.messageId);
      if (!res.ok) throw new Error(res.error ?? "Envoi échoué");
      return;
    }
    case "poll_delivery": {
      // Poll only orders that are in-flight, in small batches.
      const orders = all<{ id: string; merchant_id: string }>(
        `SELECT id, merchant_id FROM orders
         WHERE merchant_id = ? AND tracking_number IS NOT NULL
           AND delivery_status NOT IN ('delivered','returned','delivery_failed')
         ORDER BY updated_at ASC LIMIT 25`,
        [job.merchant_id],
      );
      for (const o of orders) {
        try {
          await refreshTracking(o.merchant_id, o.id);
        } catch {
          /* individual failures must not kill the batch */
        }
      }
      if (orders.length && job.merchant_id) {
        enqueueJob({ merchantId: job.merchant_id, type: "poll_delivery", runAfter: new Date(Date.now() + 15 * 60_000) });
      }
      return;
    }
    case "sync_sheet": {
      const res = await syncGoogleSheet(job.merchant_id!, payload.integrationId);
      if (!res.ok) throw new Error(res.error);
      return;
    }
    case "reminder": {
      runNoResponseReminder(payload.orderId);
      return;
    }
    case "notify_telegram": {
      const integ = get<{ credentials_encrypted: string | null }>(
        "SELECT credentials_encrypted FROM integrations WHERE merchant_id = ? AND kind = 'telegram' AND status = 'connected' LIMIT 1",
        [job.merchant_id],
      );
      const creds = decryptSecret<{ bot_token?: string; chat_id?: string }>(integ?.credentials_encrypted);
      if (!creds?.bot_token || !creds.chat_id) return;
      const text = `*${payload.title}*\n${payload.body ?? ""}`;
      const res = await fetch(`https://api.telegram.org/bot${creds.bot_token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: creds.chat_id, text, parse_mode: "Markdown" }),
        signal: AbortSignal.timeout(10000),
      });
      apiLog({ merchantId: job.merchant_id, service: "telegram", operation: "sendMessage", ok: res.ok, statusCode: res.status });
      if (!res.ok) throw new Error(`Telegram HTTP ${res.status}`);
      return;
    }
    default:
      return;
  }
}

/** Processes a bounded batch. Called by the cron endpoint and after mutations. */
export async function runWorker(limit = 20): Promise<{ processed: number; failed: number }> {
  const jobs = claimJobs(limit);
  let failed = 0;
  for (const job of jobs) {
    try {
      await handle(job);
      completeJob(job.id);
    } catch (e) {
      const outcome = failJob(job, (e as Error).message);
      if (outcome === "failed") {
        failed++;
        if (job.type === "send_whatsapp") {
          const payload = safeJson<{ messageId: string }>(job.payload);
          if (payload?.messageId) markMessageFailed(payload.messageId, (e as Error).message);
        }
      }
    }
  }
  run("DELETE FROM jobs WHERE status = 'done' AND updated_at < ?", [new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 19).replace("T", " ")]);
  return { processed: jobs.length, failed };
}

export function workerHealth() {
  const pending = get<{ c: number }>("SELECT COUNT(*) AS c FROM jobs WHERE status = 'pending'")?.c ?? 0;
  const failedJobs = get<{ c: number }>("SELECT COUNT(*) AS c FROM jobs WHERE status = 'failed'")?.c ?? 0;
  const stuck = get<{ c: number }>("SELECT COUNT(*) AS c FROM jobs WHERE status = 'running' AND updated_at < ?", [
    new Date(Date.now() - 10 * 60_000).toISOString().slice(0, 19).replace("T", " "),
  ])?.c ?? 0;
  return { pending, failed: failedJobs, stuck, checkedAt: nowIso() };
}
