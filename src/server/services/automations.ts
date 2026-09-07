import "server-only";
import { get, run, uid, nowIso } from "@/server/db";
import type { AutomationType, DeliveryStatus } from "@/lib/domain";
import { AUTOMATION_META } from "@/lib/domain";
import { formatDzd } from "@/lib/domain";
import { queueMessage, isCustomerRelevantDeliveryStatus } from "@/server/services/messaging";
import { notify } from "@/server/services/notifications";
import { enqueueJob, toSql } from "@/server/jobs/queue";

type Automation = {
  id: string;
  merchant_id: string;
  type: AutomationType;
  enabled: number;
  template_id: string | null;
  config: string | null;
  cooldown_minutes: number;
  delay_minutes: number;
};

export async function getAutomation(merchantId: string, type: AutomationType): Promise<Automation | undefined> {
  return await get<Automation>("SELECT * FROM automations WHERE merchant_id = ? AND type = ?", [merchantId, type]);
}

export async function seedAutomations(merchantId: string) {
  const defaults: { type: AutomationType; cooldown: number; delay: number; enabled: number }[] = [
    { type: "new_order_confirmation", cooldown: 0, delay: 0, enabled: 1 },
    { type: "reply_yes_confirm", cooldown: 0, delay: 0, enabled: 1 },
    { type: "reply_no_cancel", cooldown: 0, delay: 0, enabled: 1 },
    { type: "shipped_notice", cooldown: 180, delay: 0, enabled: 1 },
    { type: "at_office_notice", cooldown: 60, delay: 0, enabled: 1 },
    { type: "out_for_delivery_notice", cooldown: 240, delay: 0, enabled: 0 },
    { type: "delivered_thanks", cooldown: 360, delay: 0, enabled: 1 },
    { type: "no_response_reminder", cooldown: 720, delay: 240, enabled: 1 },
    { type: "failed_message_alert", cooldown: 0, delay: 0, enabled: 1 },
  ];
  for (const d of defaults) {
    await run(
      `INSERT OR IGNORE INTO automations (id, merchant_id, type, name, enabled, cooldown_minutes, delay_minutes)
       VALUES (?,?,?,?,?,?,?)`,
      [uid("atm"), merchantId, d.type, AUTOMATION_META[d.type].fr, d.enabled, d.cooldown, d.delay],
    );
  }
}

type OrderRow = {
  id: string;
  merchant_id: string;
  reference: string;
  customer_id: string | null;
  customer_name: string | null;
  normalized_phone: string | null;
  total: number;
  tracking_number: string | null;
  delivery_provider: string | null;
  wilaya: string | null;
  commune: string | null;
  is_test: number;
  status: string;
};

function orderVariables(order: OrderRow): Record<string, string> {
  return {
    "1": order.customer_name ?? "client",
    "2": order.reference,
    "3": formatDzd(order.total),
    customer_name: order.customer_name ?? "client",
    order_ref: order.reference,
    total: formatDzd(order.total),
    tracking: order.tracking_number ?? "",
    wilaya: order.wilaya ?? "",
    commune: order.commune ?? "",
  };
}

async function logRun(merchantId: string, automationId: string | null, orderId: string | null, trigger: string, result: string, reason?: string) {
  await run("INSERT INTO automation_runs (id, merchant_id, automation_id, order_id, trigger, result, reason) VALUES (?,?,?,?,?,?,?)", [
    uid("run"),
    merchantId,
    automationId,
    orderId,
    trigger,
    result,
    reason ?? null,
  ]);
  if (automationId) {
    await run(
      `UPDATE automations SET last_run_at = ?, last_status = ?, run_count = run_count + 1,
        failure_count = failure_count + CASE WHEN ? = 'failed' THEN 1 ELSE 0 END WHERE id = ?`,
      [nowIso(), result, result, automationId],
    );
  }
}

