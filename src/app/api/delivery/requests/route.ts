import { z } from "zod";
import { requirePermission } from "@/server/auth/session";
import { jsonError, ok, parseBody } from "@/server/http";
import { run, uid } from "@/server/db";

const schema = z.object({ providerName: z.string().min(2).max(80), contact: z.string().max(120).optional(), details: z.string().max(600).optional() });

export async function POST(req: Request) {
  try {
    const ctx = await requirePermission("delivery.write");
    const body = await parseBody(req, schema);
    await run("INSERT INTO provider_requests (id, merchant_id, provider_name, contact, details) VALUES (?,?,?,?,?)", [
      uid("prq"), ctx.merchantId, body.providerName, body.contact ?? null, body.details ?? null,
    ]);
    return ok({ ok: true }, { status: 201 });
  } catch (e) {
    return jsonError(e);
  }
}
