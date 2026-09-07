import crypto from "node:crypto";
import { get, run, uid, nowIso } from "@/server/db";
import { ok, recordWebhook, markWebhook, rateLimit } from "@/server/http";
import { ensureConversation, isOptOutKeyword, classifyReply } from "@/server/services/messaging";
import { onCustomerReply } from "@/server/services/automations";
import { notify } from "@/server/services/notifications";
import { upsertCustomer } from "@/server/services/orders";
import { decryptSecret } from "@/server/crypto";

export const dynamic = "force-dynamic";

/** Meta webhook verification handshake. */
export async function GET(req: Request, { params }: { params: Promise<{ merchantId: string }> }) {
  const { merchantId } = await params;
  const p = new URL(req.url).searchParams;
  const conn = get<{ webhook_verify_token: string | null }>("SELECT webhook_verify_token FROM whatsapp_connections WHERE merchant_id = ?", [merchantId]);
  if (p.get("hub.mode") === "subscribe" && conn?.webhook_verify_token && p.get("hub.verify_token") === conn.webhook_verify_token) {
    return new Response(p.get("hub.challenge") ?? "", { status: 200 });
  }
  return new Response("forbidden", { status: 403 });
}

type WaChange = {
  value?: {
    messages?: { id: string; from: string; timestamp?: string; type?: string; text?: { body?: string }; button?: { text?: string }; interactive?: { button_reply?: { title?: string } } }[];
    statuses?: { id: string; status?: string; timestamp?: string; errors?: { code?: number; title?: string; message?: string }[] }[];
    contacts?: { profile?: { name?: string }; wa_id?: string }[];
  };
};

