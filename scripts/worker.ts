/** Standalone background worker loop (delivery polling, WhatsApp sends, reminders, sheet sync). */
import { runWorker } from "../src/server/jobs/worker";

const INTERVAL = Number(process.env.WORKER_INTERVAL_MS ?? 15_000);

async function tick() {
  try {
    const res = await runWorker(20);
    if (res.processed) console.log(`[worker] ${new Date().toISOString()} processed=${res.processed} failed=${res.failed}`);
  } catch (e) {
    console.error("[worker] erreur", e);
  }
}

console.log(`Worker CODWSAP démarré (intervalle ${INTERVAL} ms).`);
void tick();
setInterval(tick, INTERVAL);
