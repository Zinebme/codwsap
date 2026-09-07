/**
 * Jeu de données de démonstration.
 *
 *   npm run seed            (refusé hors développement/test)
 *   ALLOW_SEED=true npm run seed
 *
 * SÉCURITÉ — règles appliquées ici :
 *   - refus pur et simple si APP_ENV/NODE_ENV vaut production ou staging,
 *     sauf ALLOW_SEED=true explicite ;
 *   - AUCUN identifiant prévisible : les mots de passe sont générés
 *     aléatoirement et affichés une seule fois, sauf si SEED_PASSWORD est
 *     fourni volontairement (utile pour les tests automatisés) ;
 *   - aucun compte super admin n'est créé sauf SEED_SUPER_ADMIN=true.
 */
import crypto from "node:crypto";
import { all, get, run, uid, nowIso, closeDb } from "../src/server/db";
import { hashPassword } from "../src/server/auth/session";
import { createOrder } from "../src/server/services/orders";
import { seedTemplates } from "../src/server/services/seedTemplates";
import { seedAutomations } from "../src/server/services/automations";
import { encryptSecret } from "../src/server/crypto";
import { WILAYAS, ORDER_STATUSES } from "../src/lib/domain";

const APP_ENV = (process.env.APP_ENV ?? process.env.NODE_ENV ?? "development").toLowerCase();
const PROTECTED_ENVS = ["production", "staging"];
const ALLOW_SEED = process.env.ALLOW_SEED === "true";

if (PROTECTED_ENVS.includes(APP_ENV) && !ALLOW_SEED) {
  console.error(
    `Refus : le seed est désactivé quand APP_ENV="${APP_ENV}".\n` +
      "Ne peuplez jamais un environnement public avec des comptes de démonstration.\n" +
      "Si c'est réellement voulu (base de staging jetable), relancez avec ALLOW_SEED=true.",
  );
  process.exit(1);
}

/** Mot de passe fort aléatoire : jamais de valeur devinable par défaut. */
function generatePassword(): string {
  return crypto.randomBytes(15).toString("base64url");
}

const MERCHANT_EMAIL = process.env.SEED_MERCHANT_EMAIL ?? "demo@example.test";
const SECOND_MERCHANT_EMAIL = process.env.SEED_MERCHANT2_EMAIL ?? "demo2@example.test";
const AGENT_EMAIL = process.env.SEED_AGENT_EMAIL ?? "agent@example.test";
const WANT_SUPER_ADMIN = process.env.SEED_SUPER_ADMIN === "true";
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "";

// Un mot de passe explicite n'est accepté que pour les tests automatisés.
const EXPLICIT_PASSWORD = process.env.SEED_PASSWORD;
const PASSWORD = EXPLICIT_PASSWORD ?? generatePassword();

const FIRST = ["Amine", "Sofia", "Yacine", "Nadia", "Karim", "Lila", "Bilal", "Imene", "Riad", "Wassila", "Mehdi", "Sara"];
const LAST = ["Benali", "Haddad", "Mokrani", "Bouzid", "Cherif", "Zerrouki", "Amrani", "Belkacem", "Saidi", "Meziane"];
const PRODUCTS = [
  { name: "Montre connectée Series 8", price: 6900 },
  { name: "Écouteurs sans fil Pro", price: 3900 },
  { name: "Sac à main cuir", price: 5400 },
  { name: "Parfum oriental 100 ml", price: 4200 },
  { name: "Robot pâtissier compact", price: 12900 },
  { name: "Baskets running", price: 5900 },
];

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
function phone(i: number) {
  return `0${pick([5, 6, 7])}${String(10_000_000 + ((i * 733_337) % 89_999_999)).slice(0, 8)}`;
}

