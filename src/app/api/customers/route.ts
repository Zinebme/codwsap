import { requirePermission } from "@/server/auth/session";
import { jsonError, ok } from "@/server/http";
import { all, get } from "@/server/db";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const ctx = await requirePermission("customers.read");
    const p = new URL(req.url).searchParams;
    const page = Math.max(1, Number(p.get("page") ?? 1));
    const pageSize = Math.min(100, Math.max(5, Number(p.get("pageSize") ?? 25)));
    const q = p.get("q")?.trim();
    const wilaya = p.get("wilaya");
    const wa = p.get("wa");

    const where = ["merchant_id = ?"];
    const params: unknown[] = [ctx.merchantId];
    if (q) {
      where.push("(full_name LIKE ? OR normalized_phone LIKE ? OR original_phone LIKE ?)");
      params.push(`%${q}%`, `%${q}%`, `%${q}%`);
    }
    if (wilaya) {
      where.push("wilaya = ?");
      params.push(wilaya);
    }
    if (wa) {
      where.push("whatsapp_status = ?");
      params.push(wa);
    }
    const whereSql = where.join(" AND ");
    const rows = all(`SELECT * FROM customers WHERE ${whereSql} ORDER BY last_order_at DESC NULLS LAST, created_at DESC LIMIT ? OFFSET ?`, [
      ...params,
      pageSize,
      (page - 1) * pageSize,
    ]);
    const total = get<{ c: number }>(`SELECT COUNT(*) AS c FROM customers WHERE ${whereSql}`, params)?.c ?? 0;
    return ok({ rows, total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)) });
  } catch (e) {
    return jsonError(e);
  }
}
