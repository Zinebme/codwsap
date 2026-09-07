"use client";

import { MessageSquare, Package, Truck, Bell, ShieldCheck, Users, Zap, BarChart3, Table2 } from "lucide-react";
import { Section, SectionHead, useLocale, CheckItem } from "@/components/marketing/site";
import { Card } from "@/components/ui";
import { makeT } from "@/lib/i18n";

export default function FeaturesPage() {
  const locale = useLocale();
  const t = makeT(locale);
  const ar = locale === "ar";

  const blocks = [
    {
      icon: Package,
      title: ar ? "إدارة الطلبات" : "Gestion des commandes",
      desc: ar ? "جدول قوي مع فلاتر وبحث وإجراءات جماعية وتصدير." : "Tableau performant avec filtres, recherche, actions groupées et export.",
      points: ar
        ? ["15 حالة طلب واضحة", "تعيين الوكلاء والملاحظات الداخلية", "خط زمني كامل لكل طلب", "عرض بطاقات ممتاز على الهاتف"]
        : ["15 statuts de commande clairs", "Assignation d'agents et notes internes", "Timeline complète par commande", "Vue cartes optimisée mobile"],
    },
    {
      icon: MessageSquare,
      title: ar ? "واتساب للأعمال" : "WhatsApp Business",
      desc: ar ? "اربط حسابك الرسمي وأدر كل المحادثات من صندوق واحد." : "Connectez votre compte officiel et gérez toutes les conversations depuis une seule boîte.",
      points: ar
        ? ["واجهة Cloud API الرسمية", "صندوق محادثات موحد", "حالة الرسالة: أرسلت، سلمت، قرئت، فشلت", "مؤشر نافذة 24 ساعة"]
        : ["API officielle Cloud (Meta)", "Inbox unifiée", "Statuts : envoyé, délivré, lu, échec", "Indicateur de fenêtre de 24 h"],
    },
    {
      icon: Truck,
      title: ar ? "التوصيل" : "Livraison",
      desc: ar ? "موصلات متعددة مع حالات موحدة." : "Connecteurs multiples avec statuts normalisés.",
      points: ar
        ? ["إيكوتراك، ياليدين، ZR إكسبرس، نافكس", "إرسال الطلب وتتبعه تلقائيا", "ويب هوك أو استطلاع دوري", "حفظ الحالة الأصلية للمزود"]
        : ["EcoTrack, Yalidine, ZR Express, Navex", "Envoi et suivi automatiques", "Webhooks ou polling planifié", "Conservation du statut brut du transporteur"],
    },
    {
      icon: Zap,
      title: ar ? "الأتمتة" : "Automatisations",
      desc: ar ? "أنواع محددة مسبقا وقابلة للضبط، بدون تعقيد." : "Types prédéfinis et configurables, sans complexité inutile.",
      points: ar
        ? ["تأكيد الطلب برد نعم / لا", "إشعار الشحن والوصول للمكتب", "تذكير واحد عند عدم الرد", "سجل تنفيذ وأخطاء"]
        : ["Confirmation par réponse OUI / NON", "Notifications expédition et bureau", "Un seul rappel sans réponse", "Historique d'exécution et erreurs"],
    },
    {
      icon: ShieldCheck,
      title: ar ? "حماية الجودة" : "Protection qualité",
      desc: ar ? "قواعد تمنع الرسائل غير المفيدة." : "Des règles qui bloquent les messages inutiles.",
      points: ar
        ? ["منع التكرار وفترة التهدئة", "احترام إلغاء الاشتراك", "حد أقصى للرسائل لكل طلب", "توصيات وتنبيهات"]
        : ["Anti-doublon et cooldown", "Respect des opt-out", "Plafond de messages par commande", "Recommandations et alertes"],
    },
    {
      icon: Users,
      title: ar ? "الزبائن" : "Clients",
      desc: ar ? "CRM خفيف مخصص للدفع عند الاستلام." : "CRM léger dédié au COD.",
      points: ar
        ? ["تاريخ الطلبات والرسائل", "حالة واتساب والموافقة", "إحصائيات التسليم والإرجاع", "ملاحظات داخلية"]
        : ["Historique commandes et messages", "Statut WhatsApp et consentement", "Statistiques livraison / retour", "Notes internes"],
    },
    {
      icon: Bell,
      title: ar ? "الإشعارات" : "Notifications",
      desc: ar ? "فقط ما يهم فعلا." : "Uniquement ce qui compte vraiment.",
      points: ar ? ["مركز إشعارات كامل", "تنبيهات تيليغرام اختيارية", "تفضيلات لكل حدث", "شارة غير المقروء"] : ["Centre de notifications complet", "Alertes Telegram optionnelles", "Préférences par évènement", "Badge non lus"],
    },
    {
      icon: Table2,
      title: ar ? "مصادر الطلبات" : "Sources de commandes",
      desc: ar ? "بدون إجبار على أداة واحدة." : "Aucune dépendance à un seul outil.",
      points: ar ? ["جوجل شيت مع ربط الأعمدة", "ويب هوك و REST API", "استيراد CSV", "إنشاء يدوي"] : ["Google Sheets avec mapping de colonnes", "Webhook et API REST", "Import CSV", "Création manuelle"],
    },
    {
      icon: BarChart3,
      title: ar ? "الإحصائيات" : "Statistiques",
      desc: ar ? "مؤشرات مفيدة للقرار." : "Des indicateurs utiles à la décision.",
      points: ar
        ? ["معدل التأكيد والتسليم والإرجاع", "متوسط قيمة الطلب", "أداء واتساب", "فلترة حسب الفترة"]
        : ["Taux de confirmation, livraison, retour", "Panier moyen", "Performance WhatsApp", "Filtrage par période"],
    },
  ];

  return (
    <Section>
      <SectionHead eyebrow={ar ? "الميزات" : "Fonctionnalités"} title={t("features.title")} subtitle={t("features.subtitle")} />
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {blocks.map((b) => (
          <Card key={b.title} className="p-5">
            <div className="mb-3 grid h-9 w-9 place-items-center rounded-lg bg-brand-50">
              <b.icon className="h-[18px] w-[18px] text-brand-600" />
            </div>
            <p className="text-[15px] font-semibold text-ink-900">{b.title}</p>
            <p className="mt-1.5 text-[13px] leading-relaxed text-ink-500">{b.desc}</p>
            <ul className="mt-4 space-y-2">
              {b.points.map((p) => (
                <CheckItem key={p}>{p}</CheckItem>
              ))}
            </ul>
          </Card>
        ))}
      </div>
    </Section>
  );
}
