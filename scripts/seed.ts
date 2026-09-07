/**
 * Development seed: creates a super admin, one demo merchant with a team,
 * a sandbox delivery connector and a batch of realistic COD orders.
 *
 *   npm run seed
 *
 * Safe to re-run: existing rows are reused, orders are appended.
 */
import { all, get, run, uid, nowIso } from "../src/server/db";
import { hashPassword } from "../src/server/auth/session";
import { createOrder } from "../src/server/services/orders";
import { seedTemplates } from "../src/server/services/seedTemplates";
import { seedAutomations } from "../src/server/services/automations";
import { encryptSecret } from "../src/server/crypto";
import { WILAYAS, ORDER_STATUSES } from "../src/lib/domain";

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "admin@codwsap.app";
const MERCHANT_EMAIL = process.env.SEED_MERCHANT_EMAIL ?? "demo@codwsap.app";
const PASSWORD = process.env.SEED_PASSWORD ?? "codwsap2026";

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
  const existing = get<{ id: string }>("SELECT id FROM users WHERE email = ?", [email]);
  if (existing) return existing.id;
  const id = uid("usr");
  run("INSERT INTO users (id, email, password_hash, full_name, is_super_admin) VALUES (?,?,?,?,?)", [
    id,
    email,
    await hashPassword(PASSWORD),
    fullName,
    superAdmin ? 1 : 0,
  ]);
  return id;
}

async function main() {
  await ensureUser(ADMIN_EMAIL, "Super Admin", true);

  const ownerId = await ensureUser(MERCHANT_EMAIL, "Amine Benali");
  let merchant = get<{ id: string }>("SELECT id FROM merchants WHERE email = ?", [MERCHANT_EMAIL]);
  if (!merchant) {
    const id = uid("mch");
    run(
      `INSERT INTO merchants (id, name, slug, status, plan_code, phone, email, wilaya, address, locale, onboarding_step, onboarding_completed_at)
       VALUES (?,?,?, 'active', 'starter', ?, ?, ?, ?, 'fr', 8, ?)`,
      [id, "Boutique Démo DZ", "boutique-demo-dz", "0550112233", MERCHANT_EMAIL, "Alger", "Rue Didouche Mourad, Alger", nowIso()],
    );
    run("INSERT INTO merchant_users (id, merchant_id, user_id, role, status, invited_email) VALUES (?,?,?, 'owner', 'active', ?)", [uid("mus"), id, ownerId, MERCHANT_EMAIL]);
    run("INSERT INTO subscriptions (id, merchant_id, plan_code, status) VALUES (?,?, 'starter', 'active')", [uid("sub"), id]);
    merchant = { id };
  }
  const merchantId = merchant.id;

  // Team
  const agentId = await ensureUser("agent@codwsap.app", "Nadia Haddad");
  if (!get("SELECT id FROM merchant_users WHERE merchant_id = ? AND user_id = ?", [merchantId, agentId])) {
    run("INSERT INTO merchant_users (id, merchant_id, user_id, role, status, invited_email) VALUES (?,?,?, 'agent', 'active', ?)", [uid("mus"), merchantId, agentId, "agent@codwsap.app"]);
  }

  seedTemplates(merchantId);
  seedAutomations(merchantId);

  // Sandbox transporter so tracking flows are demoable without real credentials.
  if (!get("SELECT id FROM delivery_connections WHERE merchant_id = ? AND provider = 'sandbox'", [merchantId])) {
    run(
      `INSERT INTO delivery_connections (id, merchant_id, provider, label, status, is_default, credentials_encrypted, last_sync_at)
       VALUES (?,?, 'sandbox', 'Transporteur de test', 'connected', 1, ?, ?)`,
      [uid("dlc"), merchantId, encryptSecret({ api_key: "sandbox" }), nowIso()],
    );
  }

  const existingOrders = get<{ c: number }>("SELECT COUNT(*) AS c FROM orders WHERE merchant_id = ?", [merchantId])?.c ?? 0;
  const target = Number(process.env.SEED_ORDERS ?? 60);
  const toCreate = Math.max(0, target - existingOrders);

  for (let i = 0; i < toCreate; i++) {
    const product = pick(PRODUCTS);
    const qty = 1 + (i % 3 === 0 ? 1 : 0);
    const delivery = pick([400, 500, 600, 800]);
    const res = createOrder({
      merchantId,
      customerName: `${pick(FIRST)} ${pick(LAST)}`,
      phone: phone(i),
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

    // Spread orders over the last 30 days and give them a plausible lifecycle status.
    const daysAgo = Math.floor(Math.random() * 30);
    const created = new Date(Date.now() - daysAgo * 864e5 - Math.floor(Math.random() * 20) * 36e5).toISOString().replace("T", " ").slice(0, 19);
    const status = daysAgo > 20
      ? pick(["delivered", "delivered", "delivered", "returned", "delivery_failed"] as const)
      : daysAgo > 8
        ? pick(["shipped", "in_transit", "at_office", "out_for_delivery", "delivered", "returned"] as const)
        : pick(["new", "awaiting_confirmation", "confirmed", "no_response", "cancelled_by_customer", "preparing"] as const);
    run("UPDATE orders SET created_at = ?, order_date = ?, status = ?, updated_at = ? WHERE id = ?", [created, created.slice(0, 10), status, created, res.id]);
  }

  const counts = all<{ status: string; c: number }>("SELECT status, COUNT(*) AS c FROM orders WHERE merchant_id = ? GROUP BY status", [merchantId]);
  console.log("Seed terminé.");
  console.log(`  Super admin : ${ADMIN_EMAIL} / ${PASSWORD}`);
  console.log(`  Marchand    : ${MERCHANT_EMAIL} / ${PASSWORD}`);
  console.log(`  Agent       : agent@codwsap.app / ${PASSWORD}`);
  console.log(`  Commandes   : ${counts.reduce((s, r) => s + r.c, 0)} (${counts.map((c) => `${c.status}:${c.c}`).join(", ")})`);
  console.log(`  Statuts pris en charge : ${ORDER_STATUSES.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
