import { z } from "zod";
import { cookies } from "next/headers";
import { get, run, nowIso } from "@/server/db";
import { createSession, verifyPassword, membershipsFor, clientIp } from "@/server/auth/session";
import { jsonError, ok, parseBody, rateLimit } from "@/server/http";
import { audit } from "@/server/services/audit";

const schema = z.object({ email: z.string().email(), password: z.string().min(1) });

export async function POST(req: Request) {
  try {
    const ip = (await clientIp()) ?? "anon";
    rateLimit(`login:${ip}`, 10, 60_000);
    const body = await parseBody(req, schema);

    const user = get<{ id: string; password_hash: string; is_active: number; is_super_admin: number; email: string }>(
      "SELECT id, password_hash, is_active, is_super_admin, email FROM users WHERE email = ?",
      [body.email.toLowerCase()],
    );
    // Constant-ish response to avoid user enumeration.
    if (!user || !user.is_active || !(await verifyPassword(body.password, user.password_hash))) {
      return ok({ error: "Email ou mot de passe incorrect." }, { status: 401 });
    }

    await createSession(user.id);
    run("UPDATE users SET last_login_at = ? WHERE id = ?", [nowIso(), user.id]);

    const memberships = membershipsFor(user.id);
    const jar = await cookies();
    if (memberships[0]) {
      jar.set("codwsap_merchant", memberships[0].merchant_id, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 7 });
      run("UPDATE merchants SET last_active_at = ? WHERE id = ?", [nowIso(), memberships[0].merchant_id]);
    }
    audit({ merchantId: memberships[0]?.merchant_id ?? null, actorId: user.id, actorLabel: user.email, action: "user.login", ip });

    return ok({ ok: true, redirect: user.is_super_admin && memberships.length === 0 ? "/admin" : "/dashboard" });
  } catch (e) {
    return jsonError(e);
  }
}
