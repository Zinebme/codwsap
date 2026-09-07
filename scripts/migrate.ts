/**
 * Applique les migrations PostgreSQL dans l'ordre lexicographique.
 *
 *   npm run db:migrate
 *
 * - idempotent : chaque fichier appliqué est enregistré dans schema_migrations ;
 * - transactionnel par fichier : une migration qui échoue est annulée entièrement ;
 * - sûr au démarrage : plusieurs instances peuvent démarrer en parallèle, un verrou
 *   consultatif PostgreSQL sérialise l'exécution.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { Pool } from "pg";

const DIR = path.join(process.cwd(), "supabase", "migrations");
const LOCK_KEY = 918_273_645;

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL est requis pour exécuter les migrations.");
    process.exit(1);
  }

  const needsSsl =
    process.env.PGSSL === "require" ||
    (/[?&]sslmode=require/.test(connectionString) && !/localhost|127\.0\.0\.1/.test(connectionString));

  const pool = new Pool({
    connectionString,
    ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
    max: 1,
  });
  const client = await pool.connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename text PRIMARY KEY,
        checksum text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await client.query("SELECT pg_advisory_lock($1)", [LOCK_KEY]);

    const files = fs.readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort();
    if (!files.length) {
      console.log("Aucune migration trouvée.");
      return;
    }

    const { rows } = await client.query<{ filename: string; checksum: string }>(
      "SELECT filename, checksum FROM schema_migrations",
    );
    const applied = new Map(rows.map((r) => [r.filename, r.checksum]));

    let count = 0;
    for (const file of files) {
      const sql = fs.readFileSync(path.join(DIR, file), "utf8");
      const checksum = crypto.createHash("sha256").update(sql).digest("hex").slice(0, 16);
      const previous = applied.get(file);

      if (previous) {
        if (previous !== checksum) {
          console.warn(`  ! ${file} a changé depuis son application (${previous} -> ${checksum}).`);
          console.warn("    Créez une nouvelle migration plutôt que de modifier une migration appliquée.");
        } else {
          console.log(`  = ${file} (déjà appliquée)`);
        }
        continue;
      }

      process.stdout.write(`  + ${file} ... `);
      try {
        await client.query("BEGIN");
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations (filename, checksum) VALUES ($1, $2)", [file, checksum]);
        await client.query("COMMIT");
        console.log("ok");
        count++;
      } catch (e) {
        await client.query("ROLLBACK");
        console.log("ÉCHEC");
        throw e;
      }
    }
    console.log(count ? `${count} migration(s) appliquée(s).` : "Base déjà à jour.");
  } finally {
    try {
      await client.query("SELECT pg_advisory_unlock($1)", [LOCK_KEY]);
    } catch {
      /* ignore */
    }
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error("Migration échouée :", e instanceof Error ? e.message : e);
  process.exit(1);
});
