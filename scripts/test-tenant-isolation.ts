/**
 * Tests d'isolation multi-tenant — DEUX marchands réels, PostgreSQL réel.
 *
 *   npm run test:isolation
 *
 * Deux couches sont vérifiées indépendamment :
 *
 *   COUCHE 1 — filtrage applicatif (HTTP)
 *     Le marchand A, authentifié par un vrai cookie de session, tente de lire et
 *     de modifier les ressources du marchand B via l'API HTTP réelle :
 *     commandes, clients, messages WhatsApp, intégrations, paramètres.
 *     Attendu : 404/403 et AUCUNE donnée de B dans les listes de A.
 *
 *   COUCHE 2 — RLS PostgreSQL
 *     Les mêmes tentatives sont rejouées en SQL direct, via le rôle restreint
 *     `codwsap_tenant` (non propriétaire, donc soumis à la RLS), avec
 *     app.current_user_id positionné sur le propriétaire de A.
 *     Attendu : 0 ligne de B visible, UPDATE/DELETE sans effet.
 *
 * Le processus se termine avec un code non nul dès qu'une assertion échoue.
 */
import { Pool } from "pg";

type Check = { name: string; layer: "app" | "rls" | "authz"; ok: boolean; detail: string };
const results: Check[] = [];

function record(layer: Check["layer"], name: string, ok: boolean, detail = "") {
  results.push({ name, layer, ok, detail });
  const tag = ok ? "  \x1b[32mPASS\x1b[0m" : "  \x1b[31mFAIL\x1b[0m";
  console.log(`${tag}  [${layer}] ${name}${detail ? ` — ${detail}` : ""}`);
}

const BASE = process.env.TEST_BASE_URL ?? "http://127.0.0.1:3000";
const DATABASE_URL = process.env.DATABASE_URL;
const TENANT_URL = process.env.TENANT_DATABASE_URL;

/* ------------------------------------------------------------------ */
/* Helpers HTTP                                                        */
/* ------------------------------------------------------------------ */
async function login(email: string, password: string): Promise<string> {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`Connexion impossible pour ${email} : HTTP ${res.status}`);
  const raw = res.headers.getSetCookie?.() ?? [];
  const cookie = raw.map((c) => c.split(";")[0]).join("; ");
  if (!cookie) throw new Error("Aucun cookie de session renvoyé.");
  return cookie;
}

async function api(cookie: string, path: string, init: RequestInit = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", cookie, ...(init.headers ?? {}) },
  });
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* réponse sans corps JSON */
  }
  return { status: res.status, body: body as Record<string, unknown> | null };
}

