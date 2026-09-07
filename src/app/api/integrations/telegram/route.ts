import { requirePermission } from "@/server/auth/session";
import { jsonError, ok } from "@/server/http";
import { get, run, nowIso } from "@/server/db";
import { decryptSecret } from "@/server/crypto";
import { apiLog } from "@/server/services/audit";

/** Sends a test Telegram alert using the server-stored bot token. */
export async function POST() {
  try {
    const ctx = await requirePermission("integrations.write");
    const integ = get<{ id: string; credentials_encrypted: string | null }>(
      "SELECT id, credentials_encrypted FROM integrations WHERE merchant_id = ? AND kind = 'telegram'", [ctx.merchantId],
    );
    const creds = decryptSecret<{ bot_token?: string; chat_id?: string }>(integ?.credentials_encrypted);
    if (!creds?.bot_token || !creds.chat_id) return ok({ ok: false, message: "Configurez d'abord votre bot Telegram." });
    try {
      const res = await fetch(`https://api.telegram.org/bot${creds.bot_token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: creds.chat_id, text: "✅ Connexion Telegram réussie. Vous recevrez ici vos alertes importantes." }),
        signal: AbortSignal.timeout(10000),
      });
      apiLog({ merchantId: ctx.merchantId, service: "telegram", operation: "test", ok: res.ok, statusCode: res.status });
      run("UPDATE integrations SET status = ?, last_sync_at = ?, last_error = ? WHERE id = ?", [
        res.ok ? "connected" : "error", res.ok ? nowIso() : null, res.ok ? null : `HTTP ${res.status}`, integ!.id,
      ]);
      return ok({ ok: res.ok, message: res.ok ? "Message de test envoyé sur Telegram." : "Telegram a refusé la requête. Vérifiez le token et le chat ID." });
    } catch (err) {
      return ok({ ok: false, message: "Telegram injoignable pour le moment.", technical: (err as Error).message });
    }
  } catch (e) {
    return jsonError(e);
  }
}
