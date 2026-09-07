import { requireTenant } from "@/server/auth/session";
import { jsonError, ok } from "@/server/http";
import { all } from "@/server/db";

export const dynamic = "force-dynamic";

/** Fast global search across orders, customers and tracking numbers. */
export async function GET(req: Request) {
  try {
    const ctx = await requireTenant();
    const q = new URL(req.url).searchParams.get("q")?.trim();
    if (!q || q.length < 2) return ok({ orders: [], customers: [] });
    const like = `%${q}%`;
    return ok({
      orders: await all(
        `SELECT id, reference, customer_name, total, status, tracking_number FROM orders
         WHERE merchant_id = ? AND (reference LIKE ? OR customer_name LIKE ? OR normalized_phone LIKE ? OR original_phone LIKE ? OR tracking_number LIKE ?)
         ORDER BY created_at DESC LIMIT 6`,
        [ctx.merchantId, like, like, like, like, like],
      ),
      customers: await all(
        `SELECT id, full_name, normalized_phone, total_orders FROM customers
         WHERE merchant_id = ? AND (full_name LIKE ? OR normalized_phone LIKE ? OR original_phone LIKE ?)
         ORDER BY last_order_at DESC LIMIT 5`,
        [ctx.merchantId, like, like, like],
      ),
    });
  } catch (e) {
    return jsonError(e);
  }
}
