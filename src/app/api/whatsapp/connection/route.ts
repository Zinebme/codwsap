import { z } from "zod";
import { requirePermission, clientIp } from "@/server/auth/session";
import { jsonError, ok, parseBody } from "@/server/http";
import { get, run, uid, nowIso } from "@/server/db";
import { encryptSecret, decryptSecret, maskSecret, randomToken } from "@/server/crypto";
import { audit, apiLog } from "@/server/services/audit";

export const dynamic = "force-dynamic";

/** Never returns raw credentials — only masked previews. */
export async function GET() {
  try {
    const ctx = await requirePermission("integrations.read");
    const conn = get<{
      id: string;
      display_phone: string | null;
      phone_number_id: string | null;
      business_account_id: string | null;
      credentials_encrypted: string | null;
      webhook_verify_token: string | null;
      status: string;
      quality_rating: string | null;
      meta_metrics: string | null;
      last_webhook_at: string | null;
      last_message_at: string | null;
      last_error: string | null;
      last_error_at: string | null;
    }>("SELECT * FROM whatsapp_connections WHERE merchant_id = ?", [ctx.merchantId]);
    if (!conn) return ok({ connection: null });
    const creds = decryptSecret<{ access_token?: string }>(conn.credentials_encrypted);
    const recentErrors = (await import("@/server/db")).all(
      "SELECT operation, error, created_at FROM api_logs WHERE merchant_id = ? AND service = 'whatsapp' AND ok = 0 ORDER BY created_at DESC LIMIT 5",
      [ctx.merchantId],
    );
    return ok({
      connection: {
        ...conn,
        credentials_encrypted: undefined,
        access_token_masked: maskSecret(creds?.access_token),
        webhook_url: `/api/webhooks/whatsapp/${ctx.merchantId}`,
      },
      recentErrors,
    });
  } catch (e) {
    return jsonError(e);
  }
}

const schema = z.object({
  displayPhone: z.string().min(5).max(30),
  phoneNumberId: z.string().min(3).max(60),
  businessAccountId: z.string().min(3).max(60),
  accessToken: z.string().min(10).max(600).optional(),
});

export async function PUT(req: Request) {
  try {
    const ctx = await requirePermission("integrations.write");
    const body = await parseBody(req, schema);
    const existing = get<{ id: string; credentials_encrypted: string | null; webhook_verify_token: string | null }>(
      "SELECT id, credentials_encrypted, webhook_verify_token FROM whatsapp_connections WHERE merchant_id = ?",
      [ctx.merchantId],
    );
    const creds = body.accessToken ? encryptSecret({ access_token: body.accessToken }) : existing?.credentials_encrypted ?? null;
    const verifyToken = existing?.webhook_verify_token ?? randomToken(16);

    if (existing) {
      run(
        `UPDATE whatsapp_connections SET display_phone = ?, phone_number_id = ?, business_account_id = ?, credentials_encrypted = ?, updated_at = ? WHERE id = ?`,
        [body.displayPhone, body.phoneNumberId, body.businessAccountId, creds, nowIso(), existing.id],
      );
    } else {
      run(
        `INSERT INTO whatsapp_connections (id, merchant_id, provider, display_phone, phone_number_id, business_account_id, credentials_encrypted, webhook_verify_token, webhook_secret, status)
         VALUES (?,?, 'meta_cloud', ?,?,?,?,?,?, 'disconnected')`,
        [uid("wac"), ctx.merchantId, body.displayPhone, body.phoneNumberId, body.businessAccountId, creds, verifyToken, randomToken(24)],
      );
    }
    audit({ merchantId: ctx.merchantId, actorId: ctx.user.id, actorLabel: ctx.user.email, action: "integration.credentials_changed", resource: "whatsapp", ip: await clientIp() });
    return ok({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}

/** Connection test: validates the token against the Graph API. */
export async function POST() {
  try {
    const ctx = await requirePermission("integrations.write");
    const conn = get<{ id: string; phone_number_id: string | null; credentials_encrypted: string | null }>(
      "SELECT id, phone_number_id, credentials_encrypted FROM whatsapp_connections WHERE merchant_id = ?",
      [ctx.merchantId],
    );
    if (!conn?.phone_number_id) return ok({ ok: false, message: "Renseignez d'abord vos identifiants WhatsApp." });
    const creds = decryptSecret<{ access_token?: string }>(conn.credentials_encrypted);
    if (!creds?.access_token) return ok({ ok: false, message: "Jeton d'accès manquant." });

    const started = Date.now();
    try {
      const res = await fetch(`https://graph.facebook.com/v21.0/${conn.phone_number_id}?fields=display_phone_number,quality_rating,verified_name`, {
        headers: { Authorization: `Bearer ${creds.access_token}` },
        signal: AbortSignal.timeout(12000),
      });
      const json = (await res.json().catch(() => ({}))) as { quality_rating?: string; error?: { message?: string } };
      apiLog({ merchantId: ctx.merchantId, service: "whatsapp", operation: "test_connection", statusCode: res.status, ok: res.ok, durationMs: Date.now() - started, error: res.ok ? null : json.error?.message });
      if (!res.ok) {
        run("UPDATE whatsapp_connections SET status = 'error', last_error = ?, last_error_at = ? WHERE id = ?", [
          json.error?.message ?? "Identifiants refusés",
          nowIso(),
          conn.id,
        ]);
        return ok({ ok: false, message: "Connexion WhatsApp interrompue. Vérifiez vos identifiants.", technical: json.error?.message });
      }
      run("UPDATE whatsapp_connections SET status = 'connected', quality_rating = ?, meta_metrics = ?, last_error = NULL WHERE id = ?", [
        json.quality_rating ?? null,
        JSON.stringify(json),
        conn.id,
      ]);
      return ok({ ok: true, message: "Connexion WhatsApp validée.", qualityRating: json.quality_rating ?? null });
    } catch (err) {
      apiLog({ merchantId: ctx.merchantId, service: "whatsapp", operation: "test_connection", ok: false, durationMs: Date.now() - started, error: (err as Error).message });
      run("UPDATE whatsapp_connections SET status = 'error', last_error = ?, last_error_at = ? WHERE id = ?", ["Réseau indisponible", nowIso(), conn.id]);
      return ok({ ok: false, message: "Impossible de joindre l'API WhatsApp pour le moment.", technical: (err as Error).message });
    }
  } catch (e) {
    return jsonError(e);
  }
}
