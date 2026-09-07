import "server-only";
import { get, run, uid, all, nowIso } from "@/server/db";
import { getWhatsappProvider, renderTemplate } from "@/server/connectors/whatsapp";
import { notify } from "@/server/services/notifications";
import { enqueueJob } from "@/server/jobs/queue";
import type { AutomationType } from "@/lib/domain";

/**
 * WhatsApp quality protection engine.
 *
 * Business-initiated messages go through a chain of guards BEFORE hitting the
 * API: relevance, consent, opt-out, cooldown, duplicate suppression, template
 * approval, per-order frequency cap, recent-reply awareness and eligibility.
 * Every suppression is recorded so merchants can see what was prevented.
 */

export type SuppressionReason =
  | "opted_out"
  | "cooldown"
  | "duplicate"
  | "template_not_approved"
  | "template_missing"
  | "not_eligible"
  | "max_per_order"
  | "customer_recently_replied"
  | "no_meaningful_change"
  | "automation_disabled"
  | "not_relevant";

export const SUPPRESSION_LABELS: Record<SuppressionReason, string> = {
  opted_out: "Client désinscrit",
  cooldown: "Délai anti-fréquence non écoulé",
  duplicate: "Message identique déjà envoyé",
  template_not_approved: "Template non approuvé",
  template_missing: "Template introuvable",
  not_eligible: "Numéro non éligible",
  max_per_order: "Limite de messages par commande atteinte",
  customer_recently_replied: "Le client vient de répondre",
  no_meaningful_change: "Aucun changement significatif",
  automation_disabled: "Automatisation désactivée",
  not_relevant: "Évènement non pertinent pour le client",
};

export type SendDecision =
  | { allowed: true }
  | { allowed: false; reason: SuppressionReason; detail?: string };

export type SendOutcome = {
  status: "sent" | "queued" | "suppressed" | "failed";
  reason?: SuppressionReason;
  messageId?: string;
  error?: string;
};

const URGENT_EVENTS: AutomationType[] = ["new_order_confirmation", "at_office_notice"];
/** Delivery events that are NOT worth a customer message (courier internals). */
const NON_CUSTOMER_EVENTS = new Set(["created", "submitted", "accepted", "in_transit"]);

export function isCustomerRelevantDeliveryStatus(normalized: string): boolean {
  return !NON_CUSTOMER_EVENTS.has(normalized);
}

export type SendRequest = {
  merchantId: string;
  orderId?: string | null;
  customerId?: string | null;
  toPhone: string;
  /** template-based automated message */
  templateId?: string | null;
  eventKey?: AutomationType | "manual";
  variables?: Record<string, string>;
  /** free text reply, only allowed inside the 24h service window */
  text?: string;
  automationId?: string | null;
  isTest?: boolean;
  bypassGuards?: boolean; // manual agent reply inside open window
  cooldownMinutes?: number;
  maxPerOrder?: number;
};

type CustomerRow = {
  id: string;
  opt_out_status: number;
  whatsapp_status: string;
  normalized_phone: string;
};

