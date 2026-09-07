import "server-only";
import { run, uid } from "@/server/db";
import type { AutomationType } from "@/lib/domain";

type Seed = { name: string; event: AutomationType | null; category: "utility" | "marketing"; body: string; variables: string[] };

/**
 * Starter template library. Templates start as "draft" — merchants must submit
 * them to Meta for approval; automated sends require an approved template.
 */
export const TEMPLATE_SEEDS: Seed[] = [
  {
    name: "order_confirmation_request",
    event: "new_order_confirmation",
    category: "utility",
    body: "Bonjour {{1}}, nous avons bien reçu votre commande {{2}} d'un montant de {{3}}. Répondez OUI pour confirmer ou NON pour annuler.",
    variables: ["customer_name", "order_ref", "total"],
  },
  { name: "order_confirmed", event: null, category: "utility", body: "Merci {{1}} ! Votre commande {{2}} est confirmée. Nous préparons votre colis.", variables: ["customer_name", "order_ref"] },
  { name: "order_cancelled", event: null, category: "utility", body: "Bonjour {{1}}, votre commande {{2}} a bien été annulée. À bientôt.", variables: ["customer_name", "order_ref"] },
  { name: "order_preparing", event: null, category: "utility", body: "Bonjour {{1}}, votre commande {{2}} est en cours de préparation.", variables: ["customer_name", "order_ref"] },
  {
    name: "order_shipped",
    event: "shipped_notice",
    category: "utility",
    body: "Bonjour {{1}}, votre colis {{2}} a été expédié. Numéro de suivi : {{tracking}}.",
    variables: ["customer_name", "order_ref", "tracking"],
  },
  {
    name: "parcel_at_office",
    event: "at_office_notice",
    category: "utility",
    body: "Bonjour {{1}}, votre colis {{2}} est disponible au bureau de livraison de {{wilaya}}. Merci de le retirer dans les meilleurs délais.",
    variables: ["customer_name", "order_ref", "wilaya"],
  },
  {
    name: "out_for_delivery",
    event: "out_for_delivery_notice",
    category: "utility",
    body: "Bonjour {{1}}, votre colis {{2}} est en cours de livraison aujourd'hui. Merci de rester joignable.",
    variables: ["customer_name", "order_ref"],
  },
  {
    name: "delivery_reminder",
    event: "no_response_reminder",
    category: "utility",
    body: "Bonjour {{1}}, nous n'avons pas encore reçu votre confirmation pour la commande {{2}}. Répondez OUI pour confirmer.",
    variables: ["customer_name", "order_ref"],
  },
  { name: "delivery_failed", event: null, category: "utility", body: "Bonjour {{1}}, la livraison de votre colis {{2}} n'a pas pu aboutir. Souhaitez-vous une nouvelle tentative ?", variables: ["customer_name", "order_ref"] },
  {
    name: "order_delivered",
    event: "delivered_thanks",
    category: "utility",
    body: "Merci {{1}} ! Votre commande {{2}} a bien été livrée. Nous restons disponibles si besoin.",
    variables: ["customer_name", "order_ref"],
  },
  { name: "satisfaction_request", event: null, category: "marketing", body: "Bonjour {{1}}, êtes-vous satisfait de votre commande {{2}} ? Votre avis nous aide beaucoup. Répondez STOP pour ne plus recevoir ce type de message.", variables: ["customer_name", "order_ref"] },
];

export async function seedTemplates(merchantId: string) {
  for (const t of TEMPLATE_SEEDS) {
    await run(
      `INSERT OR IGNORE INTO whatsapp_templates (id, merchant_id, name, category, language, status, body, variables, event_key)
       VALUES (?,?,?,?, 'fr', 'draft', ?, ?, ?)`,
      [uid("tpl"), merchantId, t.name, t.category, t.body, JSON.stringify(t.variables), t.event],
    );
  }
}
