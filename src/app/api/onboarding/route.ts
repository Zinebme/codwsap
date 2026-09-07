import { z } from "zod";
import { requireTenant, requirePermission } from "@/server/auth/session";
import { jsonError, ok, parseBody } from "@/server/http";
import { get, run, nowIso } from "@/server/db";
import { createOrder } from "@/server/services/orders";
import { runWorker } from "@/server/jobs/worker";
import { audit } from "@/server/services/audit";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const ctx = await requireTenant();
    const merchant = await get<{ onboarding_step: number; onboarding_completed_at: string | null; name: string; phone: string | null; wilaya: string | null; address: string | null }>(
      "SELECT onboarding_step, onboarding_completed_at, name, phone, wilaya, address FROM merchants WHERE id = ?",
      [ctx.merchantId],
    );
    const whatsapp = await get<{ status: string }>("SELECT status FROM whatsapp_connections WHERE merchant_id = ?", [ctx.merchantId]);
    const delivery = await get<{ c: number }>("SELECT COUNT(*) AS c FROM delivery_connections WHERE merchant_id = ?", [ctx.merchantId]);
    const source = await get<{ c: number }>("SELECT COUNT(*) AS c FROM integrations WHERE merchant_id = ? AND kind IN ('google_sheets','webhook')", [ctx.merchantId]);
    const orders = await get<{ c: number }>("SELECT COUNT(*) AS c FROM orders WHERE merchant_id = ?", [ctx.merchantId]);
    const templates = await get<{ c: number }>("SELECT COUNT(*) AS c FROM whatsapp_templates WHERE merchant_id = ? AND status = 'approved'", [ctx.merchantId]);
    return ok({
      merchant,
      progress: {
        business: !!merchant?.wilaya,
        source: (source?.c ?? 0) > 0 || (orders?.c ?? 0) > 0,
        whatsapp: whatsapp?.status === "connected",
        delivery: (delivery?.c ?? 0) > 0,
        templates: (templates?.c ?? 0) > 0,
        testOrder: (orders?.c ?? 0) > 0,
        completed: !!merchant?.onboarding_completed_at,
      },
    });
  } catch (e) {
    return jsonError(e);
  }
}

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("step"), step: z.number().int().min(1).max(8) }),
  z.object({ action: z.literal("business"), name: z.string().min(2).max(80), phone: z.string().max(30), wilaya: z.string().max(60), address: z.string().max(200).optional() }),
  z.object({ action: z.literal("test_order") }),
  z.object({ action: z.literal("complete") }),
]);

export async function POST(req: Request) {
  try {
    const ctx = await requirePermission("settings.write");
    const body = await parseBody(req, schema);
    switch (body.action) {
      case "step":
        await run("UPDATE merchants SET onboarding_step = ?, updated_at = ? WHERE id = ?", [body.step, nowIso(), ctx.merchantId]);
        return ok({ ok: true });
      case "business":
        await run("UPDATE merchants SET name = ?, phone = ?, wilaya = ?, address = ?, onboarding_step = 2, updated_at = ? WHERE id = ?", [
          body.name,
          body.phone,
          body.wilaya,
          body.address ?? null,
          nowIso(),
          ctx.merchantId,
        ]);
        return ok({ ok: true });
      case "test_order": {
        const res = await createOrder({
          merchantId: ctx.merchantId,
          customerName: "Client de test",
          phone: "0550000000",
          wilaya: "Alger",
          commune: "Bab Ezzouar",
          address: "Adresse de démonstration",
          deliveryType: "home",
          productsPrice: 4500,
          deliveryPrice: 500,
          items: [{ product_name: "Produit de démonstration", variant: "Taille M", quantity: 1, unit_price: 4500 }],
          isTest: true,
          source: "manual",
          notes: "Commande de test créée pendant l'onboarding.",
        });
        void runWorker(5);
        return ok({ ok: true, ...res });
      }
      case "complete":
        await run("UPDATE merchants SET onboarding_completed_at = ?, onboarding_step = 8, status = CASE WHEN status = 'trial' THEN 'trial' ELSE status END, updated_at = ? WHERE id = ?", [
          nowIso(),
          nowIso(),
          ctx.merchantId,
        ]);
        await audit({ merchantId: ctx.merchantId, actorId: ctx.user.id, actorLabel: ctx.user.email, action: "merchant.onboarding_completed" });
        return ok({ ok: true });
    }
  } catch (e) {
    return jsonError(e);
  }
}
