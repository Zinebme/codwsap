"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
import { Section, SectionHead, useLocale } from "@/components/marketing/site";
import { Card, cn } from "@/components/ui";
import { makeT } from "@/lib/i18n";

export default function FaqPage() {
  const locale = useLocale();
  const t = makeT(locale);
  const ar = locale === "ar";

  const faqs = ar
    ? [
        { q: "هل أحتاج حساب واتساب بيزنس رسمي؟", a: "نعم. تربط حسابك الخاص في WhatsApp Business Cloud API. لا نستخدم أي طريقة غير رسمية أو أتمتة واتساب ويب." },
        { q: "هل يمكنني معرفة إن كان الزبون يملك واتساب؟", a: "نعرض الحالة عندما تتوفر إشارة رسمية، مثل رد الزبون. إذا لم تتوفر طريقة رسمية موثوقة نعرض «غير معروف» بدل تخمين نتيجة." },
        { q: "هل جوجل شيت إجباري؟", a: "لا. يمكنك استخدام ويب هوك أو API أو استيراد CSV أو الإدخال اليدوي." },
        { q: "هل المنصة مرتبطة بشركة توصيل واحدة؟", a: "لا. هناك طبقة موصلات عامة تدعم عدة شركات، وكل موصل يحوّل حالاته إلى نموذج موحد." },
        { q: "كيف تحمون جودة رقمي؟", a: "محرك قواعد يمنع التكرار ويفرض فترة تهدئة ويحترم إلغاء الاشتراك ويتجاهل الحالات الداخلية غير المفيدة." },
        { q: "هل تضمنون رفع نسبة التسليم؟", a: "لا. نساعدك على تنظيم التواصل والمتابعة، لكن النتائج تعتمد على منتجك وسوقك وشركة التوصيل." },
        { q: "أين تخزن بياناتي الحساسة؟", a: "كل المفاتيح والرموز مشفرة على الخادم ولا تظهر أبدا في المتصفح." },
        { q: "هل الواجهة متاحة بالعربية؟", a: "نعم، الموقع ولوحة التاجر متاحان بالفرنسية والعربية مع دعم الاتجاه من اليمين لليسار." },
      ]
    : [
        { q: "Ai-je besoin d'un compte WhatsApp Business officiel ?", a: "Oui. Vous connectez votre propre compte WhatsApp Business Cloud API. Aucune méthode non officielle ni automatisation de WhatsApp Web n'est utilisée." },
        { q: "Puis-je savoir si un client a WhatsApp ?", a: "Nous affichons le statut lorsqu'un signal officiel existe, par exemple une réponse du client. En l'absence de méthode officielle fiable, nous affichons « Inconnu » plutôt que d'inventer un résultat." },
        { q: "Google Sheets est-il obligatoire ?", a: "Non. Vous pouvez utiliser un webhook, l'API REST, un import CSV ou la saisie manuelle." },
        { q: "La plateforme dépend-elle d'un seul transporteur ?", a: "Non. Une couche de connecteurs générique gère plusieurs transporteurs, chacun normalisant ses statuts vers un modèle interne commun." },
        { q: "Comment protégez-vous la qualité de mon numéro ?", a: "Un moteur de règles bloque les doublons, impose des cooldowns, respecte les désinscriptions et ignore les statuts internes inutiles au client." },
        { q: "Garantissez-vous une hausse du taux de livraison ?", a: "Non. Nous structurons votre communication et votre suivi, mais les résultats dépendent de votre produit, de votre marché et de votre transporteur." },
        { q: "Où sont stockées mes données sensibles ?", a: "Toutes les clés et jetons sont chiffrés côté serveur et ne sont jamais exposés au navigateur." },
        { q: "L'interface est-elle disponible en arabe ?", a: "Oui, le site public et le tableau de bord marchand sont disponibles en français et en arabe, avec support RTL." },
      ];

  return (
    <Section className="max-w-3xl">
      <SectionHead title={t("faq.title")} />
      <div className="space-y-2">
        {faqs.map((f, i) => (
          <FaqItem key={i} q={f.q} a={f.a} />
        ))}
      </div>
    </Section>
  );
}

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = React.useState(false);
  return (
    <Card className="overflow-hidden">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between gap-4 px-4 py-3.5 text-start">
        <span className="text-[14px] font-medium text-ink-800">{q}</span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-ink-400 transition-transform", open && "rotate-180")} />
      </button>
      {open && <div className="border-t border-ink-100 px-4 py-3.5 text-[13.5px] leading-relaxed text-ink-600">{a}</div>}
    </Card>
  );
}
