import { requireSuperAdmin } from "@/server/auth/session";
import { jsonError, ok } from "@/server/http";
import { all, get } from "@/server/db";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await requireSuperAdmin();
    const p = new URL(req.url).searchParams;
    const q = p.get("q")?.trim();
    const status = p.get("status");
    const page = Math.max(1, Number(p.get("page") ?? 1));
    const pageSize = 25;

    const where: string[] = ["1=1"];
    const params: unknown[] = [];
    if (q) {
      where.push("(m.name LIKE ? OR m.email LIKE ? OR m.phone LIKE ?)");
      params.push(`%${q}%`, `%${q}%`, `%${q}%`);
    }
    if (status) {
      where.push("m.status = ?");
      params.push(status);
    }
    const whereSql = where.join(" AND ");

    const rows = all(
      `SELECT m.*,
        (SELECT u.full_name FROM merchant_users mu JOIN users u ON u.id = mu.user_id WHERE mu.merchant_id = m.id AND mu.role = 'owner' LIMIT 1) AS owner_name,
        (SELECT COUNT(*) FROM orders o WHERE o.merchant_id = m.id) AS orders_count,
        (SELECT COUNT(*) FROM whatsapp_messages w WHERE w.merchant_id = m.id AND w.direction = 'outbound') AS messages_count,
        (SELECT COUNT(*) FROM api_logs a WHERE a.merchant_id = m.id AND a.ok = 0) AS errors_count,
        (SELECT status FROM whatsapp_connections wc WHERE wc.merchant_id = m.id) AS whatsapp_status,
        (SELECT provider FROM delivery_connections dc WHERE dc.merchant_id = m.id ORDER BY is_default DESC LIMIT 1) AS delivery_provider
       FROM merchants m WHERE ${whereSql} ORDER BY m.created_at DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, (page - 1) * pageSize],
    );
    const total = get<{ c: number }>(`SELECT COUNT(*) AS c FROM merchants m WHERE ${whereSql}`, params)?.c ?? 0;
    return ok({ rows, total, page, pages: Math.max(1, Math.ceil(total / pageSize)) });
  } catch (e) {
    return jsonError(e);
  }
}
