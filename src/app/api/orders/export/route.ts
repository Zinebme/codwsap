import { requirePermission } from "@/server/auth/session";
import { jsonError } from "@/server/http";
import { listOrders } from "@/server/services/orders";
import { ORDER_STATUS_META, type OrderStatus } from "@/lib/domain";

export const dynamic = "force-dynamic";

const COLUMNS = [
  "Référence",
  "Date",
  "Client",
  "Téléphone",
  "Wilaya",
  "Commune",
  "Quantité",
  "Total DA",
  "Transporteur",
  "Suivi",
  "Statut",
  "Statut livraison",
  "WhatsApp",
];

export async function GET(req: Request) {
  try {
    const ctx = await requirePermission("orders.read");
    const p = new URL(req.url).searchParams;
    const multi = (k: string) => p.getAll(k).flatMap((v) => v.split(",")).filter(Boolean);

    // Bounded export (avoids loading tens of thousands of rows into memory).
    const { rows } = listOrders({
      merchantId: ctx.merchantId,
      q: p.get("q") ?? undefined,
      status: multi("status"),
      deliveryStatus: multi("deliveryStatus"),
      provider: p.get("provider") ?? undefined,
      from: p.get("from") ?? undefined,
      to: p.get("to") ?? undefined,
      includeTest: p.get("test") === "1",
      page: 1,
      pageSize: 5000,
      allowLargePage: true,
    });

    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = [COLUMNS.join(";")];
    for (const r of rows as Record<string, unknown>[]) {
      lines.push(
        [
          r.reference,
          r.created_at,
          r.customer_name,
          r.original_phone,
          r.wilaya,
          r.commune,
          r.quantity,
          r.total,
          r.delivery_provider,
          r.tracking_number,
          ORDER_STATUS_META[r.status as OrderStatus]?.fr ?? r.status,
          r.delivery_status,
          r.whatsapp_status,
        ]
          .map(esc)
          .join(";"),
      );
    }
    return new Response(`\uFEFF${lines.join("\n")}`, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="commandes-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  } catch (e) {
    return jsonError(e);
  }
}
