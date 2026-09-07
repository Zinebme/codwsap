import { z } from "zod";
import { requirePermission, requireTenant, clientIp } from "@/server/auth/session";
import { jsonError, ok, parseBody } from "@/server/http";
import { all, run, uid, nowIso } from "@/server/db";
import { audit } from "@/server/services/audit";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const ctx = await requireTenant();
    return ok({ rows: await all("SELECT * FROM whatsapp_templates WHERE merchant_id = ? ORDER BY updated_at DESC", [ctx.merchantId]) });
  } catch (e) {
    return jsonError(e);
  }
}

const schema = z.object({
  name: z.string().min(2).max(60).regex(/^[a-z0-9_]+$/, "Utilisez uniquement des minuscules, chiffres et underscores."),
  category: z.enum(["utility", "marketing", "authentication"]),
  language: z.enum(["fr", "ar", "en"]),
  body: z.string().min(5).max(1024),
  eventKey: z.string().max(60).nullable().optional(),
  buttons: z.array(z.string().max(24)).max(3).optional(),
});

export async function POST(req: Request) {
  try {
    const ctx = await requirePermission("templates.write");
    const body = await parseBody(req, schema);
    const id = uid("tpl");
    const variables = Array.from(body.body.matchAll(/\{\{\s*([\w\d_]+)\s*\}\}/g)).map((m) => m[1]);
    await run(
      `INSERT INTO whatsapp_templates (id, merchant_id, name, category, language, status, body, variables, buttons, event_key)
       VALUES (?,?,?,?,?, 'draft', ?, ?, ?, ?)`,
      [id, ctx.merchantId, body.name, body.category, body.language, body.body, JSON.stringify(variables), JSON.stringify(body.buttons ?? []), body.eventKey ?? null],
    );
    await audit({ merchantId: ctx.merchantId, actorId: ctx.user.id, actorLabel: ctx.user.email, action: "template.created", resource: "template", resourceId: id, ip: await clientIp() });
    return ok({ ok: true, id, updatedAt: nowIso() }, { status: 201 });
  } catch (e) {
    return jsonError(e);
  }
}