async function ensureUser(email: string, fullName: string, superAdmin = false) {
  const existing = await get<{ id: string }>("SELECT id FROM users WHERE email = ?", [email]);
  if (existing) return existing.id;
  const id = uid("usr");
  await run("INSERT INTO users (id, email, password_hash, full_name, is_super_admin) VALUES (?,?,?,?,?)", [
    id,
    email,
    await hashPassword(PASSWORD),
    fullName,
    superAdmin ? 1 : 0,
  ]);
  return id;
}

/** Crée un marchand complet (équipe, templates, automatisations, transporteur, commandes). */
async function seedMerchant(opts: {
  email: string;
  name: string;
  slug: string;
  ownerName: string;
  phone: string;
  wilaya: string;
  orders: number;
  withAgent?: boolean;
}): Promise<{ merchantId: string; ownerId: string }> {
  const ownerId = await ensureUser(opts.email, opts.ownerName);
  let merchant = await get<{ id: string }>("SELECT id FROM merchants WHERE email = ?", [opts.email]);
  if (!merchant) {
    const id = uid("mch");
    await run(
      `INSERT INTO merchants (id, name, slug, status, plan_code, phone, email, wilaya, address, locale, onboarding_step, onboarding_completed_at)
       VALUES (?,?,?, 'active', 'starter', ?, ?, ?, ?, 'fr', 8, ?)`,
      [id, opts.name, opts.slug, opts.phone, opts.email, opts.wilaya, "Adresse de démonstration", nowIso()],
    );
    await run("INSERT INTO merchant_users (id, merchant_id, user_id, role, status, invited_email) VALUES (?,?,?, 'owner', 'active', ?)", [uid("mus"), id, ownerId, opts.email]);
    await run("INSERT INTO subscriptions (id, merchant_id, plan_code, status) VALUES (?,?, 'starter', 'active')", [uid("sub"), id]);
    merchant = { id };
  }
  const merchantId = merchant.id;

  if (opts.withAgent) {
    const agentId = await ensureUser(AGENT_EMAIL, "Nadia Haddad");
    if (!(await get("SELECT id FROM merchant_users WHERE merchant_id = ? AND user_id = ?", [merchantId, agentId]))) {
      await run("INSERT INTO merchant_users (id, merchant_id, user_id, role, status, invited_email) VALUES (?,?,?, 'agent', 'active', ?)", [uid("mus"), merchantId, agentId, AGENT_EMAIL]);
    }
  }

  await seedTemplates(merchantId);
  await seedAutomations(merchantId);

  // Transporteur "sandbox" : permet de démontrer le suivi sans identifiants réels.
  if (!(await get("SELECT id FROM delivery_connections WHERE merchant_id = ? AND provider = 'sandbox'", [merchantId]))) {
    await run(
      `INSERT INTO delivery_connections (id, merchant_id, provider, label, status, is_default, credentials_encrypted, last_sync_at)
       VALUES (?,?, 'sandbox', 'Transporteur de test', 'connected', 1, ?, ?)`,
      [uid("dlc"), merchantId, encryptSecret({ api_key: "sandbox" }), nowIso()],
    );
  }

  const existingOrders = Number((await get<{ c: number }>("SELECT COUNT(*) AS c FROM orders WHERE merchant_id = ?", [merchantId]))?.c ?? 0);
  const toCreate = Math.max(0, opts.orders - existingOrders);

  for (let i = 0; i < toCreate; i++) {
    const product = pick(PRODUCTS);
    const qty = 1 + (i % 3 === 0 ? 1 : 0);
    const delivery = pick([400, 500, 600, 800]);
    const res = await createOrder({
      merchantId,
      customerName: `${pick(FIRST)} ${pick(LAST)}`,
      phone: phone(i + opts.slug.length * 17),
      wilaya: pick(WILAYAS),
      commune: pick(["Centre", "Bab Ezzouar", "Hydra", "El Harrach", "Kouba", "Birkhadem"]),
      address: "Cité 200 logements, bâtiment B",
      deliveryType: Math.random() > 0.4 ? "home" : "office",
      productsPrice: product.price * qty,
      deliveryPrice: delivery,
      items: [{ product_name: product.name, variant: pick(["Noir", "Bleu", "Taille M", "Taille L"]), quantity: qty, unit_price: product.price }],
      source: pick(["manual", "google_sheets", "webhook", "api"]),
      isTest: false,
    });

    const daysAgo = Math.floor(Math.random() * 30);
    const created = new Date(Date.now() - daysAgo * 864e5 - Math.floor(Math.random() * 20) * 36e5).toISOString().replace("T", " ").slice(0, 19);
    const status = daysAgo > 20
      ? pick(["delivered", "delivered", "delivered", "returned", "delivery_failed"] as const)
      : daysAgo > 8
        ? pick(["shipped", "in_transit", "at_office", "out_for_delivery", "delivered", "returned"] as const)
        : pick(["new", "awaiting_confirmation", "confirmed", "no_response", "cancelled_by_customer", "preparing"] as const);
    await run("UPDATE orders SET created_at = ?, order_date = ?, status = ?, updated_at = ? WHERE id = ?", [created, created.slice(0, 10), status, created, res.id]);
  }

  return { merchantId, ownerId };
}

