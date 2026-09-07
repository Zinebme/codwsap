import { requireTenant } from "@/server/auth/session";
import { jsonError, ok } from "@/server/http";
import { all, get } from "@/server/db";
import { merchantKpis, ordersByDay, messagesByDay, rangeFromPreset } from "@/server/services/analytics";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const ctx = await requireTenant();
    const m = ctx.merchantId;
    const range = rangeFromPreset("30d");
    const todayStart = new Date().toISOString().slice(0, 10);

    const today = await get<Record<string, number>>(
      `SELECT COUNT(*) AS orders,
        SUM(CASE WHEN status='new' THEN 1 ELSE 0 END) AS new,
        SUM(CASE WHEN status='awaiting_confirmation' THEN 1 ELSE 0 END) AS awaiting,
        SUM(CASE WHEN status='confirmed' THEN 1 ELSE 0 END) AS confirmed,
        SUM(CASE WHEN status='shipped' THEN 1 ELSE 0 END) AS shipped,
        SUM(CASE WHEN status='at_office' THEN 1 ELSE 0 END) AS atOffice,
        SUM(CASE WHEN status='delivered' THEN 1 ELSE 0 END) AS delivered,
        SUM(CASE WHEN status IN ('returned','return_requested') THEN 1 ELSE 0 END) AS returned,
        SUM(CASE WHEN status='cancelled_by_customer' THEN 1 ELSE 0 END) AS cancelled,
        SUM(CASE WHEN status='no_response' THEN 1 ELSE 0 END) AS noResponse
       FROM orders WHERE merchant_id = ? AND is_test = 0 AND created_at >= ?`,
      [m, todayStart],
    );

    const kpi = await merchantKpis(m, range) as unknown as Record<string, number>;
    kpi.attention = (await get<{ c: number }>("SELECT COUNT(*) AS c FROM orders WHERE merchant_id = ? AND attention = 1 AND status NOT IN ('delivered','returned')", [m]))?.c ?? 0;

    const merchant = await get<{ onboarding_completed_at: string | null; wilaya: string | null }>("SELECT onboarding_completed_at, wilaya FROM merchants WHERE id = ?", [m]);
    const waConn = await get<{ status: string }>("SELECT status FROM whatsapp_connections WHERE merchant_id = ?", [m]);
    const dlvCount = (await get<{ c: number }>("SELECT COUNT(*) AS c FROM delivery_connections WHERE merchant_id = ?", [m]))?.c ?? 0;
    const srcCount = (await get<{ c: number }>("SELECT COUNT(*) AS c FROM integrations WHERE merchant_id = ? AND kind IN ('google_sheets','webhook')", [m]))?.c ?? 0;
    const ordersCount = (await get<{ c: number }>("SELECT COUNT(*) AS c FROM orders WHERE merchant_id = ?", [m]))?.c ?? 0;
    const approvedTemplates = (await get<{ c: number }>("SELECT COUNT(*) AS c FROM whatsapp_templates WHERE merchant_id = ? AND status = 'approved'", [m]))?.c ?? 0;

    return ok({
      kpi,
      today: today ?? {},
      recentOrders: await all(
        "SELECT id, reference, customer_name, normalized_phone, wilaya, total, status, created_at FROM orders WHERE merchant_id = ? ORDER BY created_at DESC LIMIT 8",
        [m],
      ),
      recentReplies: await all(
        `SELECT msg.id, msg.body, msg.created_at, c.full_name AS customer_name, c.normalized_phone
         FROM whatsapp_messages msg LEFT JOIN customers c ON c.id = msg.customer_id
         WHERE msg.merchant_id = ? AND msg.direction = 'inbound' ORDER BY msg.created_at DESC LIMIT 6`,
        [m],
      ),
      incidents: await all(
        `SELECT e.id, e.order_id, e.raw_status, e.normalized_status, o.reference FROM delivery_events e
         JOIN orders o ON o.id = e.order_id
         WHERE e.merchant_id = ? AND e.normalized_status IN ('delivery_failed','returned') ORDER BY e.occurred_at DESC LIMIT 6`,
        [m],
      ),
      alerts: await all("SELECT id, title, created_at FROM notifications WHERE merchant_id = ? AND severity IN ('error','warning') ORDER BY created_at DESC LIMIT 5", [m]),
      automationFailures: await all("SELECT id, reason, created_at FROM automation_runs WHERE merchant_id = ? AND result = 'failed' ORDER BY created_at DESC LIMIT 5", [m]),
      ordersByDay: await ordersByDay(m, range),
      messagesByDay: await messagesByDay(m, range),
      onboarding: {
        completed: !!merchant?.onboarding_completed_at,
        progress: {
          business: !!merchant?.wilaya,
          source: srcCount > 0 || ordersCount > 0,
          whatsapp: waConn?.status === "connected",
          delivery: dlvCount > 0,
          templates: approvedTemplates > 0,
          completed: !!merchant?.onboarding_completed_at,
        },
      },
    });
  } catch (e) {
    return jsonError(e);
  }
}