async function runOrderAutomation(type: AutomationType, order: OrderRow, trigger: string) {
  const automation = await getAutomation(order.merchant_id, type);
  if (!automation) return;
  if (!automation.enabled) {
    await logRun(order.merchant_id, automation.id, order.id, trigger, "skipped", "automation_disabled");
    return;
  }
  if (!order.normalized_phone) {
    await logRun(order.merchant_id, automation.id, order.id, trigger, "skipped", "no_phone");
    return;
  }
  const templateId = automation.template_id ?? await defaultTemplateFor(order.merchant_id, type);
  const outcome = await queueMessage({
    merchantId: order.merchant_id,
    orderId: order.id,
    customerId: order.customer_id,
    toPhone: order.normalized_phone,
    templateId,
    eventKey: type,
    variables: orderVariables(order),
    automationId: automation.id,
    isTest: !!order.is_test,
    cooldownMinutes: automation.cooldown_minutes,
  });
  if (outcome.status === "queued") await logRun(order.merchant_id, automation.id, order.id, trigger, "sent");
  else if (outcome.status === "suppressed") {
    // queueMessage already logged the suppression details
    await run("UPDATE automations SET last_run_at = ?, last_status = 'suppressed' WHERE id = ?", [nowIso(), automation.id]);
  } else await logRun(order.merchant_id, automation.id, order.id, trigger, "failed", outcome.error);
}

async function defaultTemplateFor(merchantId: string, type: AutomationType): Promise<string | null> {
  const row = await get<{ id: string }>(
    "SELECT id FROM whatsapp_templates WHERE merchant_id = ? AND event_key = ? AND status = 'approved' ORDER BY updated_at DESC LIMIT 1",
    [merchantId, type],
  );
  return row?.id ?? null;
}

/* ------------------------------- Triggers -------------------------------- */

export async function onNewOrder(orderId: string) {
  const order = await get<OrderRow>("SELECT * FROM orders WHERE id = ?", [orderId]);
  if (!order) return;
  await notify({
    merchantId: order.merchant_id,
    type: "new_order",
    severity: "info",
    title: `Nouvelle commande ${order.reference}`,
    body: `${order.customer_name ?? "Client"} — ${formatDzd(order.total)}`,
    link: `/dashboard/orders?order=${order.id}`,
  });
  await runOrderAutomation("new_order_confirmation", order, "order.created");

  // Schedule the single no-response reminder.
  const reminder = await getAutomation(order.merchant_id, "no_response_reminder");
  if (reminder?.enabled) {
    await enqueueJob({
      merchantId: order.merchant_id,
      type: "reminder",
      payload: { orderId: order.id },
      runAfter: new Date(Date.now() + (reminder.delay_minutes || 240) * 60_000),
    });
  }
}

export async function onCustomerReply(orderId: string | null, merchantId: string, classification: "yes" | "no" | "other") {
  if (!orderId) return;
  const order = await get<OrderRow>("SELECT * FROM orders WHERE id = ? AND merchant_id = ?", [orderId, merchantId]);
  if (!order) return;

  if (classification === "yes") {
    const a = await getAutomation(merchantId, "reply_yes_confirm");
    if (a?.enabled && ["new", "awaiting_confirmation", "no_response", "postponed"].includes(order.status)) {
      await run("UPDATE orders SET status = 'confirmed', confirmed_at = ?, updated_at = ?, attention = 0 WHERE id = ?", [nowIso(), nowIso(), order.id]);
      await addOrderEvent(merchantId, order.id, "automation", "Commande confirmée automatiquement", "Le client a répondu OUI sur WhatsApp.");
      await logRun(merchantId, a.id, order.id, "customer.reply_yes", "sent");
      await notify({
        merchantId,
        type: "order_confirmed",
        severity: "success",
        title: `Commande ${order.reference} confirmée par le client`,
        link: `/dashboard/orders?order=${order.id}`,
      });
    }
  } else if (classification === "no") {
    const a = await getAutomation(merchantId, "reply_no_cancel");
    if (a?.enabled && !["delivered", "shipped", "returned"].includes(order.status)) {
      await run("UPDATE orders SET status = 'cancelled_by_customer', updated_at = ? WHERE id = ?", [nowIso(), order.id]);
      await addOrderEvent(merchantId, order.id, "automation", "Commande annulée automatiquement", "Le client a répondu NON sur WhatsApp.");
      await logRun(merchantId, a.id, order.id, "customer.reply_no", "sent");
      await notify({
        merchantId,
        type: "order_cancelled",
        severity: "warning",
        title: `Commande ${order.reference} annulée par le client`,
        link: `/dashboard/orders?order=${order.id}`,
      });
    }
  }
}

