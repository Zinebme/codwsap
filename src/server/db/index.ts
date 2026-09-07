/**
 * Dual-backend data layer.
 *
 *   DB_DRIVER=postgres  -> real PostgreSQL (staging / production). Default when DATABASE_URL is set.
 *   DB_DRIVER=sqlite    -> embedded file DB, optional local-development convenience only.
 *
 * Parity decisions (deliberate, so ONE set of SQL strings serves both engines):
 *   - Timestamps are stored as `text` in the 'YYYY-MM-DD HH:MM:SS' UTC format produced by
 *     nowIso(). Lexicographic ordering equals chronological ordering, so range filters and
 *     substr(created_at,1,10) day-bucketing behave identically on both engines.
 *   - Boolean flags are stored as `integer` 0/1 on both engines, so `WHERE is_test = 0`
 *     and `? 1 : 0` bind params need no rewriting.
 *
 * The query surface is intentionally plain SQL with `?` placeholders; the Postgres driver
 * rewrites them to $1..$n. All APIs are async because node-postgres is async-only.
 */
import type { Pool as PgPool, PoolClient } from "pg";

export type Row = Record<string, unknown>;

export type Driver = "postgres" | "sqlite";

export function activeDriver(): Driver {
  const explicit = process.env.DB_DRIVER?.toLowerCase();
  if (explicit === "postgres" || explicit === "sqlite") return explicit;
  return process.env.DATABASE_URL ? "postgres" : "sqlite";
}

/* ------------------------------------------------------------------ *
 * Placeholder translation: `?` -> `$1`, ignoring ? inside string literals.
 * ------------------------------------------------------------------ */
export function toPgPlaceholders(sql: string): string {
  let out = "";
  let i = 0;
  let n = 0;
  let inSingle = false;
  let inDouble = false;
  while (i < sql.length) {
    const c = sql[i];
    if (inSingle) {
      out += c;
      if (c === "'") inSingle = sql[i + 1] === "'" ? (out += sql[++i], true) : false;
    } else if (inDouble) {
      out += c;
      if (c === '"') inDouble = false;
    } else if (c === "'") {
      inSingle = true;
      out += c;
    } else if (c === '"') {
      inDouble = true;
      out += c;
    } else if (c === "?") {
      out += `$${++n}`;
    } else {
      out += c;
    }
    i++;
  }
  return out;
}

/** SQLite-flavoured SQL fragments that need a Postgres spelling. */
function toPgDialect(sql: string): string {
  return sql
    .replace(/INSERT\s+OR\s+IGNORE\s+INTO/gi, "INSERT INTO")
    .replace(/INSERT\s+OR\s+REPLACE\s+INTO/gi, "INSERT INTO");
}

/** `INSERT OR IGNORE` has no direct Postgres form; append ON CONFLICT DO NOTHING. */
function needsOnConflictNothing(sql: string): boolean {
  return /INSERT\s+OR\s+IGNORE/i.test(sql) && !/ON\s+CONFLICT/i.test(sql);
}

function prepareSql(sql: string): string {
  let out = sql;
  const addConflict = needsOnConflictNothing(out);
  out = toPgDialect(out);
  if (addConflict) {
    // Insert before RETURNING if present, else append.
    out = /RETURNING/i.test(out)
      ? out.replace(/RETURNING/i, "ON CONFLICT DO NOTHING RETURNING")
      : `${out} ON CONFLICT DO NOTHING`;
  }
  return toPgPlaceholders(out);
}

/* ------------------------------------------------------------------ *
 * Async-local transaction / tenant context.
 * ------------------------------------------------------------------ */
type Ctx = { client: PoolClient };
let alsStore: { getStore(): Ctx | undefined; run<T>(s: Ctx, f: () => T): T } | null = null;

async function als() {
  if (!alsStore) {
    const { AsyncLocalStorage } = await import("node:async_hooks");
    alsStore = new AsyncLocalStorage<Ctx>();
  }
  return alsStore;
}

/* ------------------------------------------------------------------ *
 * Postgres backend
 * ------------------------------------------------------------------ */
let _pool: PgPool | null = null;

export async function pool(): Promise<PgPool> {
  if (_pool) return _pool;
  const pg = await import("pg");
  const { Pool } = pg;

  // PARITÉ SQLITE/POSTGRES : node-postgres renvoie bigint (int8, oid 20) et
  // numeric (oid 1700) sous forme de CHAÎNE pour préserver la précision.
  // COUNT(*) et SUM() sont des int8/numeric : sans cette conversion,
  // `total + row.c` concatène ("0" + "30" = "030") au lieu d'additionner,
  // et tous les KPI seraient silencieusement faux. Nos compteurs et montants
  // (centimes DZD) restent très en deçà de Number.MAX_SAFE_INTEGER.
  pg.types.setTypeParser(20, (v) => (v === null ? null : Number(v)));
  pg.types.setTypeParser(1700, (v) => (v === null ? null : Number(v)));

  // RUNTIME : toujours DATABASE_URL (pooler transactionnel Supabase en
  // serverless). MIGRATION_DATABASE_URL est réservé aux migrations et n'est
  // JAMAIS utilisé ici — voir scripts/migrate.ts.
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL est requis lorsque DB_DRIVER=postgres.");

  const needsSsl =
    process.env.PGSSL === "require" ||
    (/[?&]sslmode=require/.test(connectionString) && !/localhost|127\.0\.0\.1/.test(connectionString));

  // Un environnement serverless (Vercel) instancie BEAUCOUP de conteneurs, chacun
  // avec son propre pool. Un `max` élevé y épuise le pooler Supabase : on limite
  // donc à 1 connexion par instance par défaut, le vrai mutualisage étant assuré
  // par le pooler côté Supabase. En serveur long-vécu, on garde un pool normal.
  const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
  const max = Number(process.env.PGPOOL_MAX ?? (isServerless ? 1 : 10));

  _pool = new Pool({
    connectionString,
    max,
    // En serverless, garder des connexions oisives immobilise le pooler pour
    // rien : on les libère vite. Sinon, on conserve le comportement habituel.
    idleTimeoutMillis: isServerless ? 10_000 : 30_000,
    connectionTimeoutMillis: 10_000,
    ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
  });
  return _pool;
}