export function evaluateGuards(req: SendRequest): SendDecision {
  if (req.bypassGuards) return { allowed: true };

  const customer = req.customerId
    ? get<CustomerRow>("SELECT id, opt_out_status, whatsapp_status, normalized_phone FROM customers WHERE id = ? AND merchant_id = ?", [
        req.customerId,
        req.merchantId,
      ])
    : undefined;

  // 1. Opt-out (marketing is always blocked; utility follows merchant setting).
  if (customer?.opt_out_status) {
    const category = req.templateId
      ? get<{ category: string }>("SELECT category FROM whatsapp_templates WHERE id = ? AND merchant_id = ?", [req.templateId, req.merchantId])?.category
      : "utility";
    if (category === "marketing") return { allowed: false, reason: "opted_out" };
    return { allowed: false, reason: "opted_out", detail: "Le client a demandé l'arrêt des messages." };
  }

  // 2. Eligibility — never send to numbers explicitly known to be off WhatsApp.
  if (customer?.whatsapp_status === "unavailable") return { allowed: false, reason: "not_eligible" };

  // 3. Template must exist and be approved for automated sends.
  if (req.templateId) {
    const tpl = get<{ status: string }>("SELECT status FROM whatsapp_templates WHERE id = ? AND merchant_id = ?", [req.templateId, req.merchantId]);
    if (!tpl) return { allowed: false, reason: "template_missing" };
    if (tpl.status !== "approved") return { allowed: false, reason: "template_not_approved" };
  } else if (!req.text) {
    return { allowed: false, reason: "template_missing" };
  }

  // 4. Duplicate suppression on the dedupe key.
  const key = dedupeKey(req);
  if (key) {
    const dup = get<{ id: string }>("SELECT id FROM whatsapp_messages WHERE merchant_id = ? AND dedupe_key = ?", [req.merchantId, key]);
    if (dup) return { allowed: false, reason: "duplicate" };
  }

  // 5. Cooldown between two automated messages to the same customer.
  const urgent = req.eventKey && URGENT_EVENTS.includes(req.eventKey as AutomationType);
  const cooldown = req.cooldownMinutes ?? 180;
  if (!urgent && cooldown > 0 && req.customerId) {
    const last = get<{ created_at: string }>(
      `SELECT created_at FROM whatsapp_messages
       WHERE merchant_id = ? AND customer_id = ? AND direction = 'outbound' AND kind = 'template'
       ORDER BY created_at DESC LIMIT 1`,
      [req.merchantId, req.customerId],
    );
    if (last && minutesSince(last.created_at) < cooldown) {
      return { allowed: false, reason: "cooldown", detail: `Dernier message il y a ${Math.round(minutesSince(last.created_at))} min.` };
    }
  }

  // 6. Frequency cap per order.
  if (req.orderId) {
    const max = req.maxPerOrder ?? 5;
    const c = get<{ c: number }>(
      "SELECT COUNT(*) AS c FROM whatsapp_messages WHERE merchant_id = ? AND order_id = ? AND direction = 'outbound'",
      [req.merchantId, req.orderId],
    );
    if ((c?.c ?? 0) >= max) return { allowed: false, reason: "max_per_order" };
  }

  // 7. If the customer replied in the last 15 min, let a human handle it
  //    instead of stacking an automated template on top.
  if (!urgent && req.customerId) {
    const reply = get<{ created_at: string }>(
      "SELECT created_at FROM whatsapp_messages WHERE merchant_id = ? AND customer_id = ? AND direction = 'inbound' ORDER BY created_at DESC LIMIT 1",
      [req.merchantId, req.customerId],
    );
    if (reply && minutesSince(reply.created_at) < 15) return { allowed: false, reason: "customer_recently_replied" };
  }

  return { allowed: true };
}

export function dedupeKey(req: SendRequest): string | null {
  if (!req.eventKey || req.eventKey === "manual") return null;
  return `${req.eventKey}:${req.orderId ?? req.customerId ?? req.toPhone}`;
}

function minutesSince(sqlTime: string): number {
  const t = Date.parse(sqlTime.includes("T") ? sqlTime : `${sqlTime.replace(" ", "T")}Z`);
  if (Number.isNaN(t)) return Number.MAX_SAFE_INTEGER;
  return (Date.now() - t) / 60000;
}

/** Ensures a conversation row exists and returns it. */
export function ensureConversation(merchantId: string, phone: string, customerId?: string | null, orderId?: string | null) {
  const existing = get<{ id: string }>("SELECT id FROM whatsapp_conversations WHERE merchant_id = ? AND normalized_phone = ?", [merchantId, phone]);
  if (existing) return existing.id;
  const id = uid("cnv");
  run(
    "INSERT INTO whatsapp_conversations (id, merchant_id, customer_id, order_id, normalized_phone, last_message_at) VALUES (?,?,?,?,?,?)",
    [id, merchantId, customerId ?? null, orderId ?? null, phone, nowIso()],
  );
  return id;
}

