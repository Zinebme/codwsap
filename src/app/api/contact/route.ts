import { z } from "zod";
import { jsonError, ok, parseBody, rateLimit } from "@/server/http";
import { run, uid } from "@/server/db";
import { clientIp } from "@/server/auth/session";

const schema = z.object({
  name: z.string().min(2).max(80),
  email: z.string().email().max(160),
  phone: z.string().max(30).optional(),
  message: z.string().min(5).max(2000),
});

export async function POST(req: Request) {
  try {
    rateLimit(`contact:${(await clientIp()) ?? "anon"}`, 5, 300_000);
    const body = await parseBody(req, schema);
    await run("INSERT INTO leads (id, name, email, phone, message) VALUES (?,?,?,?,?)", [uid("led"), body.name, body.email, body.phone ?? null, body.message]);
    return ok({ ok: true }, { status: 201 });
  } catch (e) {
    return jsonError(e);
  }
}
