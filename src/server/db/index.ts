import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

/**
 * Embedded portable driver.
 * Production target is Postgres/Supabase (see supabase/migrations) — the query
 * surface used by the app is intentionally plain SQL so it can be swapped for
 * a pg pool without touching business logic.
 */

const DB_PATH = process.env.DATABASE_FILE || path.join(process.cwd(), "data", "codwsap.db");

let _db: Database.Database | null = null;

export function db(): Database.Database {
  if (_db) return _db;
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const instance = new Database(DB_PATH);
  instance.pragma("journal_mode = WAL");
  instance.pragma("foreign_keys = ON");
  const schema = fs.readFileSync(path.join(process.cwd(), "src/server/db/schema.sql"), "utf8");
  instance.exec(schema);
  _db = instance;
  return instance;
}

export type Row = Record<string, unknown>;

export function all<T = Row>(sql: string, params: unknown[] = []): T[] {
  return db().prepare(sql).all(...(params as never[])) as T[];
}

export function get<T = Row>(sql: string, params: unknown[] = []): T | undefined {
  return db().prepare(sql).get(...(params as never[])) as T | undefined;
}

export function run(sql: string, params: unknown[] = []) {
  return db().prepare(sql).run(...(params as never[]));
}

export function tx<T>(fn: () => T): T {
  const d = db();
  const wrapped = d.transaction(fn);
  return wrapped();
}

export function uid(prefix = ""): string {
  const s = crypto.randomUUID();
  return prefix ? `${prefix}_${s.slice(0, 18).replace(/-/g, "")}` : s;
}

export function nowIso(): string {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}
