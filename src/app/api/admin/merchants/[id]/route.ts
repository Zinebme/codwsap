import { z } from "zod";
import { requireSuperAdmin, clientIp, HttpError } from "@/server/auth/session";
import { jsonError, ok, parseBody } from "@/server/http";
import { all, get, run, uid, nowIso } from "@/server/db";
import { audit } from "@/server/services/audit";
import { notify } from "@/server/services/notifications";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireSuperAdmin();
    const { id } = await params;
    const merchant = get("SELECT * FROM merchants WHERE id = ?", [id]);
    if (!merchant) throw new HttpError(404, "Marchand introuvable.", "not_found");
    return ok({
      merchant,
      users: all(
        `SELECT mu.role, mu.status, u.full_name, u.email, u.last_login_at FROM merchant_users mu JOIN users u ON u.id = mu.user_id WHERE mu.merchant_id = ?`,
        [id],
      ),
      integrations: all("SELECT kind, status, last_sync_at, last_error FROM integrations WHERE merchant_id = ?", [id]),
      delivery: all("SELECT provider, label, status, last_sync_at, last_error FROM delivery_connections WHERE merchant_id = ?", [id]),
      whatsapp: get("SELECT status, display_phone, quality_rating, last_webhook_at, last_error FROM whatsapp_connections WHERE merchant_id = ?", [id]),
      usage: all("SELECT period, metric, value FROM usage_records WHERE merchant_id = ? ORDER BY period DESC LIMIT 12", [id]),
      subscription: get("SELECT * FROM subscriptions WHERE merchant_id = ? ORDER BY created_at DESC LIMIT 1", [id]),
      errors: all("SELECT service, operation, error, created_at FROM api_logs WHERE merchant_id = ? AND ok = 0 ORDER BY created_at DESC LIMIT 25", [id]),
      audits: all("SELECT * FROM audit_logs WHERE merchant_id = ? ORDER BY created_at DESC LIMIT 40", [id]),
    });
  } catch (e) {
    return jsonError(e);
  }
}

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("activate") }),
  z.object({ action: z.literal("suspend"), reason: z.string().max(300).optional() }),
  z.object({ action: z.literal("change_plan"), planCode: z.string().max(30) }),
  z.object({ action: z.literal("reset_usage") }),
]);

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireSuperAdmin();
    const { id } = await params;
    const merchant = get<{ id: string; name: string }>("SELECT id, name FROM merchants WHERE id = ?", [id]);
    if (!merchant) throw new HttpError(404, "Marchand introuvable.", "not_found");
    const body = await parseBody(req, schema);
    const ip = await clientIp();

    switch (body.action) {
      case "activate":
        run("UPDATE merchants SET status = 'active', updated_at = ? WHERE id = ?", [nowIso(), id]);
        run("UPDATE subscriptions SET status = 'active' WHERE merchant_id = ?", [id]);
        break;
      case "suspend":
        run("UPDATE merchants SET status = 'suspended', updated_at = ? WHERE id = ?", [nowIso(), id]);
        notify({ merchantId: id, type: "subscription_issue", severity: "error", title: "Compte suspendu", body: body.reason ?? "Contactez le support." });
        break;
      case "change_plan": {
        const plan = get("SELECT code FROM plans WHERE code = ?", [body.planCode]);
        if (!plan) throw new HttpError(400, "Plan inconnu.", "bad_request");
        run("UPDATE merchants SET plan_code = ?, updated_at = ? WHERE id = ?", [body.planCode, nowIso(), id]);
        run("INSERT INTO subscriptions (id, merchant_id, plan_code, status, activated_by) VALUES (?,?,?, 'active', ?)", [uid("sub"), id, body.planCode, admin.email]);
        break;
      }
      case "reset_usage":
        run("DELETE FROM usage_records WHERE merchant_id = ? AND period = ?", [id, new Date().toISOString().slice(0, 7)]);
        break;
    }
    audit({ merchantId: id, actorId: admin.id, actorLabel: `superadmin:${admin.email}`, action: `admin.${body.action}`, resource: "merchant", resourceId: id, ip, metadata: body });
    return ok({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
