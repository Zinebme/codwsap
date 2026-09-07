import { requireTenant } from "@/server/auth/session";
import { jsonError, ok } from "@/server/http";
import { merchantKpis, ordersByDay, messagesByDay, rangeFromPreset } from "@/server/services/analytics";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const ctx = await requireTenant();
    const p = new URL(req.url).searchParams;
    const range = rangeFromPreset(p.get("preset") ?? "30d", p.get("from") ?? undefined, p.get("to") ?? undefined);
    return ok({
      range,
      kpi: await merchantKpis(ctx.merchantId, range),
      ordersByDay: await ordersByDay(ctx.merchantId, range),
      messagesByDay: await messagesByDay(ctx.merchantId, range),
    });
  } catch (e) {
    return jsonError(e);
  }
}
