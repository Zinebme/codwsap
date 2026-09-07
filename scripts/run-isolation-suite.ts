/**
 * Orchestrateur de bout en bout des tests d'isolation.
 *
 *   npm run test:isolation
 *
 * Enchaîne : PostgreSQL réel -> migrations -> rôle de test -> seed 2 marchands
 * -> serveur Next.js -> suite d'isolation -> arrêt propre.
 */
import { execSync, spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import { startLocalPg } from "./pg-local";

const PORT = Number(process.env.TEST_PORT ?? 3210);
const TEST_PASSWORD = "Test-Isolation-2026-xY7";
const TENANT_PASSWORD = "tenant-test-pw";

function sh(cmd: string, env: Record<string, string>) {
  execSync(cmd, { stdio: "inherit", env: { ...process.env, ...env }, cwd: process.cwd() });
}

/** Libère le port s'il reste un serveur d'une exécution précédente. */
async function freePort(port: number) {
  const inUse = await new Promise<boolean>((resolve) => {
    const sock = net.connect({ port, host: "127.0.0.1" });
    sock.on("connect", () => { sock.destroy(); resolve(true); });
    sock.on("error", () => resolve(false));
    setTimeout(() => { sock.destroy(); resolve(false); }, 1000);
  });
  if (!inUse) return;

  console.log(`      port ${port} occupé, arrêt du process résiduel…`);
  // `fuser`/`lsof` ne sont pas garantis présents : on résout via /proc.
  const hex = port.toString(16).toUpperCase().padStart(4, "0");
  const inodes = new Set<string>();
  for (const f of ["/proc/net/tcp", "/proc/net/tcp6"]) {
    if (!fs.existsSync(f)) continue;
    for (const line of fs.readFileSync(f, "utf8").split("\n").slice(1)) {
      const p = line.trim().split(/\s+/);
      if (p.length > 9 && p[1]?.split(":")[1] === hex && p[3] === "0A") inodes.add(p[9]);
    }
  }
  for (const dir of fs.readdirSync("/proc")) {
    if (!/^\d+$/.test(dir)) continue;
    try {
      for (const fd of fs.readdirSync(`/proc/${dir}/fd`)) {
        const link = fs.readlinkSync(`/proc/${dir}/fd/${fd}`);
        const m = /^socket:\[(\d+)\]$/.exec(link);
        if (m && inodes.has(m[1])) {
          process.kill(Number(dir), "SIGKILL");
          break;
        }
      }
    } catch {
      /* process disparu ou non accessible */
    }
  }
  await new Promise((r) => setTimeout(r, 2000));
}

async function waitForServer(url: string, timeoutMs = 180_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(url);
      if (r.status < 500) return true;
    } catch {
      /* pas encore prêt */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

async function main() {
  let stopPg: (() => Promise<void>) | null = null;
  let server: ChildProcess | null = null;
  let exitCode = 0;

  // Base jetable : on repart toujours d'un état propre.
  const dataDir = path.join(process.cwd(), ".pg-local");
  if (fs.existsSync(dataDir)) fs.rmSync(dataDir, { recursive: true, force: true });

  try {
    console.log("\n[1/6] Démarrage de PostgreSQL…");
    const pg = await startLocalPg();
    stopPg = pg.stop;
    const url = pg.url;
    console.log(`      ${url}`);

    console.log("\n[2/6] Application des migrations…");
    sh("npx tsx scripts/migrate.ts", { DATABASE_URL: url });

    console.log("\n[3/6] Création du rôle restreint soumis à la RLS…");
    const { Pool } = await import("pg");
    const pool = new Pool({ connectionString: url });
    await pool.query(`ALTER ROLE codwsap_tenant WITH LOGIN PASSWORD '${TENANT_PASSWORD}'`);
    await pool.query("GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO codwsap_tenant");
    const check = await pool.query<{ rolbypassrls: boolean }>(
      "SELECT rolbypassrls FROM pg_roles WHERE rolname = 'codwsap_tenant'",
    );
    if (check.rows[0]?.rolbypassrls) throw new Error("codwsap_tenant contourne la RLS : test invalide.");
    await pool.end();
    const tenantUrl = url.replace("postgres:postgres@", `codwsap_tenant:${TENANT_PASSWORD}@`);

    console.log("\n[4/6] Seed de deux marchands (environnement de test)…");
    sh("npx tsx --conditions=react-server scripts/seed.ts", {
      DATABASE_URL: url,
      APP_ENV: "test",
      NODE_ENV: "development",
      SEED_PASSWORD: TEST_PASSWORD,
      SEED_ORDERS: "30",
    });

    console.log("\n[5/6] Démarrage du serveur applicatif…");
    await freePort(PORT);
    server = spawn("npx", ["next", "start", "-p", String(PORT), "-H", "0.0.0.0"], {
      env: {
        ...process.env,
        DATABASE_URL: url,
        DB_DRIVER: "postgres",
        APP_ENV: "test",
        NODE_ENV: "production",
        PORT: String(PORT),
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    server.stdout?.on("data", (d) => process.stdout.write(`      [srv] ${d}`));
    server.stderr?.on("data", (d) => process.stderr.write(`      [srv] ${d}`));

    const ready = await waitForServer(`http://127.0.0.1:${PORT}/api/health`);
    if (!ready) throw new Error("Le serveur n'a pas démarré à temps.");
    console.log("      serveur prêt.");

    console.log("\n[6/6] Exécution des tests d'isolation…\n");
    sh("npx tsx --conditions=react-server scripts/test-tenant-isolation.ts", {
      DATABASE_URL: url,
      TENANT_DATABASE_URL: tenantUrl,
      TEST_BASE_URL: `http://127.0.0.1:${PORT}`,
      TEST_PASSWORD,
    });
  } catch (e) {
    exitCode = 1;
    console.error("\nSuite d'isolation en échec :", e instanceof Error ? e.message : e);
  } finally {
    if (server && !server.killed) server.kill("SIGTERM");
    if (stopPg) await stopPg().catch(() => {});
  }
  process.exit(exitCode);
}

main();
