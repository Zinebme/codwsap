import { requireTenant } from "@/server/auth/session";
import { jsonError, ok } from "@/server/http";
import { all } from "@/server/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const ctx = await requireTenant();
    return ok({
      rows: await all(
        `SELECT a.*, t.name AS template_name, t.status AS template_status
         FROM automations a LEFT JOIN whatsapp_templates t ON t.id = a.template_id
         WHERE a.merchant_id = ? ORDER BY a.created_at`,
        [ctx.merchantId],
      ),
      templates: await all("SELECT id, name, status, category, event_key FROM whatsapp_templates WHERE merchant_id = ? ORDER BY name", [ctx.merchantId]),
      runs: await all(
        `SELECT r.*, a.type AS automation_type FROM automation_runs r LEFT JOIN automations a ON a.id = r.automation_id
         WHERE r.merchant_id = ? ORDER BY r.created_at DESC LIMIT 30`,
        [ctx.merchantId],
      ),
    });
  } catch (e) {
    return jsonError(e);
  }
}
