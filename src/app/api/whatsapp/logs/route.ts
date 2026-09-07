import { requirePermission } from "@/server/auth/session";
import { jsonError, ok } from "@/server/http";
import { all, get } from "@/server/db";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const ctx = await requirePermission("conversations.read");
    const p = new URL(req.url).searchParams;
    const page = Math.max(1, Number(p.get("page") ?? 1));
    const pageSize = Math.min(100, Number(p.get("pageSize") ?? 25));
    const status = p.get("status");
    const direction = p.get("direction");

    const where = ["m.merchant_id = ?"];
    const params: unknown[] = [ctx.merchantId];
    if (status) { where.push("m.status = ?"); params.push(status); }
    if (direction) { where.push("m.direction = ?"); params.push(direction); }
    const whereSql = where.join(" AND ");

    const rows = all(
      `SELECT m.*, o.reference AS order_reference, c.full_name AS customer_name, c.normalized_phone
       FROM whatsapp_messages m
       LEFT JOIN orders o ON o.id = m.order_id
       LEFT JOIN customers c ON c.id = m.customer_id
       WHERE ${whereSql} ORDER BY m.created_at DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, (page - 1) * pageSize],
    );
    const total = get<{ c: number }>(`SELECT COUNT(*) AS c FROM whatsapp_messages m WHERE ${whereSql}`, params)?.c ?? 0;
    return ok({ rows, total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)) });
  } catch (e) {
    return jsonError(e);
  }
}
