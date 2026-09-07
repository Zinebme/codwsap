import { z } from "zod";
import { requirePermission, HttpError, clientIp } from "@/server/auth/session";
import { jsonError, ok, parseBody } from "@/server/http";
import { get, run } from "@/server/db";
import { audit } from "@/server/services/audit";

const schema = z.object({
  enabled: z.boolean().optional(),
  templateId: z.string().nullable().optional(),
  cooldownMinutes: z.number().int().min(0).max(10080).optional(),
  delayMinutes: z.number().int().min(0).max(10080).optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requirePermission("automations.write");
    const { id } = await params;
    const automation = await get("SELECT id FROM automations WHERE id = ? AND merchant_id = ?", [id, ctx.merchantId]);
    if (!automation) throw new HttpError(404, "Automatisation introuvable.", "not_found");
    const body = await parseBody(req, schema);
    if (body.templateId) {
      const tpl = await get("SELECT id FROM whatsapp_templates WHERE id = ? AND merchant_id = ?", [body.templateId, ctx.merchantId]);
      if (!tpl) throw new HttpError(400, "Template invalide.", "bad_request");
    }
    await run(
      `UPDATE automations SET enabled = COALESCE(?, enabled), template_id = ?, cooldown_minutes = COALESCE(?, cooldown_minutes),
        delay_minutes = COALESCE(?, delay_minutes) WHERE id = ? AND merchant_id = ?`,
      [body.enabled == null ? null : body.enabled ? 1 : 0, body.templateId ?? null, body.cooldownMinutes ?? null, body.delayMinutes ?? null, id, ctx.merchantId],
    );
    await audit({ merchantId: ctx.merchantId, actorId: ctx.user.id, actorLabel: ctx.user.email, action: "automation.modified", resource: "automation", resourceId: id, ip: await clientIp() });
    return ok({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