/* ------------------------------------------------------------------ */
async function main() {
  if (!DATABASE_URL) {
    console.error("DATABASE_URL est requis.");
    process.exit(1);
  }

  const admin = new Pool({ connectionString: DATABASE_URL, max: 3 });

  // --- Repérage des deux marchands et de leurs propriétaires -------------
  const { rows: merchants } = await admin.query<{ id: string; name: string; email: string }>(
    "SELECT id, name, email FROM merchants ORDER BY created_at LIMIT 2",
  );
  if (merchants.length < 2) {
    console.error("Ce test exige au moins 2 marchands. Lancez le seed d'abord.");
    process.exit(1);
  }
  const [A, B] = merchants;

  const ownerOf = async (merchantId: string) => {
    const { rows } = await admin.query<{ user_id: string; email: string }>(
      `SELECT mu.user_id, u.email FROM merchant_users mu JOIN users u ON u.id = mu.user_id
       WHERE mu.merchant_id = $1 AND mu.role = 'owner' LIMIT 1`,
      [merchantId],
    );
    return rows[0];
  };
  const ownerA = await ownerOf(A.id);
  const ownerB = await ownerOf(B.id);

  console.log(`\nMarchand A : ${A.name} (${A.id})`);
  console.log(`Marchand B : ${B.name} (${B.id})\n`);

  // --- Ressources de B utilisées comme cibles ---------------------------
  const pickOne = async (sql: string, id: string) => (await admin.query(sql, [id])).rows[0] as Record<string, string> | undefined;

  const orderB = await pickOne("SELECT id, reference FROM orders WHERE merchant_id = $1 LIMIT 1", B.id);
  const customerB = await pickOne("SELECT id, full_name FROM customers WHERE merchant_id = $1 LIMIT 1", B.id);
  const orderA = await pickOne("SELECT id FROM orders WHERE merchant_id = $1 LIMIT 1", A.id);

  // Garantit l'existence d'un message WhatsApp et d'une intégration côté B.
  await admin.query(
    `INSERT INTO whatsapp_messages (id, merchant_id, direction, body, status, created_at)
     VALUES ($1, $2, 'outbound', 'Message privé du marchand B', 'sent',
             to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'))
     ON CONFLICT (id) DO NOTHING`,
    [`msg_isolation_b`, B.id],
  );
  await admin.query(
    `INSERT INTO integrations (id, merchant_id, kind, label, status)
     VALUES ($1, $2, 'telegram', 'Telegram B', 'connected')
     ON CONFLICT (id) DO NOTHING`,
    [`int_isolation_b`, B.id],
  );

  /* ================================================================== */
  /* COUCHE 1 — filtrage applicatif via HTTP                            */
  /* ================================================================== */
  console.log("── Couche 1 : filtrage applicatif (API HTTP) ───────────────");

  const password = process.env.TEST_PASSWORD;
  if (!password) {
    console.error("TEST_PASSWORD est requis (mot de passe du seed de test).");
    process.exit(1);
  }

  const cookieA = await login(ownerA.email, password);

  // 1. Les listes de A ne contiennent aucune donnée de B.
  const ordersList = await api(cookieA, "/api/orders?pageSize=100");
  const rows = (ordersList.body?.rows as { merchant_id?: string; id: string }[] | undefined) ?? [];
  const leakedOrders = rows.filter((r) => r.merchant_id && r.merchant_id !== A.id);
  record("app", "GET /api/orders ne renvoie que les commandes de A", leakedOrders.length === 0,
    leakedOrders.length ? `${leakedOrders.length} ligne(s) étrangère(s)` : `${rows.length} lignes, toutes A`);

  const customersList = await api(cookieA, "/api/customers?pageSize=100");
  const custRows = (customersList.body?.rows as { merchant_id?: string }[] | undefined) ?? [];
  const leakedCustomers = custRows.filter((r) => r.merchant_id && r.merchant_id !== A.id);
  record("app", "GET /api/customers ne renvoie que les clients de A", leakedCustomers.length === 0,
    `${custRows.length} lignes`);

  const logs = await api(cookieA, "/api/whatsapp/logs?pageSize=100");
  const logRows = (logs.body?.rows as { merchant_id?: string }[] | undefined) ?? [];
  const leakedLogs = logRows.filter((r) => r.merchant_id && r.merchant_id !== A.id);
  record("app", "GET /api/whatsapp/logs ne renvoie que les messages de A", leakedLogs.length === 0,
    `${logRows.length} lignes`);

  const integrations = await api(cookieA, "/api/integrations");
  const integrationsText = JSON.stringify(integrations.body ?? {});
  record("app", "GET /api/integrations ne fuit pas l'intégration de B",
    !integrationsText.includes("int_isolation_b") && !integrationsText.includes("Telegram B"));

  const settings = await api(cookieA, "/api/settings");
  const settingsMerchant = (settings.body?.merchant as { id?: string } | undefined)?.id;
  record("app", "GET /api/settings renvoie le marchand A uniquement", settingsMerchant === A.id,
    `merchant=${settingsMerchant}`);

  // 2. Lecture directe d'une ressource de B -> 404.
  if (orderB) {
    const r = await api(cookieA, `/api/orders/${orderB.id}`);
    record("app", "GET /api/orders/{id de B} refusé", r.status === 404 || r.status === 403, `HTTP ${r.status}`);
  }
  if (customerB) {
    const r = await api(cookieA, `/api/customers/${customerB.id}`);
    record("app", "GET /api/customers/{id de B} refusé", r.status === 404 || r.status === 403, `HTTP ${r.status}`);
  }

  // 3. Écriture sur une ressource de B -> refusée ET sans effet en base.
  if (orderB) {
    const before = await admin.query<{ status: string }>("SELECT status FROM orders WHERE id = $1", [orderB.id]);
    const r = await api(cookieA, `/api/orders/${orderB.id}`, {
      method: "POST",
      body: JSON.stringify({ action: "status", status: "cancelled_by_customer" }),
    });
    const after = await admin.query<{ status: string }>("SELECT status FROM orders WHERE id = $1", [orderB.id]);
    const unchanged = before.rows[0]?.status === after.rows[0]?.status;
    record("app", "POST /api/orders/{id de B} refusé", r.status === 404 || r.status === 403, `HTTP ${r.status}`);
    record("app", "La commande de B est restée inchangée en base", unchanged,
      `${before.rows[0]?.status} -> ${after.rows[0]?.status}`);
  }

  // 4. Action groupée : A tente d'inclure une commande de B.
  if (orderB && orderA) {
    const before = await admin.query<{ status: string }>("SELECT status FROM orders WHERE id = $1", [orderB.id]);
    const r = await api(cookieA, "/api/orders/bulk", {
      method: "POST",
      body: JSON.stringify({ action: "cancel", ids: [orderA.id, orderB.id] }),
    });
    const after = await admin.query<{ status: string }>("SELECT status FROM orders WHERE id = $1", [orderB.id]);
    record("app", "Action groupée : la commande de B n'est pas affectée",
      before.rows[0]?.status === after.rows[0]?.status, `HTTP ${r.status}`);
  }

  // 5. Suppression / modification d'un client de B.
  if (customerB) {
    const r = await api(cookieA, `/api/customers/${customerB.id}`, {
      method: "POST",
      body: JSON.stringify({ action: "notes", notes: "compromis" }),
    });
    const { rows: check } = await admin.query<{ notes: string | null }>("SELECT notes FROM customers WHERE id = $1", [customerB.id]);
    record("app", "POST /api/customers/{id de B} refusé", r.status === 404 || r.status === 403, `HTTP ${r.status}`);
    record("app", "Les notes du client de B n'ont pas changé", check[0]?.notes !== "compromis");
  }

  /* ================================================================== */
  /* Contrôles d'autorisation                                           */
  /* ================================================================== */
  console.log("\n── Autorisation ────────────────────────────────────────────");

  const anon = await fetch(`${BASE}/api/orders`);
  record("authz", "Anonyme sur /api/orders -> 401", anon.status === 401, `HTTP ${anon.status}`);

  const merchantToAdmin = await api(cookieA, "/api/admin/health");
  record("authz", "Marchand sur /api/admin/health -> 403", merchantToAdmin.status === 403, `HTTP ${merchantToAdmin.status}`);

  const anonAdmin = await fetch(`${BASE}/api/admin/merchants`);
  record("authz", "Anonyme sur /api/admin/merchants -> 401/403",
    anonAdmin.status === 401 || anonAdmin.status === 403, `HTTP ${anonAdmin.status}`);

  const health = await fetch(`${BASE}/api/health`);
  record("authz", "GET /api/health public -> 200", health.status === 200, `HTTP ${health.status}`);

  // Webhook livraison : signature invalide rejetée.
  const badSig = await fetch(`${BASE}/api/webhooks/delivery/dlc_inexistante`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-signature": "deadbeef" },
    body: JSON.stringify({ tracking: "X", status: "delivered" }),
  });
  record("authz", "Webhook livraison avec signature invalide rejeté",
    badSig.status === 401 || badSig.status === 403 || badSig.status === 404, `HTTP ${badSig.status}`);

  // /api/cron : point d'entrée du worker planifié en production.
  // Il doit être inaccessible sans le bon CRON_SECRET.
  const cronNoAuth = await fetch(`${BASE}/api/cron`, { method: "POST" });
  record("authz", "/api/cron sans en-tête Authorization rejeté",
    cronNoAuth.status === 401 || cronNoAuth.status === 503, `HTTP ${cronNoAuth.status}`);

  const cronBadSecret = await fetch(`${BASE}/api/cron`, {
    method: "POST",
    headers: { authorization: "Bearer mauvais-secret" },
  });
  record("authz", "/api/cron avec mauvais secret rejeté",
    cronBadSecret.status === 401 || cronBadSecret.status === 503, `HTTP ${cronBadSecret.status}`);

  const cronSecret = process.env.TEST_CRON_SECRET;
  if (cronSecret) {
    const cronOk = await fetch(`${BASE}/api/cron`, {
      method: "POST",
      headers: { authorization: `Bearer ${cronSecret}` },
    });
    record("authz", "/api/cron avec le bon secret accepté", cronOk.status === 200, `HTTP ${cronOk.status}`);
  }

  // Webhook commandes : sans jeton Bearer.
  const noToken = await fetch(`${BASE}/api/webhooks/orders/jeton-invalide`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ full_name: "X", phone: "0550000000" }),
  });
  record("authz", "Webhook commandes avec jeton invalide rejeté",
    noToken.status === 401 || noToken.status === 403 || noToken.status === 404, `HTTP ${noToken.status}`);

  /* ================================================================== */
  /* COUCHE 2 — RLS PostgreSQL                                          */
  /* ================================================================== */
  console.log("\n── Couche 2 : RLS PostgreSQL (rôle restreint) ──────────────");

  if (!TENANT_URL) {
    record("rls", "TENANT_DATABASE_URL fourni", false, "variable absente : RLS NON vérifiée");
  } else {
    const tenant = new Pool({ connectionString: TENANT_URL, max: 3 });

    const asUser = async <T>(userId: string, fn: (c: import("pg").PoolClient) => Promise<T>): Promise<T> => {
      const c = await tenant.connect();
      try {
        await c.query("BEGIN");
        await c.query("SELECT set_config('app.current_user_id', $1, true)", [userId]);
        const out = await fn(c);
        await c.query("COMMIT");
        return out;
      } catch (e) {
        await c.query("ROLLBACK").catch(() => {});
        throw e;
      } finally {
        c.release();
      }
    };

    // Confirme que le rôle est bien soumis à la RLS (non-propriétaire).
    const bypass = await tenant.query<{ rolbypassrls: boolean; usename: string }>(
      "SELECT current_user AS usename, (SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user) AS rolbypassrls",
    );
    record("rls", "Le rôle de test ne contourne pas la RLS",
      bypass.rows[0]?.rolbypassrls === false, `rôle=${bypass.rows[0]?.usename}`);

    const tables: { table: string; label: string }[] = [
      { table: "orders", label: "commandes" },
      { table: "customers", label: "clients" },
      { table: "whatsapp_messages", label: "messages WhatsApp" },
      { table: "integrations", label: "intégrations" },
      { table: "delivery_connections", label: "connexions transporteur" },
      { table: "notifications", label: "notifications" },
      { table: "audit_logs", label: "journaux d'audit" },
    ];

    for (const { table, label } of tables) {
      const seen = await asUser(ownerA.user_id, async (c) => {
        const r = await c.query<{ c: string }>(`SELECT COUNT(*)::text AS c FROM ${table} WHERE merchant_id = $1`, [B.id]);
        return Number(r.rows[0].c);
      });
      record("rls", `SELECT ${label} de B en tant que A -> 0 ligne`, seen === 0, `${seen} ligne(s)`);
    }

    // A doit continuer à voir SES propres données (la RLS ne casse pas l'usage normal).
    const ownRows = await asUser(ownerA.user_id, async (c) => {
      const r = await c.query<{ c: string }>("SELECT COUNT(*)::text AS c FROM orders WHERE merchant_id = $1", [A.id]);
      return Number(r.rows[0].c);
    });
    record("rls", "A voit toujours ses propres commandes", ownRows > 0, `${ownRows} ligne(s)`);

    // Une requête SANS filtre applicatif ne doit jamais révéler B.
    const globalLeak = await asUser(ownerA.user_id, async (c) => {
      const r = await c.query<{ merchant_id: string }>("SELECT DISTINCT merchant_id FROM orders");
      return r.rows.map((x) => x.merchant_id);
    });
    record("rls", "SELECT sans clause WHERE ne révèle que A",
      globalLeak.every((m) => m === A.id), `merchants visibles: ${globalLeak.length}`);

    // UPDATE croisé : doit affecter 0 ligne.
    if (orderB) {
      const updated = await asUser(ownerA.user_id, async (c) => {
        const r = await c.query("UPDATE orders SET status = 'cancelled_by_customer' WHERE id = $1", [orderB.id]);
        return r.rowCount ?? 0;
      });
      record("rls", "UPDATE d'une commande de B -> 0 ligne modifiée", updated === 0, `${updated} ligne(s)`);
    }

    // DELETE croisé : doit affecter 0 ligne.
    if (customerB) {
      const deleted = await asUser(ownerA.user_id, async (c) => {
        const r = await c.query("DELETE FROM customers WHERE id = $1", [customerB.id]);
        return r.rowCount ?? 0;
      });
      record("rls", "DELETE d'un client de B -> 0 ligne supprimée", deleted === 0, `${deleted} ligne(s)`);
      const { rows: still } = await admin.query("SELECT id FROM customers WHERE id = $1", [customerB.id]);
      record("rls", "Le client de B existe toujours", still.length === 1);
    }

    // INSERT frauduleux : A tente d'écrire une ligne au nom de B.
    const insertBlocked = await asUser(ownerA.user_id, async (c) => {
      try {
        await c.query(
          `INSERT INTO customers (id, merchant_id, full_name, original_phone, normalized_phone)
           VALUES ($1, $2, 'Injection', '0550000001', '+213550000001')`,
          [`cus_injection_${Date.now()}`, B.id],
        );
        return false;
      } catch {
        return true;
      }
    });
    record("rls", "INSERT au nom de B rejeté (WITH CHECK)", insertBlocked);

    // Un utilisateur inconnu ne voit rien du tout.
    const anonRows = await asUser("usr_inexistant", async (c) => {
      const r = await c.query<{ c: string }>("SELECT COUNT(*)::text AS c FROM orders");
      return Number(r.rows[0].c);
    });
    record("rls", "Utilisateur inconnu ne voit aucune commande", anonRows === 0, `${anonRows} ligne(s)`);

    // Le propriétaire de B voit bien les données de B (contrôle positif).
    const bSees = await asUser(ownerB.user_id, async (c) => {
      const r = await c.query<{ c: string }>("SELECT COUNT(*)::text AS c FROM orders WHERE merchant_id = $1", [B.id]);
      return Number(r.rows[0].c);
    });
    record("rls", "Le propriétaire de B voit les commandes de B", bSees > 0, `${bSees} ligne(s)`);

    await tenant.end();
  }

  await admin.end();

  /* ------------------------------------------------------------------ */
  const failed = results.filter((r) => !r.ok);
  const byLayer = (l: Check["layer"]) => results.filter((r) => r.layer === l);
  console.log("\n══════════════════════════════════════════════════════════");
  console.log(`  Applicatif : ${byLayer("app").filter((r) => r.ok).length}/${byLayer("app").length}`);
  console.log(`  Autorisation: ${byLayer("authz").filter((r) => r.ok).length}/${byLayer("authz").length}`);
  console.log(`  RLS        : ${byLayer("rls").filter((r) => r.ok).length}/${byLayer("rls").length}`);
  console.log(`  TOTAL      : ${results.length - failed.length}/${results.length}`);
  console.log("══════════════════════════════════════════════════════════");

  if (failed.length) {
    console.error(`\n${failed.length} test(s) en échec :`);
    for (const f of failed) console.error(`  - [${f.layer}] ${f.name} ${f.detail}`);
    process.exit(1);
  }
  console.log("\nIsolation multi-tenant vérifiée sur les deux couches.\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
