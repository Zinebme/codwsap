"use client";

import Link from "next/link";
import { Section, SectionHead, useLocale, CheckItem } from "@/components/marketing/site";
import { Card, Badge, Button } from "@/components/ui";
import { makeT } from "@/lib/i18n";
import { cn } from "@/components/ui";

export default function PricingPage() {
  const locale = useLocale();
  const t = makeT(locale);
  const ar = locale === "ar";
  const withLang = (h: string) => (locale === "ar" ? `${h}?lang=ar` : h);

  const plans = [
    {
      code: "trial",
      name: ar ? "تجربة" : "Essai",
      price: "0",
      desc: ar ? "14 يوما لاختبار المنصة." : "14 jours pour tester la plateforme.",
      features: ar
        ? ["200 طلب في الشهر", "500 رسالة واتساب", "مستخدمان", "موصل توصيل واحد", "كل الأتمتة الأساسية"]
        : ["200 commandes / mois", "500 messages WhatsApp", "2 utilisateurs", "1 connecteur de livraison", "Toutes les automatisations de base"],
    },
    {
      code: "starter",
      name: "Starter",
      price: "4 900",
      popular: true,
      desc: ar ? "للمتاجر التي بدأت تنمو." : "Pour les boutiques en croissance.",
      features: ar
        ? ["2 000 طلب في الشهر", "10 000 رسالة", "5 مستخدمين", "موصلا توصيل", "لوحة جودة واتساب", "تنبيهات تيليغرام"]
        : ["2 000 commandes / mois", "10 000 messages", "5 utilisateurs", "2 connecteurs de livraison", "Tableau qualité WhatsApp", "Alertes Telegram"],
    },
    {
      code: "pro",
      name: "Pro",
      price: "9 900",
      desc: ar ? "للعمليات الكبيرة والفرق." : "Pour les opérations importantes et les équipes.",
      features: ar
        ? ["10 000 طلب في الشهر", "50 000 رسالة", "15 مستخدما", "5 موصلات توصيل", "API و ويب هوك", "أولوية في الدعم"]
        : ["10 000 commandes / mois", "50 000 messages", "15 utilisateurs", "5 connecteurs de livraison", "API et webhooks", "Support prioritaire"],
    },
  ];

  return (
    <Section>
      <SectionHead eyebrow={ar ? "الأسعار" : "Tarifs"} title={t("pricing.title")} subtitle={t("pricing.subtitle")} />
      <div className="grid gap-3 lg:grid-cols-3">
        {plans.map((p) => (
          <Card key={p.code} className={cn("relative flex flex-col p-5", p.popular && "border-brand-300 ring-1 ring-brand-200")}>
            {p.popular && (
              <div className="absolute -top-2.5 start-5">
                <Badge tone="blue">{t("pricing.popular")}</Badge>
              </div>
            )}
            <p className="text-[15px] font-semibold text-ink-900">{p.name}</p>
            <p className="mt-1 text-[13px] text-ink-500">{p.desc}</p>
            <p className="mt-4">
              <span className="text-3xl font-semibold text-ink-900 tabular">{p.price}</span>
              <span className="ms-1.5 text-[13px] text-ink-500">DA {t("pricing.month")}</span>
            </p>
            <ul className="mt-5 flex-1 space-y-2">
              {p.features.map((f) => (
                <CheckItem key={f}>{f}</CheckItem>
              ))}
            </ul>
            <Link href={withLang("/signup")} className="mt-6">
              <Button variant={p.popular ? "primary" : "secondary"} className="w-full justify-center">
                {t("pricing.cta")}
              </Button>
            </Link>
          </Card>
        ))}
      </div>
      <p className="mt-6 text-center text-[12.5px] text-ink-400">
        {ar
          ? "الأسعار بالدينار الجزائري دون احتساب رسوم واتساب من ميتا. التفعيل يدوي حاليا."
          : "Prix en dinars algériens, hors frais de conversation facturés par Meta. Activation manuelle pour le moment."}
      </p>
    </Section>
  );
}
