import { z } from "zod";
import { requirePermission, HttpError, clientIp } from "@/server/auth/session";
import { jsonError, ok, parseBody } from "@/server/http";
import { get, run, nowIso } from "@/server/db";
import { decryptSecret, encryptSecret } from "@/server/crypto";
import { connectorForConnection } from "@/server/connectors/delivery";
import { audit } from "@/server/services/audit";

const schema = z.object({
  label: z.string().min(2).max(60).optional(),
  credentials: z.record(z.string(), z.string().max(500)).optional(),
  isActive: z.boolean().optional(),
  isDefault: z.boolean().optional(),
  statusMapping: z.record(z.string(), z.string().max(40)).optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requirePermission("delivery.write");
    const { id } = await params;
    const conn = get<{ id: string; credentials_encrypted: string | null }>("SELECT id, credentials_encrypted FROM delivery_connections WHERE id = ? AND merchant_id = ?", [id, ctx.merchantId]);
    if (!conn) throw new HttpError(404, "Connexion introuvable.", "not_found");
    const body = await parseBody(req, schema);

    let creds = conn.credentials_encrypted;
    if (body.credentials) {
      const current = decryptSecret<Record<string, string>>(conn.credentials_encrypted) ?? {};
      // Empty values keep the previously stored secret.
      const merged = { ...current };
      for (const [k, v] of Object.entries(body.credentials)) if (v.trim()) merged[k] = v;
      creds = encryptSecret(merged);
    }
    if (body.isDefault) run("UPDATE delivery_connections SET is_default = 0 WHERE merchant_id = ?", [ctx.merchantId]);
    run(
      `UPDATE delivery_connections SET label = COALESCE(?, label), credentials_encrypted = ?, is_active = COALESCE(?, is_active),
        is_default = COALESCE(?, is_default), status_mapping = COALESCE(?, status_mapping), updated_at = ? WHERE id = ? AND merchant_id = ?`,
      [
        body.label ?? null,
        creds,
        body.isActive == null ? null : body.isActive ? 1 : 0,
        body.isDefault == null ? null : body.isDefault ? 1 : 0,
        body.statusMapping ? JSON.stringify(body.statusMapping) : null,
        nowIso(),
        id,
        ctx.merchantId,
      ],
    );
    audit({ merchantId: ctx.merchantId, actorId: ctx.user.id, actorLabel: ctx.user.email, action: "integration.updated", resource: "delivery", resourceId: id, ip: await clientIp() });
    return ok({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}

/** Connection test. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requirePermission("delivery.write");
    const { id } = await params;
    const connector = connectorForConnection(id, ctx.merchantId);
    if (!connector) throw new HttpError(404, "Connexion introuvable.", "not_found");
    const res = await connector.testConnection();
    run("UPDATE delivery_connections SET status = ?, last_error = ?, last_error_at = ?, last_sync_at = COALESCE(?, last_sync_at) WHERE id = ? AND merchant_id = ?", [
      res.ok ? "connected" : "error",
      res.ok ? null : res.message,
      res.ok ? null : nowIso(),
      res.ok ? nowIso() : null,
      id,
      ctx.merchantId,
    ]);
    return ok(res);
  } catch (e) {
    return jsonError(e);
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requirePermission("delivery.write");
    const { id } = await params;
    run("DELETE FROM delivery_connections WHERE id = ? AND merchant_id = ?", [id, ctx.merchantId]);
    audit({ merchantId: ctx.merchantId, actorId: ctx.user.id, actorLabel: ctx.user.email, action: "integration.disconnected", resource: "delivery", resourceId: id, ip: await clientIp() });
    return ok({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
