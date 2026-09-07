export const ORDER_STATUSES = [
  "new",
  "awaiting_confirmation",
  "confirmed",
  "cancelled_by_customer",
  "postponed",
  "no_response",
  "preparing",
  "shipped",
  "in_transit",
  "at_office",
  "out_for_delivery",
  "delivered",
  "delivery_failed",
  "return_requested",
  "returned",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const DELIVERY_STATUSES = [
  "pending",
  "created",
  "submitted",
  "accepted",
  "shipped",
  "in_transit",
  "at_agency",
  "out_for_delivery",
  "delivered",
  "delivery_failed",
  "returned",
] as const;
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

export const WHATSAPP_AVAILABILITY = ["available", "unavailable", "unknown", "check_failed"] as const;
export type WhatsappAvailability = (typeof WHATSAPP_AVAILABILITY)[number];

export const MESSAGE_STATUSES = ["queued", "sent", "delivered", "read", "failed", "rejected", "received"] as const;

export type Tone = "green" | "red" | "orange" | "amber" | "blue" | "gray" | "violet" | "teal";

export const ORDER_STATUS_META: Record<OrderStatus, { fr: string; ar: string; tone: Tone }> = {
  new: { fr: "Nouvelle", ar: "جديد", tone: "blue" },
  awaiting_confirmation: { fr: "À confirmer", ar: "في انتظار التأكيد", tone: "amber" },
  confirmed: { fr: "Confirmée", ar: "مؤكد", tone: "teal" },
  cancelled_by_customer: { fr: "Annulée client", ar: "ألغاه الزبون", tone: "red" },
  postponed: { fr: "Reportée", ar: "مؤجل", tone: "violet" },
  no_response: { fr: "Sans réponse", ar: "لا يرد", tone: "gray" },
  preparing: { fr: "En préparation", ar: "قيد التحضير", tone: "blue" },
  shipped: { fr: "Expédiée", ar: "تم الشحن", tone: "blue" },
  in_transit: { fr: "En transit", ar: "في الطريق", tone: "blue" },
  at_office: { fr: "Au bureau", ar: "في المكتب", tone: "violet" },
  out_for_delivery: { fr: "En livraison", ar: "خرج للتوصيل", tone: "teal" },
  delivered: { fr: "Livrée", ar: "تم التسليم", tone: "green" },
  delivery_failed: { fr: "Échec livraison", ar: "فشل التسليم", tone: "red" },
  return_requested: { fr: "Retour demandé", ar: "طلب إرجاع", tone: "orange" },
  returned: { fr: "Retournée", ar: "مرتجع", tone: "orange" },
};

export const DELIVERY_STATUS_META: Record<DeliveryStatus, { fr: string; ar: string; tone: Tone }> = {
  pending: { fr: "Non envoyée", ar: "لم ترسل", tone: "gray" },
  created: { fr: "Créée", ar: "أنشئت", tone: "gray" },
  submitted: { fr: "Transmise", ar: "أرسلت", tone: "blue" },
  accepted: { fr: "Acceptée", ar: "مقبولة", tone: "blue" },
  shipped: { fr: "Expédiée", ar: "تم الشحن", tone: "blue" },
  in_transit: { fr: "En transit", ar: "في الطريق", tone: "blue" },
  at_agency: { fr: "À l'agence", ar: "في الوكالة", tone: "violet" },
  out_for_delivery: { fr: "En livraison", ar: "خرج للتوصيل", tone: "teal" },
  delivered: { fr: "Livrée", ar: "تم التسليم", tone: "green" },
  delivery_failed: { fr: "Échec", ar: "فشل", tone: "red" },
  returned: { fr: "Retournée", ar: "مرتجع", tone: "orange" },
};

export const WA_AVAILABILITY_META: Record<WhatsappAvailability, { fr: string; ar: string; tone: Tone }> = {
  available: { fr: "WhatsApp OK", ar: "واتساب متاح", tone: "green" },
  unavailable: { fr: "Pas de WhatsApp", ar: "لا يوجد واتساب", tone: "red" },
  unknown: { fr: "Inconnu", ar: "غير معروف", tone: "gray" },
  check_failed: { fr: "Vérif. échouée", ar: "فشل التحقق", tone: "amber" },
};

export const MESSAGE_STATUS_META: Record<string, { fr: string; ar: string; tone: Tone }> = {
  queued: { fr: "En file", ar: "في الانتظار", tone: "gray" },
  sent: { fr: "Envoyé", ar: "أرسلت", tone: "blue" },
  delivered: { fr: "Délivré", ar: "تم التسليم", tone: "teal" },
  read: { fr: "Lu", ar: "مقروء", tone: "green" },
  failed: { fr: "Échec", ar: "فشل", tone: "red" },
  rejected: { fr: "Rejeté", ar: "مرفوض", tone: "red" },
  received: { fr: "Reçu", ar: "وارد", tone: "violet" },
  none: { fr: "—", ar: "—", tone: "gray" },
  replied: { fr: "A répondu", ar: "رد", tone: "green" },
};

export const AUTOMATION_TYPES = [
  "new_order_confirmation",
  "reply_yes_confirm",
  "reply_no_cancel",
  "shipped_notice",
  "at_office_notice",
  "out_for_delivery_notice",
  "delivered_thanks",
  "no_response_reminder",
  "failed_message_alert",
] as const;
export type AutomationType = (typeof AUTOMATION_TYPES)[number];

export const AUTOMATION_META: Record<AutomationType, { fr: string; ar: string; desc_fr: string; desc_ar: string }> = {
  new_order_confirmation: {
    fr: "Nouvelle commande → demande de confirmation",
    ar: "طلب جديد ← رسالة تأكيد",
    desc_fr: "Envoie le template de confirmation dès l'arrivée d'une commande.",
    desc_ar: "إرسال قالب التأكيد فور وصول الطلب.",
  },
  reply_yes_confirm: {
    fr: "Réponse OUI → commande confirmée",
    ar: "الرد بنعم ← تأكيد الطلب",
    desc_fr: "Le client répond OUI : la commande passe en Confirmée.",
    desc_ar: "عند رد الزبون بنعم يتحول الطلب إلى مؤكد.",
  },
  reply_no_cancel: {
    fr: "Réponse NON → commande annulée",
    ar: "الرد بلا ← إلغاء الطلب",
    desc_fr: "Le client répond NON : la commande passe en Annulée.",
    desc_ar: "عند رد الزبون بلا يتحول الطلب إلى ملغى.",
  },
  shipped_notice: {
    fr: "Colis expédié → notification",
    ar: "تم الشحن ← إشعار",
    desc_fr: "Un seul message à l'expédition réelle, pas aux statuts internes.",
    desc_ar: "رسالة واحدة عند الشحن الفعلي فقط.",
  },
  at_office_notice: {
    fr: "Colis au bureau → rappel de retrait",
    ar: "الطرد في المكتب ← تذكير",
    desc_fr: "Notification utile lorsque le colis est disponible au bureau.",
    desc_ar: "إشعار عند توفر الطرد في المكتب.",
  },
  out_for_delivery_notice: {
    fr: "En cours de livraison → notification",
    ar: "خرج للتوصيل ← إشعار",
    desc_fr: "Optionnel : prévenir le client le jour de la livraison.",
    desc_ar: "اختياري: إعلام الزبون يوم التوصيل.",
  },
  delivered_thanks: {
    fr: "Livrée → message de remerciement",
    ar: "تم التسليم ← رسالة شكر",
    desc_fr: "Remerciement et demande de satisfaction après livraison.",
    desc_ar: "شكر وطلب رأي بعد التسليم.",
  },
  no_response_reminder: {
    fr: "Sans réponse → un seul rappel",
    ar: "بدون رد ← تذكير واحد",
    desc_fr: "Un rappel unique après un délai configurable.",
    desc_ar: "تذكير واحد بعد مدة قابلة للضبط.",
  },
  failed_message_alert: {
    fr: "Message échoué → alerte tableau de bord",
    ar: "فشل الرسالة ← تنبيه",
    desc_fr: "Crée une alerte interne, aucun message client.",
    desc_ar: "ينشئ تنبيها داخليا دون رسالة للزبون.",
  },
};

export const ROLES = ["owner", "admin", "agent"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_META: Record<Role, { fr: string; ar: string }> = {
  owner: { fr: "Propriétaire", ar: "المالك" },
  admin: { fr: "Administrateur", ar: "مسؤول" },
  agent: { fr: "Agent", ar: "وكيل" },
};

/** Server-side permission matrix. Agents cannot touch integrations/billing/users. */
export const PERMISSIONS = {
  "orders.read": ["owner", "admin", "agent"],
  "orders.write": ["owner", "admin", "agent"],
  "customers.read": ["owner", "admin", "agent"],
  "customers.write": ["owner", "admin", "agent"],
  "conversations.read": ["owner", "admin", "agent"],
  "conversations.write": ["owner", "admin", "agent"],
  "analytics.read": ["owner", "admin", "agent"],
  "notifications.read": ["owner", "admin", "agent"],
  "templates.write": ["owner", "admin"],
  "automations.write": ["owner", "admin"],
  "integrations.read": ["owner", "admin"],
  "integrations.write": ["owner", "admin"],
  "delivery.write": ["owner", "admin"],
  "settings.write": ["owner", "admin"],
  "users.write": ["owner", "admin"],
  "billing.read": ["owner", "admin"],
} as const;
export type Permission = keyof typeof PERMISSIONS;

export function roleCan(role: Role, permission: Permission): boolean {
  return (PERMISSIONS[permission] as readonly string[]).includes(role);
}

export const WILAYAS: string[] = [
  "Adrar","Chlef","Laghouat","Oum El Bouaghi","Batna","Béjaïa","Biskra","Béchar","Blida","Bouira",
  "Tamanrasset","Tébessa","Tlemcen","Tiaret","Tizi Ouzou","Alger","Djelfa","Jijel","Sétif","Saïda",
  "Skikda","Sidi Bel Abbès","Annaba","Guelma","Constantine","Médéa","Mostaganem","M'Sila","Mascara","Ouargla",
  "Oran","El Bayadh","Illizi","Bordj Bou Arreridj","Boumerdès","El Tarf","Tindouf","Tissemsilt","El Oued","Khenchela",
  "Souk Ahras","Tipaza","Mila","Aïn Defla","Naâma","Aïn Témouchent","Ghardaïa","Relizane","Timimoun","Bordj Badji Mokhtar",
  "Ouled Djellal","Béni Abbès","In Salah","In Guezzam","Touggourt","Djanet","El M'Ghair","El Meniaa",
];

export function formatDzd(value: number, locale = "fr-DZ"): string {
  return `${new Intl.NumberFormat(locale === "ar" ? "ar-DZ" : "fr-FR", { maximumFractionDigits: 0 }).format(value || 0)} DA`;
}
