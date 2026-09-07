import { z } from "zod";
import { requirePermission, clientIp } from "@/server/auth/session";
import { jsonError, ok, parseBody } from "@/server/http";
import { all, run, uid, nowIso } from "@/server/db";
import { encryptSecret } from "@/server/crypto";
import { audit } from "@/server/services/audit";
import { DELIVERY_PROVIDERS, capabilitiesOf, credentialFieldsOf } from "@/server/connectors/delivery";
import { enqueueJob } from "@/server/jobs/queue";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const ctx = await requirePermission("integrations.read");
    const rows = all(
      "SELECT id, provider, label, status, is_default, is_active, last_sync_at, last_error, last_error_at, status_mapping, created_at FROM delivery_connections WHERE merchant_id = ? ORDER BY is_default DESC, created_at",
      [ctx.merchantId],
    ).map((r) => {
      const row = r as Record<string, unknown>;
      return { ...row, capabilities: capabilitiesOf(String(row.provider)) };
    });
    return ok({
      rows,
      providers: DELIVERY_PROVIDERS.map((p) => ({ ...p, capabilities: capabilitiesOf(p.id), fields: credentialFieldsOf(p.id) })),
    });
  } catch (e) {
    return jsonError(e);
  }
}

const schema = z.object({
  provider: z.string().min(2).max(40),
  label: z.string().min(2).max(60),
  credentials: z.record(z.string(), z.string().max(500)).default({}),
  isDefault: z.boolean().optional(),
});

export async function POST(req: Request) {
  try {
    const ctx = await requirePermission("delivery.write");
    const body = await parseBody(req, schema);
    if (!DELIVERY_PROVIDERS.some((p) => p.id === body.provider)) {
      return ok({ error: "Transporteur non supporté." }, { status: 400 });
    }
    const id = uid("dlc");
    if (body.isDefault) run("UPDATE delivery_connections SET is_default = 0 WHERE merchant_id = ?", [ctx.merchantId]);
    run(
      `INSERT INTO delivery_connections (id, merchant_id, provider, label, status, is_default, credentials_encrypted)
       VALUES (?,?,?,?, 'disconnected', ?, ?)`,
      [id, ctx.merchantId, body.provider, body.label, body.isDefault ? 1 : 0, encryptSecret(body.credentials)],
    );
    enqueueJob({ merchantId: ctx.merchantId, type: "poll_delivery", runAfter: new Date(Date.now() + 5 * 60_000) });
    audit({ merchantId: ctx.merchantId, actorId: ctx.user.id, actorLabel: ctx.user.email, action: "integration.connected", resource: "delivery", resourceId: id, ip: await clientIp(), metadata: { provider: body.provider } });
    return ok({ ok: true, id, createdAt: nowIso() }, { status: 201 });
  } catch (e) {
    return jsonError(e);
  }
}
