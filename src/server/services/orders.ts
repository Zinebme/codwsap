import "server-only";
import { all, get, run, uid, nowIso, tx } from "@/server/db";
import { normalizeDzPhone } from "@/lib/phone";
import { onNewOrder } from "@/server/services/automations";
import { bumpUsage } from "@/server/services/messaging";

export type OrderInput = {
  merchantId: string;
  reference?: string;
  externalId?: string | null;
  source?: string;
  sourceId?: string | null;
  customerName: string;
  phone: string;
  wilaya?: string | null;
  commune?: string | null;
  address?: string | null;
  deliveryType?: "home" | "office";
  productsPrice?: number;
  deliveryPrice?: number;
  total?: number;
  quantity?: number;
  items?: { product_name: string; variant?: string | null; quantity: number; unit_price: number }[];
  notes?: string | null;
  isTest?: boolean;
  orderDate?: string;
};

export async function nextReference(merchantId: string): Promise<string> {
  const row = await get<{ c: number }>("SELECT COUNT(*) AS c FROM orders WHERE merchant_id = ?", [merchantId]);
  return `CMD-${String((row?.c ?? 0) + 1).padStart(5, "0")}`;
}

export async function upsertCustomer(merchantId: string, name: string, phone: string, wilaya?: string | null, commune?: string | null, isTest = false) {
  const p = normalizeDzPhone(phone);
  const existing = await get<{ id: string }>("SELECT id FROM customers WHERE merchant_id = ? AND normalized_phone = ?", [merchantId, p.normalized]);
  if (existing) {
    await run("UPDATE customers SET full_name = COALESCE(NULLIF(?,''), full_name), wilaya = COALESCE(?, wilaya), commune = COALESCE(?, commune), updated_at = ? WHERE id = ?", [
      name,
      wilaya ?? null,
      commune ?? null,
      nowIso(),
      existing.id,
    ]);
    return existing.id;
  }
  const id = uid("cus");
  await run(
    `INSERT INTO customers (id, merchant_id, full_name, original_phone, normalized_phone, wilaya, commune, is_test)
     VALUES (?,?,?,?,?,?,?,?)`,
    [id, merchantId, name, p.original, p.normalized, wilaya ?? null, commune ?? null, isTest ? 1 : 0],
  );
  return id;
}

