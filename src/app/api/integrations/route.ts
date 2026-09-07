import { z } from "zod";
import { requirePermission, clientIp } from "@/server/auth/session";
import { jsonError, ok, parseBody } from "@/server/http";
import { all, get, run, uid, nowIso } from "@/server/db";
import { decryptSecret, encryptSecret, maskSecret, randomToken } from "@/server/crypto";
import { audit } from "@/server/services/audit";
import { safeJson } from "@/server/connectors/orders";
import { workerHealth } from "@/server/jobs/worker";

export const dynamic = "force-dynamic";

/** Aggregated integration health for the Intégrations page. */
export async function GET() {
  try {
    const ctx = await requirePermission("integrations.read");
    const integrations = all<{ id: string; kind: string; label: string | null; status: string; settings: string | null; credentials_encrypted: string | null; last_sync_at: string | null; last_error: string | null }>(
      "SELECT * FROM integrations WHERE merchant_id = ?",
      [ctx.merchantId],
    ).map((i) => {
      const creds = decryptSecret<Record<string, string>>(i.credentials_encrypted) ?? {};
      return {
        id: i.id,
        kind: i.kind,
        label: i.label,
        status: i.status,
        settings: safeJson(i.settings),
        last_sync_at: i.last_sync_at,
        last_error: i.last_error,
        secrets: Object.fromEntries(Object.entries(creds).map(([k, v]) => [k, maskSecret(v)])),
      };
    });
    const whatsapp = get<{ status: string; last_webhook_at: string | null; last_message_at: string | null; last_error: string | null }>(
      "SELECT status, last_webhook_at, last_message_at, last_error FROM whatsapp_connections WHERE merchant_id = ?",
      [ctx.merchantId],
    );
    const delivery = all("SELECT id, provider, label, status, last_sync_at, last_error FROM delivery_connections WHERE merchant_id = ?", [ctx.merchantId]);
    return ok({ integrations, whatsapp: whatsapp ?? null, delivery, jobs: workerHealth() });
  } catch (e) {
    return jsonError(e);
  }
}

const schema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("google_sheets"),
    spreadsheetId: z.string().min(10).max(120),
    sheetName: z.string().max(60).optional(),
    gid: z.string().max(20).optional(),
    apiKey: z.string().max(200).optional(),
    mapping: z.record(z.string(), z.string().max(80)).default({}),
    autoSync: z.boolean().optional(),
  }),
  z.object({ kind: z.literal("telegram"), botToken: z.string().min(20).max(200), chatId: z.string().min(2).max(60) }),
  z.object({ kind: z.literal("webhook") }),
]);

export async function PUT(req: Request) {
  try {
    const ctx = await requirePermission("integrations.write");
    const body = await parseBody(req, schema);
    const existing = get<{ id: string; credentials_encrypted: string | null }>("SELECT id, credentials_encrypted FROM integrations WHERE merchant_id = ? AND kind = ?", [ctx.merchantId, body.kind]);
    const id = existing?.id ?? uid("int");

    let settings: unknown = {};
    let credentials: Record<string, string> = decryptSecret<Record<string, string>>(existing?.credentials_encrypted ?? null) ?? {};

    if (body.kind === "google_sheets") {
      settings = { spreadsheet_id: body.spreadsheetId, sheet_name: body.sheetName ?? "", gid: body.gid ?? "0", mapping: body.mapping, auto_sync: !!body.autoSync };
      if (body.apiKey) credentials = { ...credentials, api_key: body.apiKey };
    } else if (body.kind === "telegram") {
      credentials = { bot_token: body.botToken, chat_id: body.chatId };
    } else {
      credentials = { api_key: credentials.api_key ?? randomToken(24), webhook_secret: credentials.webhook_secret ?? randomToken(24) };
      settings = { endpoint: `/api/webhooks/orders/${ctx.merchantId}` };
    }

    if (existing) {
      run("UPDATE integrations SET settings = ?, credentials_encrypted = ?, status = 'connected', updated_at = ? WHERE id = ?", [
        JSON.stringify(settings),
        encryptSecret(credentials),
        nowIso(),
        id,
      ]);
    } else {
      run("INSERT INTO integrations (id, merchant_id, kind, label, status, credentials_encrypted, settings) VALUES (?,?,?,?, 'connected', ?, ?)", [
        id,
        ctx.merchantId,
        body.kind,
        body.kind,
        encryptSecret(credentials),
        JSON.stringify(settings),
      ]);
    }
    audit({ merchantId: ctx.merchantId, actorId: ctx.user.id, actorLabel: ctx.user.email, action: "integration.connected", resource: body.kind, resourceId: id, ip: await clientIp() });
    return ok({ ok: true, id });
  } catch (e) {
    return jsonError(e);
  }
}

export async function DELETE(req: Request) {
  try {
    const ctx = await requirePermission("integrations.write");
    const kind = new URL(req.url).searchParams.get("kind");
    if (!kind) return ok({ error: "Intégration inconnue." }, { status: 400 });
    run("DELETE FROM integrations WHERE merchant_id = ? AND kind = ?", [ctx.merchantId, kind]);
    audit({ merchantId: ctx.merchantId, actorId: ctx.user.id, actorLabel: ctx.user.email, action: "integration.disconnected", resource: kind, ip: await clientIp() });
    return ok({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
