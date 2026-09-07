import { z } from "zod";
import { cookies } from "next/headers";
import { get, run, uid, nowIso, tx } from "@/server/db";
import { createSession, hashPassword, clientIp } from "@/server/auth/session";
import { jsonError, ok, parseBody, rateLimit } from "@/server/http";
import { audit } from "@/server/services/audit";
import { seedAutomations } from "@/server/services/automations";
import { seedTemplates } from "@/server/services/seedTemplates";
import { normalizeDzPhone } from "@/lib/phone";

const schema = z.object({
  fullName: z.string().min(2).max(80),
  business: z.string().min(2).max(80),
  email: z.string().email().max(160),
  phone: z.string().min(6).max(30),
  password: z.string().min(8).max(200),
});

export async function POST(req: Request) {
  try {
    const ip = (await clientIp()) ?? "anon";
    rateLimit(`signup:${ip}`, 5, 60_000);
    const body = await parseBody(req, schema);

    if (await get("SELECT id FROM users WHERE email = ?", [body.email.toLowerCase()])) {
      return ok({ error: "Un compte existe déjà avec cet email." }, { status: 409 });
    }

    const userId = uid("usr");
    const merchantId = uid("mrc");
    const slug = `${body.business.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 32) || "boutique"}-${merchantId.slice(-5)}`;
    const passwordHash = await hashPassword(body.password);
    const phone = normalizeDzPhone(body.phone);

    await tx(async () => {
      await run("INSERT INTO users (id, email, password_hash, full_name, phone) VALUES (?,?,?,?,?)", [
        userId,
        body.email.toLowerCase(),
        passwordHash,
        body.fullName,
        phone.normalized,
      ]);
      await run(
        `INSERT INTO merchants (id, name, slug, status, plan_code, phone, email, trial_ends_at)
         VALUES (?,?,?, 'trial', 'trial', ?,?,?)`,
        [merchantId, body.business, slug, phone.normalized, body.email.toLowerCase(), new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10)],
      );
      await run("INSERT INTO merchant_users (id, merchant_id, user_id, role, status) VALUES (?,?,?, 'owner', 'active')", [uid("mus"), merchantId, userId]);
      await run("INSERT INTO subscriptions (id, merchant_id, plan_code, status, period_end) VALUES (?,?, 'trial', 'trialing', ?)", [
        uid("sub"),
        merchantId,
        new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10),
      ]);
      await seedAutomations(merchantId);
      await seedTemplates(merchantId);
    });

    await createSession(userId);
    const jar = await cookies();
    jar.set("codwsap_merchant", merchantId, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 7 });

    await audit({ merchantId, actorId: userId, actorLabel: body.email, action: "merchant.created", resource: "merchant", resourceId: merchantId, ip });
    return ok({ ok: true, merchantId, createdAt: nowIso() });
  } catch (e) {
    return jsonError(e);
  }
}
