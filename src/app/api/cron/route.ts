import { runWorker } from "@/server/jobs/worker";
import { all, run, nowIso } from "@/server/db";
import { enqueueJob } from "@/server/jobs/queue";
import { ok } from "@/server/http";
import { safeJson } from "@/server/connectors/orders";
import { safeEqual } from "@/server/crypto";

/**
 * Point d'entrée du traitement de fond planifié.
 *
 * C'est LE worker de production : il n'y a plus de process worker permanent.
 * Appelé par Supabase Cron (pg_cron + pg_net) ou Vercel Cron, il enfile le
 * travail périodique puis draine un lot borné de la file `jobs` (PostgreSQL,
 * `FOR UPDATE SKIP LOCKED`). Deux exécutions qui se chevauchent ne peuvent pas
 * traiter la même tâche.
 *
 * Protégé par CRON_SECRET (Authorization: Bearer …).
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs"; // pg + crypto : incompatibles avec l'edge runtime.
export const maxDuration = 60; // secondes ; plafond Vercel Hobby.

// On arrête d'enchaîner le travail avant la limite d'exécution pour toujours
// répondre proprement : le reste sera traité au prochain déclenchement.
const TIME_BUDGET_MS = 45_000;

export async function POST(req: Request) {
  const startedAt = Date.now();

  // Fail-closed : sans CRON_SECRET configuré, l'endpoint est refusé.
  // (Auparavant un secret absent laissait la route ouverte à tous.)
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error(JSON.stringify({ level: "error", service: "cron", msg: "CRON_SECRET non configuré" }));
    return new Response("cron non configuré", { status: 503 });
  }

  const header = req.headers.get("authorization") ?? "";
  // Vercel Cron envoie « Bearer <CRON_SECRET> ».
  const provided = header.replace(/^Bearer\s+/i, "").trim();
  if (!provided || !safeEqual(provided, secret)) {
    return new Response("unauthorized", { status: 401 });
  }

  // Relance les tâches restées « running » (fonction interrompue, timeout…)
  // AVANT de réclamer : sinon elles resteraient bloquées indéfiniment.
  await run("UPDATE jobs SET status = 'pending' WHERE status = 'running' AND updated_at < ?", [
    new Date(Date.now() - 15 * 60_000).toISOString().slice(0, 19).replace("T", " "),
  ]);

  // Suivi de livraison pour les marchands sans webhook transporteur.
  const merchants = await all<{ merchant_id: string }>(
    "SELECT DISTINCT merchant_id FROM delivery_connections WHERE is_active = 1 AND status = 'connected'",
  );
  for (const m of merchants) await enqueueJob({ merchantId: m.merchant_id, type: "poll_delivery" });

  // Synchronisation automatique Google Sheets.
  const sheets = await all<{ id: string; merchant_id: string; settings: string | null }>(
    "SELECT id, merchant_id, settings FROM integrations WHERE kind = 'google_sheets' AND status IN ('connected','error')",
  );
  for (const s of sheets) {
    const cfg = safeJson<{ auto_sync?: boolean }>(s.settings);
    if (cfg?.auto_sync) await enqueueJob({ merchantId: s.merchant_id, type: "sync_sheet", payload: { integrationId: s.id } });
  }

  // Draine par lots tant qu'il reste du travail ET du temps.
  let processed = 0;
  let failed = 0;
  let batches = 0;
  for (;;) {
    const res = await runWorker(25);
    processed += res.processed;
    failed += res.failed;
    batches++;
    if (res.processed === 0) break; // file vide
    if (Date.now() - startedAt > TIME_BUDGET_MS) break; // budget épuisé
  }

  const payload = { processed, failed, batches, ms: Date.now() - startedAt, at: nowIso() };
  console.log(JSON.stringify({ level: "info", service: "cron", ...payload }));
  return ok(payload);
}

// Certains planificateurs n'émettent que des GET.
export async function GET(req: Request) {
  return await POST(req);
}
