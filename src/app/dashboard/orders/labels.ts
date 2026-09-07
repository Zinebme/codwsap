/** Client-side mirror of server suppression reasons (bilingual-friendly FR labels). */
export const SUPPRESSION_LABELS_CLIENT: Record<string, string> = {
  opted_out: "Le client s'est désinscrit des messages.",
  cooldown: "Délai anti-fréquence non écoulé.",
  duplicate: "Un message identique a déjà été envoyé.",
  template_not_approved: "Le template n'est pas approuvé.",
  template_missing: "Aucun template disponible pour cet évènement.",
  not_eligible: "Ce numéro n'est pas éligible à WhatsApp.",
  max_per_order: "Limite de messages par commande atteinte.",
  customer_recently_replied: "Le client vient de répondre, un agent doit prendre le relais.",
  no_meaningful_change: "Aucun changement significatif à communiquer.",
  automation_disabled: "L'automatisation est désactivée.",
  not_relevant: "Évènement non pertinent pour le client.",
};
