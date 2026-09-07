import { cookies } from "next/headers";
import { destroySession } from "@/server/auth/session";
import { ok } from "@/server/http";

export async function POST() {
  await destroySession();
  const jar = await cookies();
  jar.delete("codwsap_merchant");
  return ok({ ok: true });
}
