/**
 * Crée (ou promeut) un super administrateur — remplace l'ancien seed
 * `admin@codwsap.app` / mot de passe prévisible.
 *
 *   npm run admin:create -- --email vous@domaine.tld
 *   npm run admin:create -- --email vous@domaine.tld --password '…'
 *
 * Sans --password, un mot de passe fort est généré et affiché UNE seule fois.
 * Aucun compte administrateur n'est jamais créé automatiquement.
 */
import crypto from "node:crypto";
import { get, run, uid, closeDb } from "../src/server/db";
import { hashPassword } from "../src/server/auth/session";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

async function main() {
  const email = (arg("email") ?? "").trim().toLowerCase();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    console.error("Usage : npm run admin:create -- --email vous@domaine.tld [--password '…']");
    process.exit(1);
  }

  const provided = arg("password");
  if (provided && provided.length < 12) {
    console.error("Le mot de passe doit contenir au moins 12 caractères.");
    process.exit(1);
  }
  const password = provided ?? crypto.randomBytes(15).toString("base64url");
  const name = arg("name") ?? "Super Admin";

  const existing = await get<{ id: string; is_super_admin: number }>(
    "SELECT id, is_super_admin FROM users WHERE email = ?",
    [email],
  );

  if (existing) {
    await run("UPDATE users SET is_super_admin = 1, password_hash = ?, full_name = ? WHERE id = ?", [
      await hashPassword(password),
      name,
      existing.id,
    ]);
    console.log(`\nCompte existant promu super administrateur : ${email}`);
  } else {
    await run(
      "INSERT INTO users (id, email, password_hash, full_name, is_super_admin) VALUES (?,?,?,?,1)",
      [uid("usr"), email, await hashPassword(password), name],
    );
    console.log(`\nSuper administrateur créé : ${email}`);
  }

  if (provided) {
    console.log("Mot de passe : celui que vous avez fourni.");
  } else {
    console.log("──────────────────────────────────────────────────────");
    console.log(`Mot de passe (affiché UNE seule fois) : ${password}`);
    console.log("──────────────────────────────────────────────────────");
    console.log("Notez-le maintenant, puis changez-le après la première connexion.");
  }
  console.log("");

  await closeDb();
}

main().catch(async (e) => {
  console.error(e instanceof Error ? e.message : e);
  await closeDb().catch(() => {});
  process.exit(1);
});
