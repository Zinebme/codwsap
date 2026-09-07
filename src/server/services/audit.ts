import "server-only";
import { run, uid } from "@/server/db";

export async function audit(params: {
  merchantId?: string | null;
  actorId?: string | null;
  actorLabel?: string | null;
  action: string;
  resource?: string | null;
  resourceId?: string | null;
  ip?: string | null;
  metadata?: unknown;
}) {
  await run(
    `INSERT INTO audit_logs (id, merchant_id, actor_id, actor_label, action, resource, resource_id, ip, metadata)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    [
      uid("aud"),
      params.merchantId ?? null,
      params.actorId ?? null,
      params.actorLabel ?? null,
      params.action,
      params.resource ?? null,
      params.resourceId ?? null,
      params.ip ?? null,
      params.metadata ? JSON.stringify(params.metadata) : null,
    ],
  );
}

export async function apiLog(params: {
  merchantId?: string | null;
  service: string;
  operation: string;
  statusCode?: number | null;
  ok: boolean;
  durationMs?: number | null;
  error?: string | null;
}) {
  await run(
    `INSERT INTO api_logs (id, merchant_id, service, operation, status_code, ok, duration_ms, error)
     VALUES (?,?,?,?,?,?,?,?)`,
    [
      uid("api"),
      params.merchantId ?? null,
      params.service,
      params.operation,
      params.statusCode ?? null,
      params.ok ? 1 : 0,
      params.durationMs ?? null,
      params.error ?? null,
    ],
  );
}
