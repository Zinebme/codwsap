import "server-only";
import { all, get, run, uid, nowIso } from "@/server/db";
import { connectorForConnection } from "@/server/connectors/delivery";
import { onDeliveryStatusChange } from "@/server/services/automations";
import { bumpUsage } from "@/server/services/messaging";
import { notify } from "@/server/services/notifications";
import type { DeliveryStatus } from "@/lib/domain";

export function defaultConnection(merchantId: string) {
  return (
    get<{ id: string; provider: string; label: string }>(
      "SELECT id, provider, label FROM delivery_connections WHERE merchant_id = ? AND is_active = 1 ORDER BY is_default DESC, created_at LIMIT 1",
      [merchantId],
    ) ?? null
  );
}

export async function sendOrderToProvider(merchantId: string, orderId: string, connectionId?: string) {
  const order = get<{
    id: string;
    reference: string;
    customer_name: string;
    normalized_phone: string;
    wilaya: string | null;
    commune: string | null;
    address: string | null;
    delivery_type: "home" | "office";
    total: number;
    notes: string | null;
    tracking_number: string | null;
  }>("SELECT * FROM orders WHERE id = ? AND merchant_id = ?", [orderId, merchantId]);
  if (!order) return { ok: false as const, error: "Commande introuvable." };
  if (order.tracking_number) return { ok: false as const, error: "Cette commande a déjà été envoyée au transporteur." };

  const conn = connectionId
    ? get<{ id: string; provider: string }>("SELECT id, provider FROM delivery_connections WHERE id = ? AND merchant_id = ?", [connectionId, merchantId])
    : defaultConnection(merchantId);
  if (!conn) return { ok: false as const, error: "Aucun transporteur connecté. Configurez-en un dans Livraison." };

  const connector = connectorForConnection(conn.id, merchantId);
  if (!connector) return { ok: false as const, error: "Connecteur transporteur indisponible." };
  if (!connector.capabilities.supportsCreateShipment) return { ok: false as const, error: "Ce transporteur ne supporte pas l'envoi automatique." };

  const items = all<{ product_name: string; quantity: number }>("SELECT product_name, quantity FROM order_items WHERE order_id = ?", [orderId]);
  const productsLabel = items.map((i) => `${i.product_name} x${i.quantity}`).join(", ") || "Produit";

  const result = await connector.createShipment({
    reference: order.reference,
    customerName: order.customer_name,
    phone: order.normalized_phone,
    wilaya: order.wilaya,
    commune: order.commune,
    address: order.address,
    deliveryType: order.delivery_type,
    productsLabel,
    total: order.total,
    notes: order.notes,
  });
  bumpUsage(merchantId, "delivery_api_calls");

  if (!result.ok) {
    run("UPDATE delivery_connections SET last_error = ?, last_error_at = ?, status = 'error' WHERE id = ?", [result.error, nowIso(), conn.id]);
    return { ok: false as const, error: result.error };
  }

  const shipmentId = uid("shp");
  run(
    `INSERT INTO delivery_shipments (id, merchant_id, order_id, delivery_connection_id, provider, external_order_id, tracking_number, normalized_status, last_update, raw_payload)
     VALUES (?,?,?,?,?,?,?, 'submitted', ?, ?)`,
    [shipmentId, merchantId, orderId, conn.id, conn.provider, result.externalOrderId, result.trackingNumber, nowIso(), JSON.stringify(result.raw).slice(0, 4000)],
  );
  run(
    "UPDATE orders SET delivery_connection_id = ?, delivery_provider = ?, tracking_number = ?, delivery_status = 'submitted', status = CASE WHEN status IN ('confirmed','preparing') THEN 'preparing' ELSE status END, updated_at = ? WHERE id = ?",
    [conn.id, conn.provider, result.trackingNumber, nowIso(), orderId],
  );
  run("INSERT INTO order_events (id, merchant_id, order_id, type, title, description) VALUES (?,?,?,?,?,?)", [
    uid("evt"),
    merchantId,
    orderId,
    "delivery",
    "Commande transmise au transporteur",
    `${conn.provider} — suivi ${result.trackingNumber ?? "en attente"}`,
  ]);
  run("UPDATE delivery_connections SET last_sync_at = ?, status = 'connected', last_error = NULL WHERE id = ?", [nowIso(), conn.id]);
  return { ok: true as const, trackingNumber: result.trackingNumber };
}