export function serviceWindowOpen(conversationId: string): boolean {
  const row = get<{ last_inbound_at: string | null }>("SELECT last_inbound_at FROM whatsapp_conversations WHERE id = ?", [conversationId]);
  if (!row?.last_inbound_at) return false;
  return minutesSince(row.last_inbound_at) < 24 * 60;
}

/**
 * Queue an outbound message after passing the guard chain.
 * Actual API delivery happens in the background worker (retry-safe).
 */
export function queueMessage(req: SendRequest): SendOutcome {
  const decision = evaluateGuards(req);
  const conversationId = ensureConversation(req.merchantId, req.toPhone, req.customerId, req.orderId);

  if (!decision.allowed) {
    if (req.automationId) {
      run("UPDATE automations SET suppressed_count = suppressed_count + 1 WHERE id = ?", [req.automationId]);
      run(
        "INSERT INTO automation_runs (id, merchant_id, automation_id, order_id, trigger, result, reason, details) VALUES (?,?,?,?,?,?,?,?)",
        [uid("run"), req.merchantId, req.automationId, req.orderId ?? null, req.eventKey ?? "manual", "suppressed", decision.reason, decision.detail ?? null],
      );
    }
    return { status: "suppressed", reason: decision.reason };
  }

  let body = req.text ?? "";
  let templateName: string | null = null;
  let language = "fr";
  if (req.templateId) {
    const tpl = get<{ name: string; body: string; language: string }>("SELECT name, body, language FROM whatsapp_templates WHERE id = ?", [req.templateId]);
    if (!tpl) return { status: "suppressed", reason: "template_missing" };
    templateName = tpl.name;
    language = tpl.language;
    body = renderTemplate(tpl.body, req.variables ?? {});
  }

  const id = uid("msg");
  run(
    `INSERT INTO whatsapp_messages
      (id, merchant_id, conversation_id, order_id, customer_id, direction, kind, template_id, template_name, body, status, queued_at, automation_id, dedupe_key, is_test)
     VALUES (?,?,?,?,?,'outbound',?,?,?,?, 'queued', ?, ?, ?, ?)`,
    [
      id,
      req.merchantId,
      conversationId,
      req.orderId ?? null,
      req.customerId ?? null,
      req.templateId ? "template" : "text",
      req.templateId ?? null,
      templateName,
      body,
      nowIso(),
      req.automationId ?? null,
      dedupeKey(req),
      req.isTest ? 1 : 0,
    ],
  );

  run("UPDATE whatsapp_conversations SET last_message_at = ?, last_message_preview = ? WHERE id = ?", [nowIso(), body.slice(0, 140), conversationId]);
  if (req.orderId) {
    run("UPDATE orders SET last_message_at = ?, whatsapp_status = 'queued', updated_at = ? WHERE id = ? AND merchant_id = ?", [
      nowIso(),
      nowIso(),
      req.orderId,
      req.merchantId,
    ]);
  }

  enqueueJob({ merchantId: req.merchantId, type: "send_whatsapp", payload: { messageId: id } });
  bumpUsage(req.merchantId, "messages");
  return { status: "queued", messageId: id };
}

