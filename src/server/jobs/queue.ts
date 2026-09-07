import "server-only";
import { all, get, run, uid } from "@/server/db";

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

export function enqueueJob(params: {
  merchantId?: string | null;
  type: JobType;
  payload?: unknown;
  runAfter?: Date;
  maxAttempts?: number;
}): string {
  const id = uid("job");
  run(
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

export function claimJobs(limit = 20): Job[] {
  const now = toSql(new Date());
  const rows = all<Job>(
    `SELECT * FROM jobs WHERE status = 'pending' AND run_after <= ? ORDER BY run_after LIMIT ?`,
    [now, limit],
  );
  for (const r of rows) {
    run("UPDATE jobs SET status = 'running', attempts = attempts + 1, updated_at = ? WHERE id = ? AND status = 'pending'", [now, r.id]);
  }
  return rows.filter((r) => get<{ status: string }>("SELECT status FROM jobs WHERE id = ?", [r.id])?.status === "running");
}

export function completeJob(id: string) {
  run("UPDATE jobs SET status = 'done', updated_at = ?, last_error = NULL WHERE id = ?", [toSql(new Date()), id]);
}

export function failJob(job: Job, error: string): "retry" | "failed" {
  const attempts = job.attempts + 1;
  if (attempts >= job.max_attempts) {
    run("UPDATE jobs SET status = 'failed', last_error = ?, updated_at = ? WHERE id = ?", [error.slice(0, 500), toSql(new Date()), job.id]);
    return "failed";
  }
  const delay = BACKOFF_MINUTES[Math.min(attempts - 1, BACKOFF_MINUTES.length - 1)];
  run("UPDATE jobs SET status = 'pending', last_error = ?, run_after = ?, updated_at = ? WHERE id = ?", [
    error.slice(0, 500),
    toSql(new Date(Date.now() + delay * 60_000)),
    toSql(new Date()),
    job.id,
  ]);
  return "retry";
}
