import { z } from "zod";
import { requireTenant, requirePermission, clientIp } from "@/server/auth/session";
import { jsonError, ok, parseBody } from "@/server/http";
import { all, get, run, nowIso } from "@/server/db";
import { audit } from "@/server/services/audit";
import { NOTIFICATION_LABELS } from "@/server/services/notifications";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const ctx = await requireTenant();
    const merchant = await get("SELECT * FROM merchants WHERE id = ?", [ctx.merchantId]);
    const users = await all(
      `SELECT mu.id, mu.role, mu.status, u.id AS user_id, u.full_name, u.email, u.last_login_at
       FROM merchant_users mu JOIN users u ON u.id = mu.user_id WHERE mu.merchant_id = ? ORDER BY mu.created_at`,
      [ctx.merchantId],
    );
    const prefs = await all("SELECT * FROM notification_preferences WHERE merchant_id = ?", [ctx.merchantId]);
    const subscription = await get("SELECT * FROM subscriptions WHERE merchant_id = ? ORDER BY created_at DESC LIMIT 1", [ctx.merchantId]);
    const usage = await all("SELECT metric, value FROM usage_records WHERE merchant_id = ? AND period = ?", [ctx.merchantId, new Date().toISOString().slice(0, 7)]);
    const plan = await get("SELECT * FROM plans WHERE code = ?", [(merchant as { plan_code: string }).plan_code]);
    const audits = ctx.can("settings.write")
      ? await all("SELECT * FROM audit_logs WHERE merchant_id = ? ORDER BY created_at DESC LIMIT 40", [ctx.merchantId])
      : [];
    return ok({
      merchant,
      users,
      prefs,
      subscription,
      usage,
      plan,
      audits,
      role: ctx.role,
      notificationTypes: Object.entries(NOTIFICATION_LABELS).map(([id, label]) => ({ id, label })),
    });
  } catch (e) {
    return jsonError(e);
  }
}

const schema = z.discriminatedUnion("section", [
  z.object({
    section: z.literal("business"),
    name: z.string().min(2).max(80),
    phone: z.string().max(30).optional(),
    email: z.string().email().optional(),
    wilaya: z.string().max(60).optional(),
    address: z.string().max(200).optional(),
    locale: z.enum(["fr", "ar"]).optional(),
  }),
  z.object({
    section: z.literal("notifications"),
    prefs: z.array(z.object({ event_type: z.string().max(60), dashboard: z.boolean(), telegram: z.boolean(), email: z.boolean() })).max(40),
  }),
]);

export async function PATCH(req: Request) {
  try {
    const ctx = await requirePermission("settings.write");
    const body = await parseBody(req, schema);
    if (body.section === "business") {
      await run("UPDATE merchants SET name = ?, phone = ?, email = ?, wilaya = ?, address = ?, locale = COALESCE(?, locale), updated_at = ? WHERE id = ?", [
        body.name,
        body.phone ?? null,
        body.email ?? null,
        body.wilaya ?? null,
        body.address ?? null,
        body.locale ?? null,
        nowIso(),
        ctx.merchantId,
      ]);
    } else {
      const { uid } = await import("@/server/db");
      for (const p of body.prefs) {
        await run(
          `INSERT INTO notification_preferences (id, merchant_id, event_type, dashboard, telegram, email) VALUES (?,?,?,?,?,?)
           ON CONFLICT(merchant_id, event_type) DO UPDATE SET dashboard = excluded.dashboard, telegram = excluded.telegram, email = excluded.email`,
          [uid("npf"), ctx.merchantId, p.event_type, p.dashboard ? 1 : 0, p.telegram ? 1 : 0, p.email ? 1 : 0],
        );
      }
    }
    await audit({ merchantId: ctx.merchantId, actorId: ctx.user.id, actorLabel: ctx.user.email, action: `settings.${body.section}_updated`, ip: await clientIp() });
    return ok({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
