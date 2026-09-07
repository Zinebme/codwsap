import { requirePermission } from "@/server/auth/session";
import { jsonError, ok } from "@/server/http";
import { get } from "@/server/db";
import { syncGoogleSheet } from "@/server/connectors/orders";
import { rateLimit } from "@/server/http";

/** Manual Google Sheets sync. */
export async function POST() {
  try {
    const ctx = await requirePermission("integrations.write");
    rateLimit(`sheet-sync:${ctx.merchantId}`, 6, 60_000);
    const integ = get<{ id: string }>("SELECT id FROM integrations WHERE merchant_id = ? AND kind = 'google_sheets'", [ctx.merchantId]);
    if (!integ) return ok({ ok: false, error: "Aucune feuille Google connectée." }, { status: 400 });
    const res = await syncGoogleSheet(ctx.merchantId, integ.id);
    return ok(res);
  } catch (e) {
    return jsonError(e);
  }
}
