import { z } from "zod";
import { requirePermission, clientIp, HttpError } from "@/server/auth/session";
import { jsonError, ok, parseBody } from "@/server/http";
import { orderDetail, recomputeCustomerStats } from "@/server/services/orders";
import { get, run, nowIso } from "@/server/db";
import { addOrderEvent } from "@/server/services/automations";
import { audit } from "@/server/services/audit";
import { queueMessage } from "@/server/services/messaging";
import { sendOrderToProvider, refreshTracking } from "@/server/services/delivery";
import { runWorker } from "@/server/jobs/worker";
import { ORDER_STATUSES } from "@/lib/domain";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requirePermission("orders.read");
    const { id } = await params;
    const detail = await orderDetail(ctx.merchantId, id);
    if (!detail) throw new HttpError(404, "Commande introuvable.", "not_found");
    return ok(detail);
  } catch (e) {
    return jsonError(e);
  }
}

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("set_status"), status: z.enum(ORDER_STATUSES) }),
  z.object({ action: z.literal("note"), note: z.string().min(1).max(1000) }),
  z.object({ action: z.literal("assign"), userId: z.string().nullable() }),
  z.object({ action: z.literal("postpone"), until: z.string().min(8).max(20) }),
  z.object({ action: z.literal("send_message"), text: z.string().max(1000).optional(), templateId: z.string().optional() }),
  z.object({ action: z.literal("resend_message"), messageId: z.string() }),
  z.object({ action: z.literal("send_to_delivery"), connectionId: z.string().optional() }),
  z.object({ action: z.literal("refresh_tracking") }),
  z.object({ action: z.literal("update"), notes: z.string().max(1000).optional(), address: z.string().max(300).optional(), commune: z.string().max(80).optional() }),
]);

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requirePermission("orders.write");
    const { id } = await params;
    const order = await get<{
      id: string;
      customer_id: string | null;
      normalized_phone: string | null;
      reference: string;
      status: string;
      is_test: number;
      customer_name: string | null;
    }>("SELECT * FROM orders WHERE id = ? AND merchant_id = ?", [id, ctx.merchantId]);
    if (!order) throw new HttpError(404, "Commande introuvable.", "not_found");

    const body = await parseBody(req, actionSchema);
    const actor = { id: ctx.user.id, label: ctx.user.full_name };
    const ip = await clientIp();

    switch (body.action) {
      case "set_status": {
        await run("UPDATE orders SET status = ?, updated_at = ?, attention = CASE WHEN ? IN ('delivered','confirmed') THEN 0 ELSE attention END WHERE id = ?", [
          body.status,
          nowIso(),
          body.status,
          id,
        ]);
        if (body.status === "confirmed") await run("UPDATE orders SET confirmed_at = ? WHERE id = ?", [nowIso(), id]);
        await addOrderEvent(ctx.merchantId, id, "status_change", `Statut : ${body.status}`, undefined, actor);
        if (order.customer_id) await recomputeCustomerStats(order.customer_id);
        await audit({ merchantId: ctx.merchantId, actorId: ctx.user.id, actorLabel: ctx.user.email, action: "order.status_changed", resource: "order", resourceId: id, ip, metadata: { status: body.status } });
        return ok({ ok: true });
      }
      case "note": {
        await run("UPDATE orders SET notes = ?, updated_at = ? WHERE id = ?", [body.note, nowIso(), id]);
        await addOrderEvent(ctx.merchantId, id, "note", "Note interne ajoutée", body.note, actor);
        return ok({ ok: true });
      }
      case "assign": {
        if (body.userId) {
          const member = await get("SELECT id FROM merchant_users WHERE merchant_id = ? AND user_id = ? AND status = 'active'", [ctx.merchantId, body.userId]);
          if (!member) throw new HttpError(400, "Cet utilisateur ne fait pas partie de votre équipe.", "bad_request");
        }
        await run("UPDATE orders SET assigned_user_id = ?, updated_at = ? WHERE id = ?", [body.userId, nowIso(), id]);
        await addOrderEvent(ctx.merchantId, id, "manual_action", body.userId ? "Agent assigné" : "Agent retiré", undefined, actor);
        return ok({ ok: true });
      }
      case "postpone": {
        await run("UPDATE orders SET status = 'postponed', postponed_until = ?, updated_at = ? WHERE id = ?", [body.until, nowIso(), id]);
        await addOrderEvent(ctx.merchantId, id, "status_change", `Commande reportée au ${body.until}`, undefined, actor);
        return ok({ ok: true });
      }
      case "send_message": {
        if (!order.normalized_phone) throw new HttpError(400, "Cette commande n'a pas de numéro valide.", "bad_request");
        const outcome = await queueMessage({
          merchantId: ctx.merchantId,
          orderId: id,
          customerId: order.customer_id,
          toPhone: order.normalized_phone,
          templateId: body.templateId ?? null,
          text: body.text,
          eventKey: "manual",
          bypassGuards: !!body.text, // agent reply inside service window
          isTest: !!order.is_test,
          variables: { "1": order.customer_name ?? "client", "2": order.reference },
        });
        await addOrderEvent(ctx.merchantId, id, "message", outcome.status === "suppressed" ? "Message bloqué par les règles qualité" : "Message WhatsApp envoyé", outcome.reason, actor);
        void runWorker(3);
        return ok(outcome);
      }
      case "resend_message": {
        const msg = await get<{ id: string; status: string }>("SELECT id, status FROM whatsapp_messages WHERE id = ? AND merchant_id = ? AND order_id = ?", [body.messageId, ctx.merchantId, id]);
        if (!msg) throw new HttpError(404, "Message introuvable.", "not_found");
        await run("UPDATE whatsapp_messages SET status = 'queued', error_message = NULL, error_code = NULL, dedupe_key = NULL WHERE id = ?", [msg.id]);
        const { enqueueJob } = await import("@/server/jobs/queue");
        await enqueueJob({ merchantId: ctx.merchantId, type: "send_whatsapp", payload: { messageId: msg.id } });
        void runWorker(3);
        return ok({ ok: true });
      }
      case "send_to_delivery": {
        if (!ctx.can("delivery.write")) throw new HttpError(403, "Votre rôle ne permet pas d'envoyer au transporteur.", "forbidden");
        const res = await sendOrderToProvider(ctx.merchantId, id, body.connectionId);
        if (!res.ok) throw new HttpError(400, res.error, "delivery_error");
        await audit({ merchantId: ctx.merchantId, actorId: ctx.user.id, actorLabel: ctx.user.email, action: "order.sent_to_delivery", resource: "order", resourceId: id, ip });
        return ok(res);
      }
      case "refresh_tracking": {
        const res = await refreshTracking(ctx.merchantId, id);
        if (!res.ok) throw new HttpError(400, res.error, "delivery_error");
        return ok(res);
      }
      case "update": {
        await run("UPDATE orders SET notes = COALESCE(?, notes), address = COALESCE(?, address), commune = COALESCE(?, commune), updated_at = ? WHERE id = ?", [
          body.notes ?? null,
          body.address ?? null,
          body.commune ?? null,
          nowIso(),
          id,
        ]);
        await addOrderEvent(ctx.merchantId, id, "manual_action", "Commande modifiée", undefined, actor);
        await audit({ merchantId: ctx.merchantId, actorId: ctx.user.id, actorLabel: ctx.user.email, action: "order.edited", resource: "order", resourceId: id, ip });
        return ok({ ok: true });
      }
    }
  } catch (e) {
    return jsonError(e);
  }
}
