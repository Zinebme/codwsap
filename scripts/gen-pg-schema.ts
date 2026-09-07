/**
 * Generates supabase/migrations/0001_schema.sql from the canonical
 * src/server/db/schema.sql so the two dialects can never drift.
 *
 * Parity rules (see src/server/db/index.ts):
 *   - timestamps stay `text` ('YYYY-MM-DD HH:MM:SS' UTC) -> ordering and
 *     substr(created_at,1,10) behave identically on both engines
 *   - boolean flags stay `integer` 0/1 -> `WHERE is_test = 0` needs no rewrite
 * Only genuinely incompatible syntax is translated.
 */
import fs from "node:fs";

const src = fs.readFileSync("src/server/db/schema.sql", "utf8");

const seedMarker = "-- Default plans";
const seedIdx = src.indexOf(seedMarker);
const body = seedIdx === -1 ? src : src.slice(0, seedIdx);
const seed = seedIdx === -1 ? "" : src.slice(seedIdx);

let out = body;

// Strip SQLite pragmas and the SQLite-specific header comment.
out = out.replace(/^PRAGMA[^\n]*\n/gm, "");
out = out.replace(
  /^-- Portable core schema[\s\S]*?same indexes\.\n/m,
  "",
);

// datetime('now') -> now() rendered in the shared text timestamp format.
out = out.replace(/\(datetime\('now'\)\)/g, "(to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'))");

// Types: keep semantics identical, just lowercase Postgres spellings.
out = out.replace(/\bTEXT\b/g, "text");
out = out.replace(/\bINTEGER\b/g, "integer");
out = out.replace(/\bREAL\b/g, "double precision");

const header = `-- CODWSAP — schéma PostgreSQL (staging / production).
--
-- GÉNÉRÉ AUTOMATIQUEMENT depuis src/server/db/schema.sql — ne pas éditer à la main.
--   npm run db:gen-schema
--
-- Choix de parité assumés pour qu'un seul jeu de requêtes SQL serve les deux moteurs :
--   * les horodatages restent en 'text' au format 'YYYY-MM-DD HH:MM:SS' (UTC) :
--     l'ordre lexicographique = l'ordre chronologique, et substr(created_at,1,10)
--     découpe les journées de façon identique ;
--   * les drapeaux booléens restent en 'integer' 0/1, donc "WHERE is_test = 0"
--     et les binds "? 1 : 0" fonctionnent sans réécriture.
-- Les politiques RLS sont dans 0002_rls.sql.

`;

const seedSql = seed
  ? seed
      .replace(/INSERT OR IGNORE INTO plans/g, "INSERT INTO plans")
      .replace(/;\s*$/, "\nON CONFLICT (code) DO NOTHING;\n")
  : "";

fs.mkdirSync("supabase/migrations", { recursive: true });
fs.writeFileSync("supabase/migrations/0001_schema.sql", header + out.trimStart() + "\n" + seedSql);
console.log("supabase/migrations/0001_schema.sql régénéré.");
