"use client";

import Link from "next/link";
import { Section, SectionHead, useLocale } from "@/components/marketing/site";
import { Button, Card, Badge } from "@/components/ui";
import { makeT } from "@/lib/i18n";

export default function HowPage() {
  const locale = useLocale();
  const t = makeT(locale);
  const ar = locale === "ar";
  const withLang = (h: string) => (locale === "ar" ? `${h}?lang=ar` : h);

  const steps = [
    { n: 1, t: t("how.s1.t"), d: t("how.s1.d"), extra: ar ? "اختر مصدرا واحدا أو أكثر. يمكنك تخطي هذه الخطوة والعودة إليها لاحقا." : "Choisissez une ou plusieurs sources. Cette étape peut être reportée." },
    { n: 2, t: t("how.s2.t"), d: t("how.s2.d"), extra: ar ? "تبقى بياناتك مخزنة ومشفرة على الخادم فقط." : "Vos identifiants restent chiffrés côté serveur, jamais exposés au navigateur." },
    { n: 3, t: t("how.s3.t"), d: t("how.s3.d"), extra: ar ? "كل موصل يعلن قدراته: إنشاء، تتبع، إلغاء، ويب هوك." : "Chaque connecteur déclare ses capacités : création, suivi, annulation, webhooks." },
    { n: 4, t: t("how.s4.t"), d: t("how.s4.d"), extra: ar ? "محرك القواعد يمنع الرسائل المكررة أو غير المفيدة." : "Le moteur de règles bloque les messages en double ou inutiles." },
  ];

  const flow = ar
    ? [
        { s: "طلب جديد", m: "رسالة تأكيد", tone: "blue" as const },
        { s: "رد الزبون نعم", m: "لا رسالة — تحديث الحالة", tone: "teal" as const },
        { s: "قيد التحضير", m: "لا رسالة", tone: "gray" as const },
        { s: "تم الشحن", m: "إشعار شحن", tone: "blue" as const },
        { s: "حالات داخلية للناقل", m: "لا رسالة", tone: "gray" as const },
        { s: "في المكتب", m: "تذكير بالاستلام", tone: "violet" as const },
        { s: "تم التسليم", m: "رسالة شكر", tone: "green" as const },
      ]
    : [
        { s: "Nouvelle commande", m: "Demande de confirmation", tone: "blue" as const },
        { s: "Client répond OUI", m: "Aucun message — statut mis à jour", tone: "teal" as const },
        { s: "En préparation", m: "Aucun message", tone: "gray" as const },
        { s: "Expédiée", m: "Notification d'expédition", tone: "blue" as const },
        { s: "Statuts internes transporteur", m: "Aucun message", tone: "gray" as const },
        { s: "Au bureau de livraison", m: "Rappel de retrait", tone: "violet" as const },
        { s: "Livrée", m: "Message de remerciement", tone: "green" as const },
      ];

  return (
    <>
      <Section>
        <SectionHead eyebrow={ar ? "الخطوات" : "Étapes"} title={t("how.title")} subtitle={t("how.subtitle")} />
        <div className="grid gap-3 sm:grid-cols-2">
          {steps.map((s) => (
            <Card key={s.n} className="p-5">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-ink-900 text-[12.5px] font-semibold text-white">{s.n}</span>
              <p className="mt-3 text-[15px] font-semibold text-ink-900">{s.t}</p>
              <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-600">{s.d}</p>
              <p className="mt-3 rounded-lg bg-ink-50 p-2.5 text-[12.5px] leading-relaxed text-ink-500">{s.extra}</p>
            </Card>
          ))}
        </div>
      </Section>

      <div className="border-y border-ink-100 bg-ink-50/60">
        <Section>
          <SectionHead title={ar ? "ما الذي يتلقاه الزبون فعلا" : "Ce que le client reçoit réellement"} subtitle={ar ? "رسائل مفيدة فقط، لا إزعاج." : "Uniquement des messages utiles, jamais du spam."} />
          <Card className="overflow-hidden">
            <div className="divide-y divide-ink-100">
              {flow.map((f) => (
                <div key={f.s} className="flex flex-col gap-1.5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2.5">
                    <Badge tone={f.tone} dot>
                      {f.s}
                    </Badge>
                  </div>
                  <p className="text-[13px] text-ink-600">{f.m}</p>
                </div>
              ))}
            </div>
          </Card>
        </Section>
      </div>

      <Section className="text-center">
        <Link href={withLang("/signup")}>
          <Button variant="primary" size="lg">
            {t("hero.cta")}
          </Button>
        </Link>
      </Section>
    </>
  );
}
