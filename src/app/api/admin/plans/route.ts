import { z } from "zod";
import { requireSuperAdmin } from "@/server/auth/session";
import { jsonError, ok, parseBody } from "@/server/http";
import { all, run } from "@/server/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireSuperAdmin();
    return ok({ rows: all("SELECT * FROM plans ORDER BY sort_order") });
  } catch (e) {
    return jsonError(e);
  }
}

const schema = z.object({
  code: z.string().min(2).max(30),
  name: z.string().min(2).max(40),
  priceDzd: z.number().int().min(0),
  maxOrdersMonth: z.number().int().min(0),
  maxMessagesMonth: z.number().int().min(0),
  maxTeamMembers: z.number().int().min(0),
  maxDeliveryConnections: z.number().int().min(0),
  maxAutomations: z.number().int().min(0),
});

export async function PATCH(req: Request) {
  try {
    await requireSuperAdmin();
    const b = await parseBody(req, schema);
    run(
      `UPDATE plans SET name = ?, price_dzd = ?, max_orders_month = ?, max_messages_month = ?, max_team_members = ?, max_delivery_connections = ?, max_automations = ? WHERE code = ?`,
      [b.name, b.priceDzd, b.maxOrdersMonth, b.maxMessagesMonth, b.maxTeamMembers, b.maxDeliveryConnections, b.maxAutomations, b.code],
    );
    return ok({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
