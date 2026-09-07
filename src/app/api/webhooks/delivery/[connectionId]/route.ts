import crypto from "node:crypto";
import { get } from "@/server/db";
import { ok, recordWebhook, markWebhook, rateLimit } from "@/server/http";
import { decryptSecret, safeEqual } from "@/server/crypto";
import { connectorForConnection } from "@/server/connectors/delivery";
import { applyDeliveryEvent } from "@/server/services/delivery";
import type { DeliveryStatus } from "@/lib/domain";

export const dynamic = "force-dynamic";

/**
 * Generic delivery webhook endpoint, scoped per connection.
 * Signature is validated with the connection's stored webhook secret when the
 * provider supports it.
 */
export async function POST(req: Request, { params }: { params: Promise<{ connectionId: string }> }) {
  const { connectionId } = await params;
  rateLimit(`dlv-webhook:${connectionId}`, 600, 60_000);

  const conn = await get<{ id: string; merchant_id: string; provider: string; credentials_encrypted: string | null }>(
    "SELECT id, merchant_id, provider, credentials_encrypted FROM delivery_connections WHERE id = ?",
    [connectionId],
  );
  if (!conn) return new Response("not found", { status: 404 });

  const raw = await req.text();
  const secret = decryptSecret<{ webhook_secret?: string }>(conn.credentials_encrypted)?.webhook_secret;
  let signatureValid: boolean | null = null;
  if (secret) {
    const provided = req.headers.get("x-signature") ?? req.headers.get("x-webhook-signature") ?? "";
    const expected = crypto.createHmac("sha256", secret).update(raw).digest("hex");
    signatureValid = safeEqual(provided.replace(/^sha256=/, ""), expected);
    if (!signatureValid) return new Response("invalid signature", { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return new Response("bad request", { status: 400 });
  }

  const idem = crypto.createHash("sha256").update(`${connectionId}:${raw}`).digest("hex").slice(0, 40);
  const { duplicate, id: webhookId } = await recordWebhook({
    merchantId: conn.merchant_id,
    source: "delivery",
    provider: conn.provider,
    idempotencyKey: idem,
    signatureValid,
    payload,
  });
  if (duplicate) return ok({ ok: true, duplicate: true });

  try {
    const connector = await connectorForConnection(conn.id, conn.merchant_id);
    const events = connector?.parseWebhook?.(payload) ?? genericParse(payload, connector?.normalizeStatus);
    let applied = 0;
    for (const ev of events) {
      const order = await get<{ id: string }>("SELECT id FROM orders WHERE merchant_id = ? AND tracking_number = ?", [conn.merchant_id, ev.trackingNumber]);
      if (!order) continue;
      const res = await applyDeliveryEvent({
        merchantId: conn.merchant_id,
        orderId: order.id,
        provider: conn.provider,
        rawStatus: ev.rawStatus,
        normalizedStatus: ev.normalizedStatus,
        occurredAt: ev.occurredAt,
        idempotencyKey: `${ev.trackingNumber}:${ev.rawStatus}:${(ev.occurredAt ?? "").slice(0, 16)}`,
        raw: payload,
      });
      if (res.applied) applied++;
    }
    await markWebhook(webhookId, "processed");
    return ok({ ok: true, applied });
  } catch (e) {
    await markWebhook(webhookId, "failed", (e as Error).message);
    return ok({ ok: true });
  }
}

function genericParse(payload: unknown, normalize?: (raw: string) => DeliveryStatus) {
  const b = payload as { tracking?: string; tracking_number?: string; status?: string; date?: string };
  const tracking = b?.tracking ?? b?.tracking_number;
  if (!tracking || !b.status || !normalize) return [];
  return [{ trackingNumber: String(tracking), rawStatus: String(b.status), normalizedStatus: normalize(String(b.status)), occurredAt: b.date }];
}
