import { get, activeDriver } from "@/server/db";

export const dynamic = "force-dynamic";

/**
 * Sonde de santé publique (Railway healthcheckPath, supervision externe).
 *
 * Volontairement minimaliste : elle confirme que le process répond ET que la
 * base est joignable, sans divulguer ni version, ni schéma, ni configuration.
 * 200 = prêt à recevoir du trafic, 503 = à retirer du load balancer.
 */
export async function GET() {
  const startedAt = Date.now();
  try {
    await get<{ ok: number }>("SELECT 1 AS ok");
    return Response.json(
      {
        status: "ok",
        database: activeDriver(),
        uptime_s: Math.round(process.uptime()),
        latency_ms: Date.now() - startedAt,
      },
      { status: 200, headers: { "cache-control": "no-store" } },
    );
  } catch {
    // Aucun détail d'erreur : le message pourrait contenir l'URL de connexion.
    return Response.json(
      { status: "unhealthy", database: "unreachable" },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}
