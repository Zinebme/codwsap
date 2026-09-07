import crypto from "node:crypto";
import { z } from "zod";
import { get } from "@/server/db";
import { ok, recordWebhook, markWebhook, rateLimit } from "@/server/http";
import { decryptSecret, safeEqual } from "@/server/crypto";
import { createOrder } from "@/server/services/orders";
import { runWorker } from "@/server/jobs/worker";

export const dynamic = "force-dynamic";

const schema = z.object({
  external_id: z.string().max(80).optional(),
  customer_name: z.string().min(2).max(120),
  phone: z.string().min(6).max(30),
  wilaya: z.string().max(60).optional(),
  commune: z.string().max(80).optional(),
  address: z.string().max(300).optional(),
  delivery_type: z.enum(["home", "office"]).optional(),
  products_price: z.number().int().min(0).optional(),
  delivery_price: z.number().int().min(0).optional(),
  total: z.number().int().min(0).optional(),
  items: z.array(z.object({ product_name: z.string().max(160), variant: z.string().max(120).optional(), quantity: z.number().int().min(1), unit_price: z.number().int().min(0) })).max(30).optional(),
});

/** Public order-intake endpoint. Authenticated by the merchant's API key. */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token: merchantId } = await params;
  rateLimit(`order-webhook:${merchantId}`, 300, 60_000);

  const integ = get<{ id: string; credentials_encrypted: string | null }>(
    "SELECT id, credentials_encrypted FROM integrations WHERE merchant_id = ? AND kind = 'webhook' AND status = 'connected'",
    [merchantId],
  );
  if (!integ) return new Response("not found", { status: 404 });
  const creds = decryptSecret<{ api_key?: string }>(integ.credentials_encrypted);
  const provided = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "") || (req.headers.get("x-api-key") ?? "");
  if (!creds?.api_key || !provided || !safeEqual(provided, creds.api_key)) {
    return new Response("unauthorized", { status: 401 });
  }

  const raw = await req.text();
  const idem = crypto.createHash("sha256").update(`${merchantId}:${raw}`).digest("hex").slice(0, 40);
  const { duplicate, id: webhookId } = recordWebhook({ merchantId, source: "order_source", provider: "webhook", idempotencyKey: idem, signatureValid: true, payload: raw.slice(0, 4000) });
  if (duplicate) return ok({ ok: true, duplicate: true });

  try {
    const body = schema.parse(JSON.parse(raw));
    const productsPrice = body.products_price ?? body.items?.reduce((a, i) => a + i.quantity * i.unit_price, 0) ?? 0;
    const res = createOrder({
      merchantId,
      externalId: body.external_id ?? idem,
      source: "webhook",
      customerName: body.customer_name,
      phone: body.phone,
      wilaya: body.wilaya,
      commune: body.commune,
      address: body.address,
      deliveryType: body.delivery_type ?? "home",
      productsPrice,
      deliveryPrice: body.delivery_price ?? 0,
      total: body.total ?? productsPrice + (body.delivery_price ?? 0),
      items: body.items?.map((i) => ({ ...i, variant: i.variant ?? null })) ?? [],
    });
    markWebhook(webhookId, "processed");
    void runWorker(5);
    return ok({ ok: true, order_id: res.id, reference: res.reference, duplicate: res.duplicated }, { status: 201 });
  } catch (e) {
    markWebhook(webhookId, "failed", (e as Error).message);
    return ok({ error: "Charge utile invalide." }, { status: 422 });
  }
}
