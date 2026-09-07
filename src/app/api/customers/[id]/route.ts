import { z } from "zod";
import { requirePermission, HttpError } from "@/server/auth/session";
import { jsonError, ok, parseBody } from "@/server/http";
import { all, get, run, uid, nowIso } from "@/server/db";
import { getWhatsappProvider } from "@/server/connectors/whatsapp";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requirePermission("customers.read");
    const { id } = await params;
    const customer = await get("SELECT * FROM customers WHERE id = ? AND merchant_id = ?", [id, ctx.merchantId]);
    if (!customer) throw new HttpError(404, "Client introuvable.", "not_found");
    return ok({
      customer,
      orders: await all("SELECT id, reference, created_at, status, total, tracking_number FROM orders WHERE customer_id = ? AND merchant_id = ? ORDER BY created_at DESC LIMIT 50", [id, ctx.merchantId]),
      messages: await all("SELECT id, direction, body, status, created_at, template_name FROM whatsapp_messages WHERE customer_id = ? AND merchant_id = ? ORDER BY created_at DESC LIMIT 50", [id, ctx.merchantId]),
      consents: await all("SELECT * FROM customer_consents WHERE customer_id = ? AND merchant_id = ? ORDER BY created_at DESC LIMIT 20", [id, ctx.merchantId]),
    });
  } catch (e) {
    return jsonError(e);
  }
}

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("note"), notes: z.string().max(2000) }),
  z.object({ action: z.literal("opt_out") }),
  z.object({ action: z.literal("opt_in") }),
  z.object({ action: z.literal("recheck_wa") }),
]);

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requirePermission("customers.write");
    const { id } = await params;
    const customer = await get<{ id: string; normalized_phone: string }>("SELECT id, normalized_phone FROM customers WHERE id = ? AND merchant_id = ?", [id, ctx.merchantId]);
    if (!customer) throw new HttpError(404, "Client introuvable.", "not_found");
    const body = await parseBody(req, schema);

    if (body.action === "note") {
      await run("UPDATE customers SET notes = ?, updated_at = ? WHERE id = ?", [body.notes, nowIso(), id]);
      return ok({ ok: true });
    }
    if (body.action === "opt_out" || body.action === "opt_in") {
      const isOut = body.action === "opt_out";
      await run(
        `UPDATE customers SET opt_out_status = ?, opt_out_date = ?, opt_in_status = ?, opt_in_date = ?, opt_in_source = ?, updated_at = ? WHERE id = ?`,
        [isOut ? 1 : 0, isOut ? nowIso() : null, isOut ? "unknown" : "opted_in", isOut ? null : nowIso(), isOut ? null : "manual", nowIso(), id],
      );
      await run("INSERT INTO customer_consents (id, merchant_id, customer_id, channel, action, source) VALUES (?,?,?,'whatsapp',?,?)", [
        uid("cns"),
        ctx.merchantId,
        id,
        isOut ? "opt_out" : "opt_in",
        "manual",
      ]);
      return ok({ ok: true });
    }

    // Manual WhatsApp availability recheck via the official provider only.
    const { provider, connected } = await getWhatsappProvider(ctx.merchantId);
    const res = await provider.checkAvailability(customer.normalized_phone);
    await run("UPDATE customers SET whatsapp_status = ?, whatsapp_checked_at = ?, whatsapp_check_source = ?, updated_at = ? WHERE id = ?", [
      res.status,
      nowIso(),
      res.source,
      nowIso(),
      id,
    ]);
    return ok({ ok: true, status: res.status, detail: res.detail, connected });
  } catch (e) {
    return jsonError(e);
  }
}
