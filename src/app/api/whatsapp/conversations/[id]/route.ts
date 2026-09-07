import { z } from "zod";
import { requirePermission, HttpError } from "@/server/auth/session";
import { jsonError, ok, parseBody } from "@/server/http";
import { all, get, run, nowIso } from "@/server/db";
import { queueMessage, serviceWindowOpen } from "@/server/services/messaging";
import { runWorker } from "@/server/jobs/worker";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requirePermission("conversations.read");
    const { id } = await params;
    const conv = await get<{ id: string; customer_id: string | null; order_id: string | null; normalized_phone: string }>(
      "SELECT * FROM whatsapp_conversations WHERE id = ? AND merchant_id = ?",
      [id, ctx.merchantId],
    );
    if (!conv) throw new HttpError(404, "Conversation introuvable.", "not_found");
    await run("UPDATE whatsapp_conversations SET unread_count = 0 WHERE id = ?", [id]);
    return ok({
      conversation: conv,
      customer: conv.customer_id ? await get("SELECT * FROM customers WHERE id = ? AND merchant_id = ?", [conv.customer_id, ctx.merchantId]) : null,
      windowOpen: await serviceWindowOpen(id),
      messages: await all("SELECT * FROM whatsapp_messages WHERE conversation_id = ? AND merchant_id = ? ORDER BY created_at ASC LIMIT 300", [id, ctx.merchantId]),
    });
  } catch (e) {
    return jsonError(e);
  }
}

const schema = z.object({ text: z.string().min(1).max(1000).optional(), templateId: z.string().optional() });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requirePermission("conversations.write");
    const { id } = await params;
    const conv = await get<{ id: string; customer_id: string | null; order_id: string | null; normalized_phone: string }>(
      "SELECT * FROM whatsapp_conversations WHERE id = ? AND merchant_id = ?",
      [id, ctx.merchantId],
    );
    if (!conv) throw new HttpError(404, "Conversation introuvable.", "not_found");
    const body = await parseBody(req, schema);
    const windowOpen = await serviceWindowOpen(id);

    if (body.text && !windowOpen) {
      throw new HttpError(
        400,
        "La fenêtre de service de 24 h est fermée. Utilisez un template approuvé pour recontacter ce client.",
        "window_closed",
      );
    }
    const outcome = await queueMessage({
      merchantId: ctx.merchantId,
      orderId: conv.order_id,
      customerId: conv.customer_id,
      toPhone: conv.normalized_phone,
      text: body.text,
      templateId: body.templateId ?? null,
      eventKey: "manual",
      bypassGuards: !!body.text && windowOpen,
    });
    await run("UPDATE whatsapp_conversations SET last_message_at = ? WHERE id = ?", [nowIso(), id]);
    void runWorker(3);
    return ok(outcome);
  } catch (e) {
    return jsonError(e);
  }
}
