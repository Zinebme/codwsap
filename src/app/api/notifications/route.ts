import { z } from "zod";
import { requireTenant } from "@/server/auth/session";
import { jsonError, ok, parseBody } from "@/server/http";
import { all, get, run, nowIso } from "@/server/db";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const ctx = await requireTenant();
    const p = new URL(req.url).searchParams;
    const limit = Math.min(50, Number(p.get("limit") ?? 20));
    const onlyUnread = p.get("unread") === "1";
    const rows = all(
      `SELECT * FROM notifications WHERE merchant_id = ? ${onlyUnread ? "AND read_at IS NULL" : ""} ORDER BY created_at DESC LIMIT ?`,
      [ctx.merchantId, limit],
    );
    const unread = get<{ c: number }>("SELECT COUNT(*) AS c FROM notifications WHERE merchant_id = ? AND read_at IS NULL", [ctx.merchantId])?.c ?? 0;
    return ok({ rows, unread });
  } catch (e) {
    return jsonError(e);
  }
}

const schema = z.object({ ids: z.array(z.string()).max(200).optional(), all: z.boolean().optional(), unread: z.boolean().optional() });

export async function POST(req: Request) {
  try {
    const ctx = await requireTenant();
    const body = await parseBody(req, schema);
    if (body.all) {
      run("UPDATE notifications SET read_at = ? WHERE merchant_id = ? AND read_at IS NULL", [nowIso(), ctx.merchantId]);
    } else if (body.ids?.length) {
      run(
        `UPDATE notifications SET read_at = ${body.unread ? "NULL" : "?"} WHERE merchant_id = ? AND id IN (${body.ids.map(() => "?").join(",")})`,
        body.unread ? [ctx.merchantId, ...body.ids] : [nowIso(), ctx.merchantId, ...body.ids],
      );
    }
    return ok({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