/**
 * Delivery status change → decide whether the customer really needs a message.
 * Courier internal transitions never generate customer messages.
 */
export async function onDeliveryStatusChange(orderId: string, merchantId: string, normalized: DeliveryStatus, rawStatus: string) {
  const order = await get<OrderRow>("SELECT * FROM orders WHERE id = ? AND merchant_id = ?", [orderId, merchantId]);
  if (!order) return;

  const statusToOrderStatus: Partial<Record<DeliveryStatus, string>> = {
    shipped: "shipped",
    in_transit: "in_transit",
    at_agency: "at_office",
    out_for_delivery: "out_for_delivery",
    delivered: "delivered",
    delivery_failed: "delivery_failed",
    returned: "returned",
  };
  const mapped = statusToOrderStatus[normalized];
  if (mapped) await run("UPDATE orders SET status = ?, delivery_status = ?, updated_at = ? WHERE id = ?", [mapped, normalized, nowIso(), orderId]);
  else await run("UPDATE orders SET delivery_status = ?, updated_at = ? WHERE id = ?", [normalized, nowIso(), orderId]);

  await addOrderEvent(merchantId, orderId, "delivery", `Statut transporteur : ${rawStatus}`, `Normalisé : ${normalized}`);

  if (normalized === "at_agency") {
    await notify({ merchantId, type: "parcel_at_office", severity: "info", title: `Colis ${order.reference} arrivé au bureau`, link: `/dashboard/orders?order=${orderId}` });
  }
  if (normalized === "delivery_failed") {
    await run("UPDATE orders SET attention = 1 WHERE id = ?", [orderId]);
    await notify({ merchantId, type: "delivery_failed", severity: "error", title: `Échec de livraison — ${order.reference}`, link: `/dashboard/orders?order=${orderId}` });
  }
  if (normalized === "returned") {
    await notify({ merchantId, type: "parcel_returned", severity: "warning", title: `Colis retourné — ${order.reference}`, link: `/dashboard/orders?order=${orderId}` });
  }

  if (!isCustomerRelevantDeliveryStatus(normalized)) return;

  const map: Partial<Record<DeliveryStatus, AutomationType>> = {
    shipped: "shipped_notice",
    at_agency: "at_office_notice",
    out_for_delivery: "out_for_delivery_notice",
    delivered: "delivered_thanks",
  };
  const type = map[normalized];
  if (type) await runOrderAutomation(type, { ...order, status: mapped ?? order.status }, `delivery.${normalized}`);
}

export async function runNoResponseReminder(orderId: string) {
  const order = await get<OrderRow & { last_reply_at: string | null }>("SELECT * FROM orders WHERE id = ?", [orderId]);
  if (!order) return;
  if (order.last_reply_at) return; // customer answered
  if (!["new", "awaiting_confirmation"].includes(order.status)) return;
  await run("UPDATE orders SET status = 'no_response', attention = 1, updated_at = ? WHERE id = ? AND status IN ('new','awaiting_confirmation')", [nowIso(), orderId]);
  await runOrderAutomation("no_response_reminder", order, "order.no_response");
}

export async function addOrderEvent(
  merchantId: string,
  orderId: string,
  type: string,
  title: string,
  description?: string,
  actor?: { id?: string | null; label?: string | null },
  metadata?: unknown,
) {
  await run(
    "INSERT INTO order_events (id, merchant_id, order_id, type, title, description, actor_id, actor_label, metadata) VALUES (?,?,?,?,?,?,?,?,?)",
    [uid("evt"), merchantId, orderId, type, title, description ?? null, actor?.id ?? null, actor?.label ?? null, metadata ? JSON.stringify(metadata) : null],
  );
}

export async function scheduleDeliveryPolling(merchantId: string) {
  await enqueueJob({ merchantId, type: "poll_delivery", payload: {}, runAfter: new Date(Date.now() + 60_000) });
}

export { toSql };
