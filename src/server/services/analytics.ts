import "server-only";
import { all, get } from "@/server/db";

export type Range = { from: string; to: string };

export function rangeFromPreset(preset: string, from?: string, to?: string): Range {
  const now = new Date();
  const end = to ?? now.toISOString().slice(0, 10);
  if (preset === "custom" && from) return { from, to: end };
  const days = preset === "today" ? 0 : preset === "7d" ? 6 : preset === "90d" ? 89 : 29;
  const start = new Date(now.getTime() - days * 864e5).toISOString().slice(0, 10);
  return { from: start, to: end };
}

function pct(part: number, total: number) {
  return total > 0 ? Math.round((part / total) * 1000) / 10 : 0;
}

export async function merchantKpis(merchantId: string, range: Range) {
  const params = [merchantId, range.from, `${range.to} 23:59:59`];
  const o = await get<{
    total: number;
    confirmed: number;
    cancelled: number;
    no_response: number;
    delivered: number;
    returned: number;
    shipped: number;
    revenue: number;
    value: number;
  }>(
    `SELECT COUNT(*) AS total,
       SUM(CASE WHEN status IN ('confirmed','preparing','shipped','in_transit','at_office','out_for_delivery','delivered') THEN 1 ELSE 0 END) AS confirmed,
       SUM(CASE WHEN status = 'cancelled_by_customer' THEN 1 ELSE 0 END) AS cancelled,
       SUM(CASE WHEN status = 'no_response' THEN 1 ELSE 0 END) AS no_response,
       SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) AS delivered,
       SUM(CASE WHEN status IN ('returned','return_requested') THEN 1 ELSE 0 END) AS returned,
       SUM(CASE WHEN status IN ('shipped','in_transit','at_office','out_for_delivery','delivered','returned','delivery_failed') THEN 1 ELSE 0 END) AS shipped,
       SUM(CASE WHEN status = 'delivered' THEN total ELSE 0 END) AS revenue,
       SUM(total) AS value
     FROM orders WHERE merchant_id = ? AND is_test = 0 AND created_at >= ? AND created_at <= ?`,
    params,
  );

  const m = await get<{ sent: number; delivered: number; read: number; failed: number; inbound: number; optouts: number }>(
    `SELECT
       SUM(CASE WHEN direction='outbound' AND status IN ('sent','delivered','read') THEN 1 ELSE 0 END) AS sent,
       SUM(CASE WHEN direction='outbound' AND status IN ('delivered','read') THEN 1 ELSE 0 END) AS delivered,
       SUM(CASE WHEN direction='outbound' AND status='read' THEN 1 ELSE 0 END) AS read,
       SUM(CASE WHEN direction='outbound' AND status IN ('failed','rejected') THEN 1 ELSE 0 END) AS failed,
       SUM(CASE WHEN direction='inbound' THEN 1 ELSE 0 END) AS inbound,
       0 AS optouts
     FROM whatsapp_messages WHERE merchant_id = ? AND created_at >= ? AND created_at <= ?`,
    params,
  );

  const optouts = (await get<{ c: number }>(
    "SELECT COUNT(*) AS c FROM customer_consents WHERE merchant_id = ? AND action = 'opt_out' AND created_at >= ? AND created_at <= ?",
    params,
  ))?.c ?? 0;

  const suppressed = (await get<{ c: number }>(
    "SELECT COUNT(*) AS c FROM automation_runs WHERE merchant_id = ? AND result = 'suppressed' AND created_at >= ? AND created_at <= ?",
    params,
  ))?.c ?? 0;

  const duplicatesPrevented = (await get<{ c: number }>(
    "SELECT COUNT(*) AS c FROM automation_runs WHERE merchant_id = ? AND result = 'suppressed' AND reason = 'duplicate' AND created_at >= ? AND created_at <= ?",
    params,
  ))?.c ?? 0;

  const orders = o?.total ?? 0;
  const outbound = (m?.sent ?? 0) + (m?.failed ?? 0);
  return {
    orders,
    confirmed: o?.confirmed ?? 0,
    cancelled: o?.cancelled ?? 0,
    noResponse: o?.no_response ?? 0,
    delivered: o?.delivered ?? 0,
    returned: o?.returned ?? 0,
    shipped: o?.shipped ?? 0,
    revenue: o?.revenue ?? 0,
    orderValue: o?.value ?? 0,
    aov: orders ? Math.round((o?.value ?? 0) / orders) : 0,
    confirmationRate: pct(o?.confirmed ?? 0, orders),
    cancellationRate: pct(o?.cancelled ?? 0, orders),
    noResponseRate: pct(o?.no_response ?? 0, orders),
    deliveryRate: pct(o?.delivered ?? 0, o?.shipped ?? 0),
    returnRate: pct(o?.returned ?? 0, o?.shipped ?? 0),
    messagesSent: m?.sent ?? 0,
    messagesFailed: m?.failed ?? 0,
    messagesInbound: m?.inbound ?? 0,
    messageDeliveryRate: pct(m?.delivered ?? 0, m?.sent ?? 0),
    messageReadRate: pct(m?.read ?? 0, m?.sent ?? 0),
    replyRate: pct(m?.inbound ?? 0, m?.sent ?? 0),
    failureRate: pct(m?.failed ?? 0, outbound),
    optOutRate: pct(optouts, m?.sent ?? 0),
    optOuts: optouts,
    messagesPerOrder: orders ? Math.round(((m?.sent ?? 0) / orders) * 10) / 10 : 0,
    suppressed,
    duplicatesPrevented,
  };
}