export async function refreshTracking(merchantId: string, orderId: string) {
  const order = get<{ id: string; tracking_number: string | null; delivery_connection_id: string | null; delivery_status: string }>(
    "SELECT id, tracking_number, delivery_connection_id, delivery_status FROM orders WHERE id = ? AND merchant_id = ?",
    [orderId, merchantId],
  );
  if (!order?.tracking_number || !order.delivery_connection_id) return { ok: false as const, error: "Aucun numéro de suivi pour cette commande." };
  const connector = connectorForConnection(order.delivery_connection_id, merchantId);
  if (!connector?.capabilities.supportsTracking) return { ok: false as const, error: "Suivi non supporté par ce transporteur." };

  const res = await connector.track(order.tracking_number);
  bumpUsage(merchantId, "delivery_api_calls");
  if (!res.ok) return { ok: false as const, error: res.error };

  applyDeliveryEvent({
    merchantId,
    orderId,
    provider: connector.provider,
    rawStatus: res.rawStatus,
    normalizedStatus: res.normalizedStatus,
    occurredAt: res.updatedAt,
    idempotencyKey: `${order.tracking_number}:${res.rawStatus}:${res.updatedAt.slice(0, 16)}`,
    raw: res.raw,
  });
  return { ok: true as const, status: res.normalizedStatus, rawStatus: res.rawStatus };
}

export function applyDeliveryEvent(params: {
  merchantId: string;
  orderId: string;
  shipmentId?: string | null;
  provider: string;
  rawStatus: string;
  normalizedStatus: DeliveryStatus;
  occurredAt?: string;
  idempotencyKey: string;
  raw?: unknown;
}): { applied: boolean; duplicate?: boolean } {
  const existing = get<{ id: string }>("SELECT id FROM delivery_events WHERE merchant_id = ? AND idempotency_key = ?", [params.merchantId, params.idempotencyKey]);
  if (existing) return { applied: false, duplicate: true };

  const current = get<{ delivery_status: string }>("SELECT delivery_status FROM orders WHERE id = ?", [params.orderId]);
  run(
    `INSERT INTO delivery_events (id, merchant_id, shipment_id, order_id, provider, raw_status, normalized_status, occurred_at, raw_payload, idempotency_key)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [
      uid("dev"),
      params.merchantId,
      params.shipmentId ?? null,
      params.orderId,
      params.provider,
      params.rawStatus,
      params.normalizedStatus,
      params.occurredAt ?? nowIso(),
      params.raw ? JSON.stringify(params.raw).slice(0, 4000) : null,
      params.idempotencyKey,
    ],
  );
  run("UPDATE delivery_shipments SET raw_status = ?, normalized_status = ?, last_update = ? WHERE order_id = ? AND merchant_id = ?", [
    params.rawStatus,
    params.normalizedStatus,
    params.occurredAt ?? nowIso(),
    params.orderId,
    params.merchantId,
  ]);

  // Only trigger downstream automation when the status meaningfully changed.
  if (current?.delivery_status !== params.normalizedStatus) {
    onDeliveryStatusChange(params.orderId, params.merchantId, params.normalizedStatus, params.rawStatus);
  }
  return { applied: true };
}

export function connectionHealth(merchantId: string) {
  const rows = all<{ id: string; provider: string; label: string; status: string; last_sync_at: string | null; last_error: string | null }>(
    "SELECT id, provider, label, status, last_sync_at, last_error FROM delivery_connections WHERE merchant_id = ?",
    [merchantId],
  );
  return rows;
}

export function reportProviderError(merchantId: string, connectionId: string, error: string) {
  run("UPDATE delivery_connections SET status = 'error', last_error = ?, last_error_at = ? WHERE id = ?", [error.slice(0, 300), nowIso(), connectionId]);
  notify({ merchantId, type: "integration_disconnected", severity: "error", title: "Transporteur en erreur", body: error.slice(0, 200), link: "/dashboard/delivery" });
}