async function main() {
  const orders = Number(process.env.SEED_ORDERS ?? 60);

  // Deux marchands : indispensable pour prouver l'isolation multi-tenant.
  const a = await seedMerchant({
    email: MERCHANT_EMAIL,
    name: "Boutique Démo DZ",
    slug: "boutique-demo-dz",
    ownerName: "Amine Benali",
    phone: "0550112233",
    wilaya: "Alger",
    orders,
    withAgent: true,
  });
  const b = await seedMerchant({
    email: SECOND_MERCHANT_EMAIL,
    name: "Concept Store Oran",
    slug: "concept-store-oran",
    ownerName: "Sofia Mokrani",
    phone: "0660445566",
    wilaya: "Oran",
    orders: Math.max(10, Math.floor(orders / 3)),
  });

  let adminEmail: string | null = null;
  if (WANT_SUPER_ADMIN) {
    if (!ADMIN_EMAIL) {
      console.error("SEED_SUPER_ADMIN=true nécessite SEED_ADMIN_EMAIL=<votre email>.");
      process.exit(1);
    }
    await ensureUser(ADMIN_EMAIL, "Super Admin", true);
    adminEmail = ADMIN_EMAIL;
  }

  const counts = await all<{ status: string; c: number }>(
    "SELECT status, COUNT(*) AS c FROM orders WHERE merchant_id = ? GROUP BY status",
    [a.merchantId],
  );

  console.log("\nSeed terminé.");
  console.log("──────────────────────────────────────────────");
  console.log(`  Marchand A : ${MERCHANT_EMAIL}`);
  console.log(`  Marchand B : ${SECOND_MERCHANT_EMAIL}`);
  console.log(`  Agent (A)  : ${AGENT_EMAIL}`);
  if (adminEmail) console.log(`  Super admin: ${adminEmail}`);
  else console.log("  Super admin: non créé (SEED_SUPER_ADMIN=true + SEED_ADMIN_EMAIL pour en créer un)");
  console.log("──────────────────────────────────────────────");
  if (EXPLICIT_PASSWORD) {
    console.log("  Mot de passe : celui fourni via SEED_PASSWORD.");
  } else {
    console.log(`  Mot de passe (généré, affiché UNE seule fois) : ${PASSWORD}`);
  }
  console.log("──────────────────────────────────────────────");
  console.log(`  Commandes marchand A : ${counts.reduce((s, r) => s + Number(r.c), 0)}`);
  console.log(`  Statuts pris en charge : ${ORDER_STATUSES.length}`);
  console.log(`  Marchand B (pour les tests d'isolation) : ${b.merchantId}\n`);

  await closeDb();
}

main().catch(async (e) => {
  console.error(e);
  await closeDb().catch(() => {});
  process.exit(1);
});
