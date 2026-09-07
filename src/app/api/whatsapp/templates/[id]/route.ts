import { z } from "zod";
import { requirePermission, HttpError, clientIp } from "@/server/auth/session";
import { jsonError, ok, parseBody } from "@/server/http";
import { get, run, nowIso } from "@/server/db";
import { audit } from "@/server/services/audit";

const schema = z.object({
  body: z.string().min(5).max(1024).optional(),
  category: z.enum(["utility", "marketing", "authentication"]).optional(),
  eventKey: z.string().max(60).nullable().optional(),
  /** Merchants mirror the Meta review outcome here; the platform never fabricates it. */
  status: z.enum(["draft", "pending", "approved", "rejected", "paused"]).optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requirePermission("templates.write");
    const { id } = await params;
    const tpl = get("SELECT id FROM whatsapp_templates WHERE id = ? AND merchant_id = ?", [id, ctx.merchantId]);
    if (!tpl) throw new HttpError(404, "Template introuvable.", "not_found");
    const body = await parseBody(req, schema);
    const variables = body.body ? JSON.stringify(Array.from(body.body.matchAll(/\{\{\s*([\w\d_]+)\s*\}\}/g)).map((m) => m[1])) : null;
    run(
      `UPDATE whatsapp_templates SET body = COALESCE(?, body), category = COALESCE(?, category), event_key = ?,
        status = COALESCE(?, status), variables = COALESCE(?, variables), updated_at = ? WHERE id = ? AND merchant_id = ?`,
      [body.body ?? null, body.category ?? null, body.eventKey ?? null, body.status ?? null, variables, nowIso(), id, ctx.merchantId],
    );
    audit({ merchantId: ctx.merchantId, actorId: ctx.user.id, actorLabel: ctx.user.email, action: "template.updated", resource: "template", resourceId: id, ip: await clientIp() });
    return ok({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requirePermission("templates.write");
    const { id } = await params;
    run("DELETE FROM whatsapp_templates WHERE id = ? AND merchant_id = ?", [id, ctx.merchantId]);
    return ok({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
