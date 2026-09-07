import { requirePermission } from "@/server/auth/session";
import { jsonError, ok } from "@/server/http";
import { all, get } from "@/server/db";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const ctx = await requirePermission("conversations.read");
    const p = new URL(req.url).searchParams;
    const q = p.get("q")?.trim();
    const unread = p.get("unread") === "1";
    const page = Math.max(1, Number(p.get("page") ?? 1));
    const pageSize = 30;

    const where = ["c.merchant_id = ?"];
    const params: unknown[] = [ctx.merchantId];
    if (q) {
      where.push("(c.normalized_phone LIKE ? OR cu.full_name LIKE ? OR o.reference LIKE ?)");
      params.push(`%${q}%`, `%${q}%`, `%${q}%`);
    }
    if (unread) where.push("c.unread_count > 0");

    const rows = await all(
      `SELECT c.*, cu.full_name AS customer_name, cu.whatsapp_status, o.reference AS order_reference
       FROM whatsapp_conversations c
       LEFT JOIN customers cu ON cu.id = c.customer_id
       LEFT JOIN orders o ON o.id = c.order_id
       WHERE ${where.join(" AND ")}
       ORDER BY c.last_message_at DESC NULLS LAST LIMIT ? OFFSET ?`,
      [...params, pageSize, (page - 1) * pageSize],
    );
    const total = (await get<{ c: number }>(
      `SELECT COUNT(*) AS c FROM whatsapp_conversations c LEFT JOIN customers cu ON cu.id = c.customer_id LEFT JOIN orders o ON o.id = c.order_id WHERE ${where.join(" AND ")}`,
      params,
    ))?.c ?? 0;
    return ok({ rows, total, page, pages: Math.max(1, Math.ceil(total / pageSize)) });
  } catch (e) {
    return jsonError(e);
  }
}