async function pgQuery<T>(sql: string, params: unknown[]): Promise<T[]> {
  const store = (await als()).getStore();
  const text = prepareSql(sql);
  if (store) {
    const res = await store.client.query(text, params as never[]);
    return res.rows as T[];
  }
  const p = await pool();
  const res = await p.query(text, params as never[]);
  return res.rows as T[];
}

/* ------------------------------------------------------------------ *
 * SQLite backend (optional local dev)
 * ------------------------------------------------------------------ */
type SqliteDb = {
  prepare(sql: string): { all(...p: unknown[]): unknown[]; get(...p: unknown[]): unknown; run(...p: unknown[]): unknown };
  exec(sql: string): unknown;
  pragma(s: string): unknown;
};
let _sqlite: SqliteDb | null = null;

async function sqlite(): Promise<SqliteDb> {
  if (_sqlite) return _sqlite;
  // better-sqlite3 est une dépendance OPTIONNELLE (module natif) : le mode
  // SQLite ne sert qu'au développement local. En staging/production
  // (DB_DRIVER=postgres) il n'est jamais chargé, donc un échec de compilation
  // native ne peut pas casser le déploiement.
  let Database: new (file: string) => unknown;
  try {
    // Nom de module calculé : empêche le bundler de tenter une résolution
    // statique (et d'émettre un avertissement) alors que le paquet est
    // optionnel et absent en production.
    const mod = "better-sqlite3";
    Database = ((await import(/* webpackIgnore: true */ mod)) as { default: unknown }).default as never;
  } catch {
    throw new Error(
      "Le driver SQLite (better-sqlite3) n'est pas installé. " +
        "Définissez DATABASE_URL et DB_DRIVER=postgres, ou installez les dépendances optionnelles pour le développement local.",
    );
  }
  const [fs, path] = await Promise.all([import("node:fs"), import("node:path")]);
  const file = process.env.DATABASE_FILE || path.join(process.cwd(), "data", "codwsap.db");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const instance = new Database(file) as unknown as SqliteDb;
  instance.pragma("journal_mode = WAL");
  instance.pragma("foreign_keys = ON");
  const schemaPath = path.join(process.cwd(), "src/server/db/schema.sql");
  if (fs.existsSync(schemaPath)) instance.exec(fs.readFileSync(schemaPath, "utf8"));
  _sqlite = instance;
  return instance;
}

/* ------------------------------------------------------------------ *
 * Public API
 * ------------------------------------------------------------------ */
export async function all<T = Row>(sql: string, params: unknown[] = []): Promise<T[]> {
  if (activeDriver() === "postgres") return await pgQuery<T>(sql, params);
  const db = await sqlite();
  return db.prepare(sql).all(...(params as never[])) as T[];
}

export async function get<T = Row>(sql: string, params: unknown[] = []): Promise<T | undefined> {
  if (activeDriver() === "postgres") {
    const rows = await pgQuery<T>(sql, params);
    return rows[0];
  }
  const db = await sqlite();
  return db.prepare(sql).get(...(params as never[])) as T | undefined;
}

export async function run(sql: string, params: unknown[] = []): Promise<void> {
  if (activeDriver() === "postgres") {
    await pgQuery(sql, params);
    return;
  }
  const db = await sqlite();
  db.prepare(sql).run(...(params as never[]));
}

/** Runs fn inside a single transaction (and a single pooled connection). */
export async function tx<T>(fn: () => Promise<T> | T): Promise<T> {
  if (activeDriver() !== "postgres") return await fn();
  const p = await pool();
  const client = await p.connect();
  const storage = await als();
  try {
    await client.query("BEGIN");
    const result = await storage.run({ client }, () => Promise.resolve(fn()));
    await client.query("COMMIT");
    return result;
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* connection already broken */
    }
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Runs fn with the PostgreSQL session bound to a user id, so RLS policies apply.
 * Used by the RLS test-suite and by any code path that must be defence-in-depth
 * protected at the database level.
 */
export async function withRlsUser<T>(userId: string | null, fn: () => Promise<T>): Promise<T> {
  if (activeDriver() !== "postgres") return fn();
  const p = await pool();
  const client = await p.connect();
  const storage = await als();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.current_user_id', $1, true)", [userId ?? ""]);
    const result = await storage.run({ client }, fn);
    await client.query("COMMIT");
    return result;
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    throw e;
  } finally {
    client.release();
  }
}

export async function closeDb(): Promise<void> {
  if (_pool) {
    await _pool.end();
    _pool = null;
  }
  _sqlite = null;
}

export function uid(prefix = ""): string {
  const s = crypto.randomUUID();
  return prefix ? `${prefix}_${s.slice(0, 18).replace(/-/g, "")}` : s;
}

export function nowIso(): string {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}