export async function POST(req: Request, { params }: { params: Promise<{ merchantId: string }> }) {
  const { merchantId } = await params;
  rateLimit(`wa-webhook:${merchantId}`, 600, 60_000);

  const raw = await req.text();
  const conn = get<{ id: string; credentials_encrypted: string | null; webhook_secret: string | null }>(
    "SELECT id, credentials_encrypted, webhook_secret FROM whatsapp_connections WHERE merchant_id = ?",
    [merchantId],
  );
  if (!conn) return ok({ ok: true }); // never leak tenant existence

  // Signature validation (Meta X-Hub-Signature-256 with the app secret).
  const appSecret = decryptSecret<{ app_secret?: string }>(conn.credentials_encrypted)?.app_secret ?? process.env.META_APP_SECRET;
  let signatureValid: boolean | null = null;
  if (appSecret) {
    const header = req.headers.get("x-hub-signature-256") ?? "";
    const expected = `sha256=${crypto.createHmac("sha256", appSecret).update(raw).digest("hex")}`;
    signatureValid = header.length === expected.length && crypto.timingSafeEqual(Buffer.from(header), Buffer.from(expected));
    if (!signatureValid) {
      recordWebhook({ merchantId, source: "whatsapp", provider: "meta_cloud", idempotencyKey: `invalid:${crypto.randomUUID()}`, signatureValid: false, payload: { reason: "bad signature" } });
      return new Response("invalid signature", { status: 401 });
    }
  }

  let payload: { entry?: { id?: string; changes?: WaChange[] }[] };
  try {
    payload = JSON.parse(raw);
  } catch {
    return ok({ ok: true });
  }

  const idem = crypto.createHash("sha256").update(raw).digest("hex").slice(0, 40);
  const { duplicate, id: webhookId } = recordWebhook({ merchantId, source: "whatsapp", provider: "meta_cloud", idempotencyKey: idem, signatureValid, payload });
  if (duplicate) return ok({ ok: true, duplicate: true });

  try {
    run("UPDATE whatsapp_connections SET last_webhook_at = ?, status = 'connected' WHERE id = ?", [nowIso(), conn.id]);

    for (const entry of payload.entry ?? []) {
      for (const change of entry.changes ?? []) {
        // Inbound customer messages
        for (const [index, msg] of (change.value?.messages ?? []).entries()) {
          const phone = msg.from.startsWith("+") ? msg.from : `+${msg.from}`;
          const profileName = change.value?.contacts?.[index]?.profile?.name ?? "";
          const customerId = upsertCustomer(merchantId, profileName, phone);
          // Inbound proves the number is on WhatsApp — an official signal.
          run("UPDATE customers SET whatsapp_status = 'available', whatsapp_checked_at = ?, whatsapp_check_source = 'inbound_message', last_interaction_at = ? WHERE id = ?", [
            nowIso(),
            nowIso(),
            customerId,
          ]);

          const order = get<{ id: string }>(
            "SELECT id FROM orders WHERE merchant_id = ? AND customer_id = ? ORDER BY created_at DESC LIMIT 1",
            [merchantId, customerId],
          );
          const conversationId = ensureConversation(merchantId, phone, customerId, order?.id);
          const text = msg.text?.body ?? msg.button?.text ?? msg.interactive?.button_reply?.title ?? "";

          run(
            `INSERT INTO whatsapp_messages (id, merchant_id, conversation_id, order_id, customer_id, direction, kind, body, status, wa_message_id)
             VALUES (?,?,?,?,?, 'inbound', ?, ?, 'received', ?)`,
            [uid("msg"), merchantId, conversationId, order?.id ?? null, customerId, msg.button || msg.interactive ? "button_reply" : "text", text, msg.id],
          );
          run("UPDATE whatsapp_conversations SET last_message_at = ?, last_inbound_at = ?, last_message_preview = ?, unread_count = unread_count + 1 WHERE id = ?", [
            nowIso(),
            nowIso(),
            text.slice(0, 140),
            conversationId,
          ]);
          if (order?.id) run("UPDATE orders SET last_reply_at = ?, whatsapp_status = 'replied' WHERE id = ?", [nowIso(), order.id]);

          if (isOptOutKeyword(text)) {
            run("UPDATE customers SET opt_out_status = 1, opt_out_date = ? WHERE id = ?", [nowIso(), customerId]);
            run("INSERT INTO customer_consents (id, merchant_id, customer_id, channel, action, source) VALUES (?,?,?, 'whatsapp', 'opt_out', 'keyword')", [uid("cns"), merchantId, customerId]);
          } else {
            onCustomerReply(order?.id ?? null, merchantId, classifyReply(text));
          }

          notify({
            merchantId,
            type: "customer_reply",
            severity: "info",
            title: `Réponse de ${profileName || phone}`,
            body: text.slice(0, 140),
            link: `/dashboard/whatsapp/conversations?c=${conversationId}`,
          });
        }

        // Delivery / read receipts and failures
        for (const st of change.value?.statuses ?? []) {
          const status = st.status === "read" ? "read" : st.status === "delivered" ? "delivered" : st.status === "sent" ? "sent" : st.status === "failed" ? "failed" : null;
          if (!status) continue;
          const column = status === "read" ? "read_at" : status === "delivered" ? "delivered_at" : status === "failed" ? "failed_at" : "sent_at";
          run(
            `UPDATE whatsapp_messages SET status = ?, ${column} = ?, error_message = COALESCE(?, error_message) WHERE merchant_id = ? AND wa_message_id = ?`,
            [status, nowIso(), st.errors?.[0]?.message ?? null, merchantId, st.id],
          );
          const msg = get<{ id: string; order_id: string | null }>("SELECT id, order_id FROM whatsapp_messages WHERE merchant_id = ? AND wa_message_id = ?", [merchantId, st.id]);
          if (msg?.order_id) run("UPDATE orders SET whatsapp_status = ? WHERE id = ?", [status, msg.order_id]);
          if (status === "failed") {
            notify({
              merchantId,
              type: "message_failed",
              severity: "error",
              title: "Message WhatsApp refusé",
              body: st.errors?.[0]?.title ?? "Le message n'a pas pu être délivré.",
              link: "/dashboard/whatsapp/logs",
            });
          }
        }
      }
    }
    markWebhook(webhookId, "processed");
    return ok({ ok: true });
  } catch (e) {
    markWebhook(webhookId, "failed", (e as Error).message);
    notify({ merchantId, type: "webhook_error", severity: "error", title: "Erreur de traitement webhook WhatsApp", link: "/dashboard/integrations" });
    return ok({ ok: true });
  }
}
