import "server-only";
import { cookies, headers } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { all, get, run, uid } from "@/server/db";
import type { Role, Permission } from "@/lib/domain";
import { roleCan } from "@/lib/domain";

const SECRET = new TextEncoder().encode(
  process.env.SESSION_SECRET || "dev-only-session-secret-change-me-in-production",
);
const COOKIE = "codwsap_session";
const MAX_AGE = 60 * 60 * 24 * 7;

export type SessionUser = {
  id: string;
  email: string;
  full_name: string;
  is_super_admin: number;
};

export type Membership = { merchant_id: string; role: Role; merchant_name: string; merchant_status: string };

export async function hashPassword(pw: string) {
  return bcrypt.hash(pw, 10);
}
export async function verifyPassword(pw: string, hash: string) {
  return bcrypt.compare(pw, hash);
}

export async function createSession(userId: string) {
  const jti = uid("s");
  const token = await new SignJWT({ sub: userId, jti })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(SECRET);
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax", // CSRF: cookie not sent on cross-site POSTs
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) {
    try {
      const { payload } = await jwtVerify(token, SECRET);
      if (payload.jti) await run("INSERT OR IGNORE INTO sessions_revoked (jti) VALUES (?)", [payload.jti]);
    } catch {
      /* ignore */
    }
  }
  jar.delete(COOKIE);
}

export async function currentUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, SECRET);
    if (payload.jti && await get("SELECT jti FROM sessions_revoked WHERE jti = ?", [payload.jti])) return null;
    const user = await get<SessionUser & { is_active: number }>(
      "SELECT id, email, full_name, is_super_admin, is_active FROM users WHERE id = ?",
      [payload.sub as string],
    );
    if (!user || !user.is_active) return null;
    return { id: user.id, email: user.email, full_name: user.full_name, is_super_admin: user.is_super_admin };
  } catch {
    return null;
  }
}

export async function membershipsFor(userId: string): Promise<Membership[]> {
  return await all<Membership>(
    `SELECT mu.merchant_id, mu.role, m.name AS merchant_name, m.status AS merchant_status
     FROM merchant_users mu JOIN merchants m ON m.id = mu.merchant_id
     WHERE mu.user_id = ? AND mu.status = 'active' ORDER BY mu.created_at`,
    [userId],
  );
}

export class HttpError extends Error {
  constructor(public status: number, message: string, public code = "error") {
    super(message);
  }
}

export type TenantContext = {
  user: SessionUser;
  merchantId: string;
  role: Role;
  merchant: {
    id: string;
    name: string;
    status: string;
    plan_code: string;
    locale: string;
    onboarding_step: number;
    onboarding_completed_at: string | null;
  };
  can: (p: Permission) => boolean;
};

/**
 * Resolve tenant SERVER-SIDE only. The merchant_id is never taken from the
 * request body/headers — it comes from the authenticated membership.
 */
export async function requireTenant(): Promise<TenantContext> {
  const user = await currentUser();
  if (!user) throw new HttpError(401, "Session expirée. Veuillez vous reconnecter.", "unauthenticated");

  const jar = await cookies();
  const preferred = jar.get("codwsap_merchant")?.value;
  const memberships = await membershipsFor(user.id);
  if (memberships.length === 0) throw new HttpError(403, "Aucun espace marchand associé à ce compte.", "no_tenant");

  const chosen = memberships.find((m) => m.merchant_id === preferred) ?? memberships[0];
  const merchant = await get<TenantContext["merchant"]>(
    "SELECT id, name, status, plan_code, locale, onboarding_step, onboarding_completed_at FROM merchants WHERE id = ?",
    [chosen.merchant_id],
  );
  if (!merchant) throw new HttpError(403, "Espace marchand introuvable.", "no_tenant");
  if (merchant.status === "suspended") {
    throw new HttpError(403, "Votre compte est suspendu. Contactez le support.", "suspended");
  }

  return {
    user,
    merchantId: merchant.id,
    role: chosen.role,
    merchant,
    can: (p: Permission) => roleCan(chosen.role, p),
  };
}

export async function requirePermission(p: Permission): Promise<TenantContext> {
  const ctx = await requireTenant();
  if (!ctx.can(p)) throw new HttpError(403, "Votre rôle ne permet pas cette action.", "forbidden");
  return ctx;
}

export async function requireSuperAdmin(): Promise<SessionUser> {
  const user = await currentUser();
  if (!user || !user.is_super_admin) throw new HttpError(403, "Accès réservé aux administrateurs.", "forbidden");
  return user;
}

export async function clientIp(): Promise<string | null> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}
