import { z } from "zod";
import { requirePermission, clientIp } from "@/server/auth/session";
import { jsonError, ok, parseBody, rateLimit } from "@/server/http";
import { createOrder, listOrders } from "@/server/services/orders";
import { audit } from "@/server/services/audit";
import { runWorker } from "@/server/jobs/worker";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const ctx = await requirePermission("orders.read");
    const url = new URL(req.url);
    const p = url.searchParams;
    const multi = (k: string) => p.getAll(k).flatMap((v) => v.split(",")).filter(Boolean);

    const result = await listOrders({
      merchantId: ctx.merchantId,
      q: p.get("q") ?? undefined,
      status: multi("status"),
      deliveryStatus: multi("deliveryStatus"),
      provider: p.get("provider") ?? undefined,
      waStatus: p.get("wa") ?? undefined,
      from: p.get("from") ?? undefined,
      to: p.get("to") ?? undefined,
      assigned: p.get("assigned") ?? undefined,
      attention: p.get("attention") === "1",
      includeTest: p.get("test") === "1",
      sort: p.get("sort") ?? undefined,
      dir: (p.get("dir") as "asc" | "desc") ?? "desc",
      page: Number(p.get("page") ?? 1),
      pageSize: Number(p.get("pageSize") ?? 25),
    });
    return ok(result);
  } catch (e) {
    return jsonError(e);
  }
}

const createSchema = z.object({
  customerName: z.string().min(2).max(120),
  phone: z.string().min(6).max(30),
  wilaya: z.string().max(60).optional().nullable(),
  commune: z.string().max(80).optional().nullable(),
  address: z.string().max(300).optional().nullable(),
  deliveryType: z.enum(["home", "office"]).default("home"),
  productsPrice: z.number().int().min(0).max(100_000_000).default(0),
  deliveryPrice: z.number().int().min(0).max(1_000_000).default(0),
  notes: z.string().max(1000).optional().nullable(),
  isTest: z.boolean().optional(),
  items: z
    .array(
      z.object({
        product_name: z.string().min(1).max(160),
        variant: z.string().max(120).optional().nullable(),
        quantity: z.number().int().min(1).max(999),
        unit_price: z.number().int().min(0).max(10_000_000),
      }),
    )
    .max(30)
    .default([]),
});

export async function POST(req: Request) {
  try {
    const ctx = await requirePermission("orders.write");
    rateLimit(`order-create:${ctx.merchantId}`, 60, 60_000);
    const body = await parseBody(req, createSchema);

    const productsPrice = body.items.length ? body.items.reduce((a, i) => a + i.quantity * i.unit_price, 0) : body.productsPrice;
    const res = await createOrder({
      merchantId: ctx.merchantId,
      customerName: body.customerName,
      phone: body.phone,
      wilaya: body.wilaya,
      commune: body.commune,
      address: body.address,
      deliveryType: body.deliveryType,
      productsPrice,
      deliveryPrice: body.deliveryPrice,
      total: productsPrice + body.deliveryPrice,
      items: body.items,
      notes: body.notes,
      isTest: body.isTest,
      source: "manual",
    });
    await audit({
      merchantId: ctx.merchantId,
      actorId: ctx.user.id,
      actorLabel: ctx.user.email,
      action: "order.created",
      resource: "order",
      resourceId: res.id,
      ip: await clientIp(),
    });
    void runWorker(5);
    return ok(res, { status: 201 });
  } catch (e) {
    return jsonError(e);
  }
}