export async function recomputeCustomerStats(customerId: string) {
  const s = await get<{ total: number; delivered: number; cancelled: number; returned: number; cod: number; last: string | null }>(
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN status='delivered' THEN 1 ELSE 0 END) AS delivered,
            SUM(CASE WHEN status IN ('cancelled_by_customer') THEN 1 ELSE 0 END) AS cancelled,
            SUM(CASE WHEN status IN ('returned','return_requested') THEN 1 ELSE 0 END) AS returned,
            SUM(CASE WHEN status='delivered' THEN total ELSE 0 END) AS cod,
            MAX(created_at) AS last
     FROM orders WHERE customer_id = ?`,
    [customerId],
  );
  await run(
    `UPDATE customers SET total_orders = ?, delivered_orders = ?, cancelled_orders = ?, returned_orders = ?, total_cod_value = ?, last_order_at = ?, updated_at = ? WHERE id = ?`,
    [s?.total ?? 0, s?.delivered ?? 0, s?.cancelled ?? 0, s?.returned ?? 0, s?.cod ?? 0, s?.last ?? null, nowIso(), customerId],
  );
}

export async function createOrder(input: OrderInput): Promise<{ id: string; reference: string; duplicated: boolean }> {
  const p = normalizeDzPhone(input.phone);
  const reference = input.reference?.trim() || await nextReference(input.merchantId);

  // Idempotency for connector-sourced orders.
  if (input.externalId) {
    const dup = await get<{ id: string; reference: string }>(
      "SELECT id, reference FROM orders WHERE merchant_id = ? AND source = ? AND external_id = ?",
      [input.merchantId, input.source ?? "manual", input.externalId],
    );
    if (dup) return { ...dup, duplicated: true };
  }
  const dupRef = await get<{ id: string; reference: string }>("SELECT id, reference FROM orders WHERE merchant_id = ? AND reference = ?", [input.merchantId, reference]);
  if (dupRef) return { ...dupRef, duplicated: true };

  const id = uid("ord");
  const productsPrice = input.productsPrice ?? 0;
  const deliveryPrice = input.deliveryPrice ?? 0;
  const total = input.total ?? productsPrice + deliveryPrice;

  await tx(async () => {
    const customerId = await upsertCustomer(input.merchantId, input.customerName, input.phone, input.wilaya, input.commune, input.isTest);
    await run(
      `INSERT INTO orders (id, merchant_id, reference, external_id, source, source_id, customer_id, customer_name,
        original_phone, normalized_phone, wilaya, commune, address, delivery_type, products_price, delivery_price,
        total, quantity, status, notes, is_test, order_date)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'new', ?, ?, ?)`,
      [
        id,
        input.merchantId,
        reference,
        input.externalId ?? null,
        input.source ?? "manual",
        input.sourceId ?? null,
        customerId,
        input.customerName,
        p.original,
        p.normalized,
        input.wilaya ?? null,
        input.commune ?? null,
        input.address ?? null,
        input.deliveryType ?? "home",
        productsPrice,
        deliveryPrice,
        total,
        input.quantity ?? (input.items?.reduce((a, i) => a + i.quantity, 0) || 1),
        input.notes ?? null,
        input.isTest ? 1 : 0,
        input.orderDate ?? nowIso(),
      ],
    );
    for (const item of input.items ?? []) {
      await run("INSERT INTO order_items (id, merchant_id, order_id, product_name, variant, quantity, unit_price) VALUES (?,?,?,?,?,?,?)", [
        uid("itm"),
        input.merchantId,
        id,
        item.product_name,
        item.variant ?? null,
        item.quantity,
        item.unit_price,
      ]);
    }
    await run("INSERT INTO order_events (id, merchant_id, order_id, type, title, description) VALUES (?,?,?,?,?,?)", [
      uid("evt"),
      input.merchantId,
      id,
      "status_change",
      "Commande créée",
      `Source : ${input.source ?? "manual"}`,
    ]);
    await recomputeCustomerStats(customerId);
  });

  await bumpUsage(input.merchantId, "orders");
  await onNewOrder(id);
  return { id, reference, duplicated: false };
}

export type OrderFilters = {
  merchantId: string;
  q?: string;
  status?: string[];
  deliveryStatus?: string[];
  provider?: string;
  waStatus?: string;
  from?: string;
  to?: string;
  assigned?: string;
  attention?: boolean;
  includeTest?: boolean;
  sort?: string;
  dir?: "asc" | "desc";
  page?: number;
  pageSize?: number;
  /** Only set by trusted server code (CSV export). */
  allowLargePage?: boolean;
};

const SORTABLE: Record<string, string> = {
  created_at: "o.created_at",
  total: "o.total",
  reference: "o.reference",
  status: "o.status",
  customer: "o.customer_name",
  wilaya: "o.wilaya",
};

export async function listOrders(f: OrderFilters) {
  const where: string[] = ["o.merchant_id = ?"];
  const params: unknown[] = [f.merchantId];

  if (f.q) {
    const q = `%${f.q.trim()}%`;
    where.push("(o.reference LIKE ? OR o.customer_name LIKE ? OR o.normalized_phone LIKE ? OR o.original_phone LIKE ? OR o.tracking_number LIKE ?)");
    params.push(q, q, q, q, q);
  }
  if (f.status?.length) {
    where.push(`o.status IN (${f.status.map(() => "?").join(",")})`);
    params.push(...f.status);
  }
  if (f.deliveryStatus?.length) {
    where.push(`o.delivery_status IN (${f.deliveryStatus.map(() => "?").join(",")})`);
    params.push(...f.deliveryStatus);
  }
  if (f.provider) {
    where.push("o.delivery_provider = ?");
    params.push(f.provider);
  }
  if (f.waStatus) {
    where.push("o.whatsapp_status = ?");
    params.push(f.waStatus);
  }
  if (f.assigned) {
    where.push("o.assigned_user_id = ?");
    params.push(f.assigned);
  }
  if (f.attention) where.push("o.attention = 1");
  if (f.from) {
    where.push("o.created_at >= ?");
    params.push(f.from);
  }
  if (f.to) {
    where.push("o.created_at <= ?");
    params.push(`${f.to} 23:59:59`);
  }
  if (!f.includeTest) where.push("o.is_test = 0");

  const sortCol = SORTABLE[f.sort ?? "created_at"] ?? "o.created_at";
  const dir = f.dir === "asc" ? "ASC" : "DESC";
  const page = Math.max(1, f.page ?? 1);
  const pageSize = Math.min(f.allowLargePage ? 5000 : 100, Math.max(5, f.pageSize ?? 25));
  const offset = (page - 1) * pageSize;

  const whereSql = where.join(" AND ");
  const rows = await all(
    `SELECT o.*, c.whatsapp_status AS customer_wa_status, u.full_name AS assigned_name
     FROM orders o
     LEFT JOIN customers c ON c.id = o.customer_id
     LEFT JOIN users u ON u.id = o.assigned_user_id
     WHERE ${whereSql}
     ORDER BY ${sortCol} ${dir}
     LIMIT ? OFFSET ?`,
    [...params, pageSize, offset],
  );
  const total = (await get<{ c: number }>(`SELECT COUNT(*) AS c FROM orders o WHERE ${whereSql}`, params))?.c ?? 0;
  return { rows, total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)) };
}

export async function orderDetail(merchantId: string, orderId: string) {
  const order = await get<Record<string, unknown>>(
    `SELECT o.*, c.whatsapp_status AS customer_wa_status, c.opt_out_status, c.total_orders AS customer_total_orders,
            c.delivered_orders AS customer_delivered_orders, u.full_name AS assigned_name
     FROM orders o LEFT JOIN customers c ON c.id = o.customer_id LEFT JOIN users u ON u.id = o.assigned_user_id
     WHERE o.id = ? AND o.merchant_id = ?`,
    [orderId, merchantId],
  );
  if (!order) return null;
  return {
    order,
    items: await all("SELECT * FROM order_items WHERE order_id = ? AND merchant_id = ?", [orderId, merchantId]),
    events: await all("SELECT * FROM order_events WHERE order_id = ? AND merchant_id = ? ORDER BY created_at DESC LIMIT 100", [orderId, merchantId]),
    messages: await all("SELECT * FROM whatsapp_messages WHERE order_id = ? AND merchant_id = ? ORDER BY created_at ASC LIMIT 200", [orderId, merchantId]),
    shipment: await get("SELECT * FROM delivery_shipments WHERE order_id = ? AND merchant_id = ? ORDER BY created_at DESC LIMIT 1", [orderId, merchantId]),
    deliveryEvents: await all("SELECT * FROM delivery_events WHERE order_id = ? AND merchant_id = ? ORDER BY occurred_at DESC LIMIT 50", [orderId, merchantId]),
    automationRuns: await all("SELECT * FROM automation_runs WHERE order_id = ? AND merchant_id = ? ORDER BY created_at DESC LIMIT 50", [orderId, merchantId]),
  };
}
