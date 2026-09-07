/**
 * Worker de tâches de fond CODWSAP (service séparé du web).
 *
 *   npm run worker
 *
 * File d'attente : table `jobs` PostgreSQL, réclamée avec
 * `FOR UPDATE SKIP LOCKED` — plusieurs répliques peuvent tourner en parallèle
 * sans traiter deux fois la même tâche. Pas de Redis requis pour la V1 (voir
 * docs/DEPLOYMENT.md : Redis reste optionnel et n'est utile qu'au-delà du
 * volume géré confortablement par Postgres).
 *
 * Réessais : bornés (3 tentatives par défaut) avec backoff, puis passage en
 * `failed` + notification. Jamais de boucle de réessai infinie.
 *
 * Santé : sonde HTTP sur WORKER_HEALTH_PORT (défaut 3001) pour le healthcheck
 * Railway. 200 si la boucle tourne et que la base répond, 503 sinon.
 */
import http from "node:http";
import { runWorker, workerHealth } from "../src/server/jobs/worker";
import { closeDb } from "../src/server/db";

const INTERVAL = Number(process.env.WORKER_INTERVAL_MS ?? 15_000);
const BATCH = Number(process.env.WORKER_BATCH ?? 20);
const HEALTH_PORT = Number(process.env.WORKER_HEALTH_PORT ?? process.env.PORT ?? 3001);
// Au-delà de ce délai sans cycle réussi, le worker est considéré bloqué.
const STALE_MS = Number(process.env.WORKER_STALE_MS ?? Math.max(60_000, INTERVAL * 6));

let lastSuccessAt = Date.now();
let consecutiveFailures = 0;
let running = false;
let stopping = false;
let totals = { processed: 0, failed: 0, cycles: 0 };

function log(level: "info" | "warn" | "error", msg: string, extra: Record<string, unknown> = {}) {
  // Log structuré : exploitable tel quel par les collecteurs de Railway.
  console[level === "info" ? "log" : level](
    JSON.stringify({ ts: new Date().toISOString(), level, service: "worker", msg, ...extra }),
  );
}

async function tick() {
  if (running || stopping) return;
  running = true;
  const startedAt = Date.now();
  try {
    const res = await runWorker(BATCH);
    lastSuccessAt = Date.now();
    consecutiveFailures = 0;
    totals = {
      processed: totals.processed + res.processed,
      failed: totals.failed + res.failed,
      cycles: totals.cycles + 1,
    };
    if (res.processed) {
      log("info", "cycle", { processed: res.processed, failed: res.failed, ms: Date.now() - startedAt });
    }
  } catch (e) {
    consecutiveFailures++;
    log("error", "cycle en échec", {
      error: e instanceof Error ? e.message : String(e),
      consecutiveFailures,
    });
  } finally {
    running = false;
  }
}

/* ------------------------------------------------------------------ */
/* Sonde de santé                                                      */
/* ------------------------------------------------------------------ */
const server = http.createServer(async (req, res) => {
  if (req.url !== "/health" && req.url !== "/") {
    res.writeHead(404).end();
    return;
  }
  const staleFor = Date.now() - lastSuccessAt;
  const healthy = staleFor < STALE_MS && consecutiveFailures < 5;
  let queue: Awaited<ReturnType<typeof workerHealth>> | null = null;
  try {
    queue = await workerHealth();
  } catch {
    /* base injoignable : reflété par ok=false ci-dessous */
  }
  const ok = healthy && queue !== null;
  res.writeHead(ok ? 200 : 503, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(
    JSON.stringify({
      status: ok ? "ok" : "unhealthy",
      last_success_s_ago: Math.round(staleFor / 1000),
      consecutive_failures: consecutiveFailures,
      cycles: totals.cycles,
      processed_total: totals.processed,
      failed_total: totals.failed,
      queue,
    }),
  );
});

server.listen(HEALTH_PORT, "0.0.0.0", () => {
  log("info", "worker démarré", { interval_ms: INTERVAL, batch: BATCH, health_port: HEALTH_PORT });
});

const timer = setInterval(tick, INTERVAL);
void tick();

/* ------------------------------------------------------------------ */
/* Arrêt propre : on laisse le cycle courant se terminer               */
/* ------------------------------------------------------------------ */
async function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  log("info", "arrêt demandé", { signal });
  clearInterval(timer);
  server.close();

  const deadline = Date.now() + 25_000;
  while (running && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 200));
  }
  if (running) log("warn", "cycle toujours en cours à l'expiration du délai");

  await closeDb().catch(() => {});
  log("info", "worker arrêté", totals);
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

process.on("unhandledRejection", (reason) => {
  log("error", "rejet non géré", { error: reason instanceof Error ? reason.message : String(reason) });
});
process.on("uncaughtException", (err) => {
  log("error", "exception non capturée", { error: err.message });
  void shutdown("uncaughtException");
});