export async function ordersByDay(merchantId: string, range: Range) {
  return await all<{ day: string; orders: number; delivered: number; returned: number; confirmed: number }>(
    `SELECT substr(created_at,1,10) AS day,
       COUNT(*) AS orders,
       SUM(CASE WHEN status='delivered' THEN 1 ELSE 0 END) AS delivered,
       SUM(CASE WHEN status IN ('returned','return_requested') THEN 1 ELSE 0 END) AS returned,
       SUM(CASE WHEN status NOT IN ('new','awaiting_confirmation','no_response','cancelled_by_customer') THEN 1 ELSE 0 END) AS confirmed
     FROM orders WHERE merchant_id = ? AND is_test = 0 AND created_at >= ? AND created_at <= ?
     GROUP BY day ORDER BY day`,
    [merchantId, range.from, `${range.to} 23:59:59`],
  );
}

export async function messagesByDay(merchantId: string, range: Range) {
  return await all<{ day: string; sent: number; failed: number; inbound: number }>(
    `SELECT substr(created_at,1,10) AS day,
       SUM(CASE WHEN direction='outbound' AND status IN ('sent','delivered','read') THEN 1 ELSE 0 END) AS sent,
       SUM(CASE WHEN direction='outbound' AND status IN ('failed','rejected') THEN 1 ELSE 0 END) AS failed,
       SUM(CASE WHEN direction='inbound' THEN 1 ELSE 0 END) AS inbound
     FROM whatsapp_messages WHERE merchant_id = ? AND created_at >= ? AND created_at <= ?
     GROUP BY day ORDER BY day`,
    [merchantId, range.from, `${range.to} 23:59:59`],
  );
}

export async function templatePerformance(merchantId: string, range: Range) {
  return await all<{
    template_id: string;
    name: string;
    category: string;
    sent: number;
    failed: number;
    read: number;
    replies: number;
  }>(
    `SELECT t.id AS template_id, t.name, t.category,
       SUM(CASE WHEN m.status IN ('sent','delivered','read') THEN 1 ELSE 0 END) AS sent,
       SUM(CASE WHEN m.status IN ('failed','rejected') THEN 1 ELSE 0 END) AS failed,
       SUM(CASE WHEN m.status = 'read' THEN 1 ELSE 0 END) AS read,
       0 AS replies
     FROM whatsapp_templates t
     LEFT JOIN whatsapp_messages m ON m.template_id = t.id AND m.created_at >= ? AND m.created_at <= ?
     WHERE t.merchant_id = ?
     GROUP BY t.id ORDER BY sent DESC`,
    [range.from, `${range.to} 23:59:59`, merchantId],
  );
}

