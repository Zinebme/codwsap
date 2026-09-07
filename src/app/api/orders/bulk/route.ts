import { z } from "zod";
import { requirePermission, clientIp, HttpError } from "@/server/auth/session";
import { jsonError, ok, parseBody } from "@/server/http";
import { run, nowIso, all } from "@/server/db";
import { addOrderEvent } from "@/server/services/automations";
import { audit } from "@/server/services/audit";
import { sendOrderToProvider } from "@/server/services/delivery";
import { ORDER_STATUSES } from "@/lib/domain";

const schema = z.object({
  ids: z.array(z.string()).min(1).max(200),
  action: z.enum(["set_status", "assign", "send_to_delivery"]),
  status: z.enum(ORDER_STATUSES).optional(),
  userId: z.string().nullable().optional(),
});

export async function POST(req: Request) {
  try {
    const ctx = await requirePermission("orders.write");
    const body = await parseBody(req, schema);

    // Tenant guard: only operate on ids that belong to this merchant.
    const owned = all<{ id: string }>(
      `SELECT id FROM orders WHERE merchant_id = ? AND id IN (${body.ids.map(() => "?").join(",")})`,
      [ctx.merchantId, ...body.ids],
    ).map((r) => r.id);
    if (!owned.length) throw new HttpError(404, "Aucune commande valide sélectionnée.", "not_found");

    let updated = 0;
    const errors: string[] = [];

    if (body.action === "set_status") {
      if (!body.status) throw new HttpError(400, "Statut manquant.", "bad_request");
      for (const id of owned) {
        run("UPDATE orders SET status = ?, updated_at = ? WHERE id = ? AND merchant_id = ?", [body.status, nowIso(), id, ctx.merchantId]);
        addOrderEvent(ctx.merchantId, id, "status_change", `Statut : ${body.status} (action groupée)`, undefined, { id: ctx.user.id, label: ctx.user.full_name });
        updated++;
      }
    } else if (body.action === "assign") {
      for (const id of owned) {
        run("UPDATE orders SET assigned_user_id = ?, updated_at = ? WHERE id = ? AND merchant_id = ?", [body.userId ?? null, nowIso(), id, ctx.merchantId]);
        updated++;
      }
    } else {
      if (!ctx.can("delivery.write")) throw new HttpError(403, "Votre rôle ne permet pas cette action.", "forbidden");
      for (const id of owned.slice(0, 50)) {
        const res = await sendOrderToProvider(ctx.merchantId, id);
        if (res.ok) updated++;
        else if (errors.length < 5) errors.push(res.error);
      }
    }

    audit({ merchantId: ctx.merchantId, actorId: ctx.user.id, actorLabel: ctx.user.email, action: `order.bulk_${body.action}`, resource: "order", ip: await clientIp(), metadata: { count: updated } });
    return ok({ ok: true, updated, errors });
  } catch (e) {
    return jsonError(e);
  }
}
