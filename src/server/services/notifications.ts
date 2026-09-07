import "server-only";
import { get, run, uid } from "@/server/db";
import { enqueueJob } from "@/server/jobs/queue";

export type NotificationType =
  | "new_order"
  | "order_confirmed"
  | "order_cancelled"
  | "customer_reply"
  | "message_failed"
  | "webhook_error"
  | "delivery_status"
  | "parcel_at_office"
  | "delivery_failed"
  | "parcel_returned"
  | "integration_disconnected"
  | "token_expired"
  | "automation_failed"
  | "template_rejected"
  | "high_failure_rate"
  | "low_quality_warning"
  | "subscription_issue";

export const NOTIFICATION_LABELS: Record<NotificationType, string> = {
  new_order: "Nouvelle commande",
  order_confirmed: "Commande confirmée par le client",
  order_cancelled: "Commande annulée par le client",
  customer_reply: "Réponse client WhatsApp",
  message_failed: "Message WhatsApp échoué",
  webhook_error: "Erreur webhook",
  delivery_status: "Changement de statut de livraison",
  parcel_at_office: "Colis arrivé au bureau",
  delivery_failed: "Échec de livraison",
  parcel_returned: "Colis retourné",
  integration_disconnected: "Intégration déconnectée",
  token_expired: "Jeton API expiré",
  automation_failed: "Automatisation en échec",
  template_rejected: "Template rejeté",
  high_failure_rate: "Taux d'échec WhatsApp élevé",
  low_quality_warning: "Alerte qualité WhatsApp",
  subscription_issue: "Problème d'abonnement",
};

/** Events that are noisy by default and therefore opt-in only. */
const DEFAULT_OFF: NotificationType[] = ["delivery_status"];

export async function notify(params: {
  merchantId: string;
  type: NotificationType;
  severity?: "info" | "success" | "warning" | "error";
  title: string;
  body?: string;
  link?: string;
}) {
  const pref = await get<{ dashboard: number; telegram: number }>(
    "SELECT dashboard, telegram FROM notification_preferences WHERE merchant_id = ? AND event_type = ?",
    [params.merchantId, params.type],
  );
  const dashboard = pref ? !!pref.dashboard : !DEFAULT_OFF.includes(params.type);
  const telegram = pref ? !!pref.telegram : false;

  if (dashboard) {
    await run(
      `INSERT INTO notifications (id, merchant_id, type, severity, title, body, link) VALUES (?,?,?,?,?,?,?)`,
      [uid("ntf"), params.merchantId, params.type, params.severity ?? "info", params.title, params.body ?? null, params.link ?? null],
    );
  }
  if (telegram) {
    await enqueueJob({
      merchantId: params.merchantId,
      type: "notify_telegram",
      payload: { title: params.title, body: params.body ?? "" },
    });
  }
}

export async function unreadCount(merchantId: string): Promise<number> {
  const row = await get<{ c: number }>(
    "SELECT COUNT(*) AS c FROM notifications WHERE merchant_id = ? AND read_at IS NULL",
    [merchantId],
  );
  return row?.c ?? 0;
}
