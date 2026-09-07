import "server-only";
import { all, get, run, uid, activeDriver } from "@/server/db";

export type JobType =
  | "send_whatsapp"
  | "poll_delivery"
  | "sync_sheet"
  | "reminder"
  | "notify_telegram"
  | "wa_availability_check";

export type Job = {
  id: string;
  merchant_id: string | null;
  type: JobType;
  payload: string | null;
  status: string;
  attempts: number;
  max_attempts: number;
  run_after: string;
  last_error: string | null;
};

/** Backoff: attempt 1 -> +1min, 2 -> +5min, 3 -> failed + alert. */
const BACKOFF_MINUTES = [1, 5, 15];

export async function enqueueJob(params: {
  merchantId?: string | null;
  type: JobType;
  payload?: unknown;
  runAfter?: Date;
  maxAttempts?: number;
}): Promise<string> {
  const id = uid("job");
  await run(
    `INSERT INTO jobs (id, merchant_id, type, payload, status, max_attempts, run_after)
     VALUES (?,?,?,?, 'pending', ?, ?)`,
    [
      id,
      params.merchantId ?? null,
      params.type,
      params.payload ? JSON.stringify(params.payload) : null,
      params.maxAttempts ?? 3,
      toSql(params.runAfter ?? new Date()),
    ],
  );
  return id;
}

export function toSql(d: Date): string {
  return d.toISOString().replace("T", " ").slice(0, 19);
}

export async function claimJobs(limit = 20): Promise<Job[]> {
  const now = toSql(new Date());

  if (activeDriver() === "postgres") {
    // Atomic claim: SKIP LOCKED lets several workers pull disjoint batches safely.
    return await all<Job>(
      `UPDATE jobs SET status = 'running', attempts = attempts + 1, updated_at = ?
       WHERE id IN (
         SELECT id FROM jobs
         WHERE status = 'pending' AND run_after <= ?
         ORDER BY run_after
         LIMIT ?
         FOR UPDATE SKIP LOCKED
       )
       RETURNING *`,
      [now, now, limit],
    );
  }

  // SQLite dev path: single-writer, so read-then-conditional-update is sufficient.
  const rows = await all<Job>(
    `SELECT * FROM jobs WHERE status = 'pending' AND run_after <= ? ORDER BY run_after LIMIT ?`,
    [now, limit],
  );
  const claimed: Job[] = [];
  for (const r of rows) {
    await run("UPDATE jobs SET status = 'running', attempts = attempts + 1, updated_at = ? WHERE id = ? AND status = 'pending'", [now, r.id]);
    const check = await get<{ status: string }>("SELECT status FROM jobs WHERE id = ?", [r.id]);
    if (check?.status === "running") claimed.push({ ...r, attempts: r.attempts + 1, status: "running" });
  }
  return claimed;
}

export async function completeJob(id: string) {
  await run("UPDATE jobs SET status = 'done', updated_at = ?, last_error = NULL WHERE id = ?", [toSql(new Date()), id]);
}

export async function failJob(job: Job, error: string): Promise<"retry" | "failed"> {
  const attempts = job.attempts + 1;
  if (attempts >= job.max_attempts) {
    await run("UPDATE jobs SET status = 'failed', last_error = ?, updated_at = ? WHERE id = ?", [error.slice(0, 500), toSql(new Date()), job.id]);
    return "failed";
  }
  const delay = BACKOFF_MINUTES[Math.min(attempts - 1, BACKOFF_MINUTES.length - 1)];
  await run("UPDATE jobs SET status = 'pending', last_error = ?, run_after = ?, updated_at = ? WHERE id = ?", [
    error.slice(0, 500),
    toSql(new Date(Date.now() + delay * 60_000)),
    toSql(new Date()),
    job.id,
  ]);
  return "retry";
}
