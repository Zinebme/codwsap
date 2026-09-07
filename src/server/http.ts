import "server-only";
import { NextResponse } from "next/server";
import { ZodError, type ZodSchema } from "zod";
import { HttpError } from "@/server/auth/session";
import { get, run, uid } from "@/server/db";

/** Friendly, non-technical error envelope. Stack traces never reach merchants. */
export function jsonError(e: unknown) {
  if (e instanceof HttpError) {
    return NextResponse.json({ error: e.message, code: e.code }, { status: e.status });
  }
  if (e instanceof ZodError) {
    return NextResponse.json(
      { error: "Données invalides. Vérifiez les champs du formulaire.", code: "validation", details: e.issues.map((i) => ({ path: i.path.join("."), message: i.message })) },
      { status: 422 },
    );
  }
  console.error("[api]", e);
  return NextResponse.json({ error: "Une erreur interne est survenue. Réessayez dans un instant.", code: "internal" }, { status: 500 });
}

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data as Record<string, unknown>, init);
}

export async function parseBody<T>(req: Request, schema: ZodSchema<T>): Promise<T> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new HttpError(400, "Requête invalide.", "bad_request");
  }
  return schema.parse(body);
}

/** Simple in-memory sliding-window rate limiter (per process). */
const buckets = new Map<string, number[]>();
export function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const arr = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (arr.length >= limit) throw new HttpError(429, "Trop de requêtes. Patientez quelques secondes.", "rate_limited");
  arr.push(now);
  buckets.set(key, arr);
  if (buckets.size > 5000) buckets.clear();
}

/** Records a webhook event and enforces idempotency. */
export async function recordWebhook(params: {
  merchantId?: string | null;
  source: string;
  provider?: string | null;
  idempotencyKey: string;
  signatureValid?: boolean | null;
  payload: unknown;
}): Promise<{ duplicate: boolean; id: string }> {
  const existing = await get<{ id: string }>("SELECT id FROM webhook_events WHERE source = ? AND idempotency_key = ?", [params.source, params.idempotencyKey]);
  if (existing) return { duplicate: true, id: existing.id };
  const id = uid("whk");
  await run(
    `INSERT INTO webhook_events (id, merchant_id, source, provider, idempotency_key, signature_valid, status, payload)
     VALUES (?,?,?,?,?,?, 'received', ?)`,
    [
      id,
      params.merchantId ?? null,
      params.source,
      params.provider ?? null,
      params.idempotencyKey,
      params.signatureValid == null ? null : params.signatureValid ? 1 : 0,
      JSON.stringify(params.payload).slice(0, 8000),
    ],
  );
  return { duplicate: false, id };
}

export async function markWebhook(id: string, status: "processed" | "failed" | "duplicate", error?: string) {
  await run("UPDATE webhook_events SET status = ?, error = ? WHERE id = ?", [status, error?.slice(0, 400) ?? null, id]);
}
