import { z } from "zod";
import { requirePermission, hashPassword, clientIp, HttpError } from "@/server/auth/session";
import { jsonError, ok, parseBody } from "@/server/http";
import { get, run, uid } from "@/server/db";
import { audit } from "@/server/services/audit";
import { randomToken } from "@/server/crypto";

const createSchema = z.object({
  fullName: z.string().min(2).max(80),
  email: z.string().email().max(160),
  role: z.enum(["admin", "agent"]),
  password: z.string().min(8).max(200).optional(),
});

export async function POST(req: Request) {
  try {
    const ctx = await requirePermission("users.write");
    const body = await parseBody(req, createSchema);

    // Plan limit enforcement.
    const plan = get<{ max_team_members: number }>("SELECT max_team_members FROM plans WHERE code = ?", [ctx.merchant.plan_code]);
    const count = get<{ c: number }>("SELECT COUNT(*) AS c FROM merchant_users WHERE merchant_id = ? AND status = 'active'", [ctx.merchantId])?.c ?? 0;
    if (plan?.max_team_members && count >= plan.max_team_members) {
      throw new HttpError(403, `Votre plan est limité à ${plan.max_team_members} membres. Passez à un plan supérieur.`, "plan_limit");
    }

    let user = get<{ id: string }>("SELECT id FROM users WHERE email = ?", [body.email.toLowerCase()]);
    const tempPassword = body.password ?? randomToken(9);
    if (!user) {
      const id = uid("usr");
      run("INSERT INTO users (id, email, password_hash, full_name) VALUES (?,?,?,?)", [id, body.email.toLowerCase(), await hashPassword(tempPassword), body.fullName]);
      user = { id };
    }
    const existing = get("SELECT id FROM merchant_users WHERE merchant_id = ? AND user_id = ?", [ctx.merchantId, user.id]);
    if (existing) throw new HttpError(409, "Cet utilisateur fait déjà partie de votre équipe.", "conflict");

    run("INSERT INTO merchant_users (id, merchant_id, user_id, role, status, invited_email) VALUES (?,?,?,?, 'active', ?)", [
      uid("mus"),
      ctx.merchantId,
      user.id,
      body.role,
      body.email.toLowerCase(),
    ]);
    audit({ merchantId: ctx.merchantId, actorId: ctx.user.id, actorLabel: ctx.user.email, action: "user.invited", resource: "user", resourceId: user.id, ip: await clientIp(), metadata: { role: body.role } });
    return ok({ ok: true, temporaryPassword: body.password ? undefined : tempPassword }, { status: 201 });
  } catch (e) {
    return jsonError(e);
  }
}

const patchSchema = z.object({ membershipId: z.string(), role: z.enum(["admin", "agent"]).optional(), status: z.enum(["active", "disabled"]).optional() });

export async function PATCH(req: Request) {
  try {
    const ctx = await requirePermission("users.write");
    const body = await parseBody(req, patchSchema);
    const member = get<{ id: string; role: string }>("SELECT id, role FROM merchant_users WHERE id = ? AND merchant_id = ?", [body.membershipId, ctx.merchantId]);
    if (!member) throw new HttpError(404, "Membre introuvable.", "not_found");
    if (member.role === "owner") throw new HttpError(403, "Le propriétaire ne peut pas être modifié.", "forbidden");
    run("UPDATE merchant_users SET role = COALESCE(?, role), status = COALESCE(?, status) WHERE id = ?", [body.role ?? null, body.status ?? null, body.membershipId]);
    audit({ merchantId: ctx.merchantId, actorId: ctx.user.id, actorLabel: ctx.user.email, action: "user.updated", resource: "user", resourceId: body.membershipId, ip: await clientIp() });
    return ok({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
