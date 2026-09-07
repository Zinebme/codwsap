import { requireTenant } from "@/server/auth/session";
import { jsonError, ok } from "@/server/http";
import { merchantKpis, qualityAssessment, rangeFromPreset, templatePerformance } from "@/server/services/analytics";
import { recentSuppressions } from "@/server/services/messaging";
import { get } from "@/server/db";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const ctx = await requireTenant();
    const p = new URL(req.url).searchParams;
    const range = rangeFromPreset(p.get("preset") ?? "30d", p.get("from") ?? undefined, p.get("to") ?? undefined);
    const kpi = merchantKpis(ctx.merchantId, range);
    const assessment = qualityAssessment(kpi);
    const conn = get<{ quality_rating: string | null; meta_metrics: string | null; status: string }>(
      "SELECT quality_rating, meta_metrics, status FROM whatsapp_connections WHERE merchant_id = ?",
      [ctx.merchantId],
    );
    return ok({
      range,
      kpi,
      assessment,
      templates: templatePerformance(ctx.merchantId, range),
      suppressions: recentSuppressions(ctx.merchantId, 15),
      // Meta-sourced values are shown separately and never invented.
      meta: conn?.status === "connected" ? { qualityRating: conn.quality_rating, raw: conn.meta_metrics } : null,
    });
  } catch (e) {
    return jsonError(e);
  }
}