export type QualityBadge = "good" | "monitor" | "at_risk";

export function qualityAssessment(kpi: Awaited<ReturnType<typeof merchantKpis>>) {
  const recommendations: { level: QualityBadge; text: string }[] = [];
  let badge: QualityBadge = "good";

  if (kpi.failureRate >= 10) {
    badge = "at_risk";
    recommendations.push({ level: "at_risk", text: `Taux d'échec de ${kpi.failureRate}% : vérifiez vos numéros et l'état de votre connexion WhatsApp.` });
  } else if (kpi.failureRate >= 4) {
    badge = "monitor";
    recommendations.push({ level: "monitor", text: `Taux d'échec de ${kpi.failureRate}%, légèrement supérieur à la normale.` });
  }
  if (kpi.messagesPerOrder > 4) {
    badge = badge === "at_risk" ? badge : "monitor";
    recommendations.push({ level: "monitor", text: `Vous envoyez ${kpi.messagesPerOrder} messages par commande. Réduisez les notifications peu utiles.` });
  }
  if (kpi.messagesSent >= 50 && kpi.replyRate < 10) {
    recommendations.push({ level: "monitor", text: `Seulement ${kpi.replyRate}% de réponses : vos clients répondent rarement à vos relances.` });
  }
  if (kpi.optOutRate >= 2) {
    badge = "at_risk";
    recommendations.push({ level: "at_risk", text: `Taux de désinscription de ${kpi.optOutRate}% : vos messages sont perçus comme trop fréquents.` });
  }
  if (!recommendations.length) {
    recommendations.push({ level: "good", text: "Vos indicateurs internes sont sains. Continuez à limiter les messages non essentiels." });
  }
  return { badge, recommendations };
}

export async function superAdminKpis() {
  const merchants = await get<{ total: number; active: number; trial: number; suspended: number }>(
    `SELECT COUNT(*) AS total,
      SUM(CASE WHEN status='active' THEN 1 ELSE 0 END) AS active,
      SUM(CASE WHEN status='trial' THEN 1 ELSE 0 END) AS trial,
      SUM(CASE WHEN status='suspended' THEN 1 ELSE 0 END) AS suspended
     FROM merchants`,
  );
  const orders = (await get<{ c: number }>("SELECT COUNT(*) AS c FROM orders"))?.c ?? 0;
  const messages = (await get<{ c: number }>("SELECT COUNT(*) AS c FROM whatsapp_messages WHERE direction='outbound'"))?.c ?? 0;
  const failedMessages = (await get<{ c: number }>("SELECT COUNT(*) AS c FROM whatsapp_messages WHERE status IN ('failed','rejected')"))?.c ?? 0;
  const deliveryCalls = (await get<{ c: number }>("SELECT COUNT(*) AS c FROM api_logs WHERE service LIKE 'delivery:%'"))?.c ?? 0;
  const integrationErrors = (await get<{ c: number }>("SELECT COUNT(*) AS c FROM api_logs WHERE ok = 0"))?.c ?? 0;
  const webhookErrors = (await get<{ c: number }>("SELECT COUNT(*) AS c FROM webhook_events WHERE status = 'failed'"))?.c ?? 0;
  const automationFailures = (await get<{ c: number }>("SELECT COUNT(*) AS c FROM automation_runs WHERE result = 'failed'"))?.c ?? 0;
  return {
    merchants: merchants?.total ?? 0,
    active: merchants?.active ?? 0,
    trial: merchants?.trial ?? 0,
    suspended: merchants?.suspended ?? 0,
    orders,
    messages,
    failedMessages,
    deliveryCalls,
    integrationErrors,
    webhookErrors,
    automationFailures,
  };
}