/** Executed by the worker. */
export async function deliverQueuedMessage(messageId: string): Promise<{ ok: boolean; error?: string }> {
  const msg = get<{
    id: string;
    merchant_id: string;
    order_id: string | null;
    customer_id: string | null;
    conversation_id: string | null;
    kind: string;
    template_name: string | null;
    body: string;
    status: string;
    attempts: number;
  }>("SELECT * FROM whatsapp_messages WHERE id = ?", [messageId]);
  if (!msg) return { ok: true };
  if (msg.status !== "queued") return { ok: true };

  const conv = msg.conversation_id
    ? get<{ normalized_phone: string }>("SELECT normalized_phone FROM whatsapp_conversations WHERE id = ?", [msg.conversation_id])
    : null;
  const to = conv?.normalized_phone;
  if (!to) return { ok: false, error: "Destinataire inconnu." };

  const { provider } = getWhatsappProvider(msg.merchant_id);
  const result =
    msg.kind === "template" && msg.template_name
      ? await provider.sendTemplate(to, msg.template_name, "fr", [], msg.body)
      : await provider.sendText(to, msg.body);

  run("UPDATE whatsapp_messages SET attempts = attempts + 1 WHERE id = ?", [messageId]);

  if (result.ok) {
    run("UPDATE whatsapp_messages SET status = 'sent', sent_at = ?, wa_message_id = ?, error_code = NULL, error_message = NULL WHERE id = ?", [
      nowIso(),
      result.waMessageId,
      messageId,
    ]);
    if (msg.order_id) run("UPDATE orders SET whatsapp_status = 'sent' WHERE id = ?", [msg.order_id]);
    run("UPDATE whatsapp_connections SET last_message_at = ? WHERE merchant_id = ?", [nowIso(), msg.merchant_id]);
    return { ok: true };
  }

  run("UPDATE whatsapp_messages SET error_code = ?, error_message = ? WHERE id = ?", [result.errorCode, result.errorMessage, messageId]);
  return { ok: false, error: result.errorMessage };
}

export function markMessageFailed(messageId: string, error: string) {
  const msg = get<{ merchant_id: string; order_id: string | null }>("SELECT merchant_id, order_id FROM whatsapp_messages WHERE id = ?", [messageId]);
  run("UPDATE whatsapp_messages SET status = 'failed', failed_at = ?, error_message = ? WHERE id = ?", [nowIso(), error.slice(0, 400), messageId]);
  if (!msg) return;
  if (msg.order_id) run("UPDATE orders SET whatsapp_status = 'failed', attention = 1 WHERE id = ?", [msg.order_id]);
  notify({
    merchantId: msg.merchant_id,
    type: "message_failed",
    severity: "error",
    title: "Message WhatsApp non envoyé",
    body: error.slice(0, 200),
    link: msg.order_id ? `/dashboard/orders?order=${msg.order_id}` : "/dashboard/whatsapp/logs",
  });
}

export function bumpUsage(merchantId: string, metric: "orders" | "messages" | "delivery_api_calls") {
  const period = new Date().toISOString().slice(0, 7);
  run(
    `INSERT INTO usage_records (id, merchant_id, period, metric, value, updated_at)
     VALUES (?,?,?,?,1,?)
     ON CONFLICT(merchant_id, period, metric) DO UPDATE SET value = value + 1, updated_at = excluded.updated_at`,
    [uid("usg"), merchantId, period, metric, nowIso()],
  );
}

/** Opt-out keyword detection on inbound messages (FR / AR / EN). */
const OPT_OUT_KEYWORDS = ["stop", "arret", "arrêt", "desabonner", "désabonner", "unsubscribe", "توقف", "الغاء", "إلغاء"];
export function isOptOutKeyword(text: string): boolean {
  const t = text.trim().toLowerCase();
  return OPT_OUT_KEYWORDS.some((k) => t === k || t.startsWith(`${k} `));
}

const YES_KEYWORDS = ["oui", "yes", "ok", "d'accord", "daccord", "confirmer", "1", "نعم", "موافق"];
const NO_KEYWORDS = ["non", "no", "annuler", "cancel", "2", "لا", "الغاء الطلب"];
export function classifyReply(text: string): "yes" | "no" | "other" {
  const t = text.trim().toLowerCase();
  if (YES_KEYWORDS.includes(t)) return "yes";
  if (NO_KEYWORDS.includes(t)) return "no";
  return "other";
}

export function recentSuppressions(merchantId: string, limit = 20) {
  return all(
    `SELECT ar.*, a.name AS automation_name FROM automation_runs ar
     LEFT JOIN automations a ON a.id = ar.automation_id
     WHERE ar.merchant_id = ? AND ar.result = 'suppressed'
     ORDER BY ar.created_at DESC LIMIT ?`,
    [merchantId, limit],
  );
}
