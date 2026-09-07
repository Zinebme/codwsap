import { requireSuperAdmin } from "@/server/auth/session";
import { jsonError, ok } from "@/server/http";
import { all, get } from "@/server/db";
import { superAdminKpis } from "@/server/services/analytics";
import { workerHealth } from "@/server/jobs/worker";

export const dynamic = "force-dynamic";

type State = "healthy" | "degraded" | "down";

function rate(service: string): { calls: number; failures: number; state: State } {
  const since = new Date(Date.now() - 24 * 3600_000).toISOString().slice(0, 19).replace("T", " ");
  const row = get<{ calls: number; failures: number }>(
    "SELECT COUNT(*) AS calls, SUM(CASE WHEN ok = 0 THEN 1 ELSE 0 END) AS failures FROM api_logs WHERE service LIKE ? AND created_at >= ?",
    [service, since],
  );
  const calls = row?.calls ?? 0;
  const failures = row?.failures ?? 0;
  const ratio = calls ? failures / calls : 0;
  return { calls, failures, state: calls === 0 ? "healthy" : ratio >= 0.5 ? "down" : ratio >= 0.1 ? "degraded" : "healthy" };
}

export async function GET() {
  try {
    await requireSuperAdmin();
    const jobs = workerHealth();
    const webhookFailures = get<{ c: number }>("SELECT COUNT(*) AS c FROM webhook_events WHERE status = 'failed'")?.c ?? 0;
    return ok({
      kpi: superAdminKpis(),
      services: {
        whatsapp: rate("whatsapp"),
        delivery: rate("delivery:%"),
        telegram: rate("telegram"),
        sheets: rate("google_sheets"),
        webhooks: { calls: get<{ c: number }>("SELECT COUNT(*) AS c FROM webhook_events")?.c ?? 0, failures: webhookFailures, state: (webhookFailures > 20 ? "degraded" : "healthy") as State },
        jobs: { ...jobs, state: (jobs.failed > 20 || jobs.stuck > 5 ? "degraded" : "healthy") as State },
      },
      recentErrors: all("SELECT a.*, m.name AS merchant_name FROM api_logs a LEFT JOIN merchants m ON m.id = a.merchant_id WHERE a.ok = 0 ORDER BY a.created_at DESC LIMIT 30"),
      failedWebhooks: all("SELECT w.*, m.name AS merchant_name FROM webhook_events w LEFT JOIN merchants m ON m.id = w.merchant_id WHERE w.status = 'failed' ORDER BY w.created_at DESC LIMIT 20"),
      providerRequests: all("SELECT p.*, m.name AS merchant_name FROM provider_requests p LEFT JOIN merchants m ON m.id = p.merchant_id ORDER BY p.created_at DESC LIMIT 20"),
      audits: all("SELECT a.*, m.name AS merchant_name FROM audit_logs a LEFT JOIN merchants m ON m.id = a.merchant_id ORDER BY a.created_at DESC LIMIT 40"),
      plans: all("SELECT * FROM plans ORDER BY sort_order"),
    });
  } catch (e) {
    return jsonError(e);
  }
}
