"use client";

import Link from "next/link";
import { MessageSquare, Truck, Table2, Send, Webhook, Code2 } from "lucide-react";
import { Section, SectionHead, useLocale } from "@/components/marketing/site";
import { Card, Badge, Button } from "@/components/ui";
import { makeT } from "@/lib/i18n";

export default function IntegrationsPage() {
  const locale = useLocale();
  const t = makeT(locale);
  const ar = locale === "ar";
  const withLang = (h: string) => (locale === "ar" ? `${h}?lang=ar` : h);

  const groups = [
    {
      title: ar ? "واتساب" : "WhatsApp",
      icon: MessageSquare,
      items: [{ name: "WhatsApp Business Cloud API (Meta)", state: "available" as const }],
    },
    {
      title: ar ? "شركات التوصيل" : "Transporteurs",
      icon: Truck,
      items: [
        { name: "EcoTrack (compatible)", state: "available" as const },
        { name: "Yalidine", state: "available" as const },
        { name: "ZR Express", state: "available" as const },
        { name: "Navex", state: "available" as const },
        { name: ar ? "موصل عام (API / ويب هوك)" : "Connecteur générique (API / webhook)", state: "available" as const },
      ],
    },
    {
      title: ar ? "مصادر الطلبات" : "Sources de commandes",
      icon: Table2,
      items: [
        { name: "Google Sheets", state: "available" as const },
        { name: ar ? "ويب هوك" : "Webhook", state: "available" as const },
        { name: "API REST", state: "available" as const },
        { name: ar ? "استيراد CSV" : "Import CSV", state: "available" as const },
        { name: ar ? "منصات التجارة الإلكترونية" : "Plateformes e-commerce", state: "soon" as const },
      ],
    },
    {
      title: ar ? "الإشعارات" : "Notifications",
      icon: Send,
      items: [
        { name: "Telegram", state: "available" as const },
        { name: "Email", state: "soon" as const },
      ],
    },
  ];

  return (
    <Section>
      <SectionHead eyebrow={ar ? "التكاملات" : "Intégrations"} title={t("int.title")} subtitle={t("int.subtitle")} />
      <div className="grid gap-3 md:grid-cols-2">
        {groups.map((g) => (
          <Card key={g.title} className="p-5">
            <div className="flex items-center gap-2.5">
              <div className="grid h-9 w-9 place-items-center rounded-lg bg-brand-50">
                <g.icon className="h-[18px] w-[18px] text-brand-600" />
              </div>
              <p className="text-[15px] font-semibold text-ink-900">{g.title}</p>
            </div>
            <ul className="mt-4 divide-y divide-ink-100">
              {g.items.map((i) => (
                <li key={i.name} className="flex items-center justify-between gap-3 py-2.5">
                  <span className="text-[13.5px] text-ink-700">{i.name}</span>
                  <Badge tone={i.state === "available" ? "green" : "gray"}>{i.state === "available" ? t("int.available") : t("int.soon")}</Badge>
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>

      <Card className="mt-4 p-5">
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div className="flex items-start gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-ink-100">
              <Webhook className="h-[18px] w-[18px] text-ink-600" />
            </div>
            <div>
              <p className="text-[15px] font-semibold text-ink-900">{t("int.request")}</p>
              <p className="mt-1 text-[13px] text-ink-500">
                {ar ? "أرسل لنا الطلب وسنقيّم إضافة الموصل." : "Envoyez-nous une demande, nous évaluerons l'ajout du connecteur."}
              </p>
            </div>
          </div>
          <Link href={withLang("/contact")}>
            <Button variant="primary">{t("nav.contact")}</Button>
          </Link>
        </div>
      </Card>

      <Card className="mt-4 p-5">
        <div className="flex items-center gap-2.5">
          <Code2 className="h-[18px] w-[18px] text-ink-500" />
          <p className="text-[14px] font-semibold text-ink-900">{ar ? "مثال إرسال طلب عبر API" : "Exemple d'envoi de commande via API"}</p>
        </div>
        <pre className="mt-3 overflow-x-auto rounded-xl bg-ink-900 p-4 text-[12px] leading-relaxed text-ink-100" dir="ltr">
{`POST /api/webhooks/orders/{merchant_id}
Authorization: Bearer <votre_cle_api>
Content-Type: application/json

{
  "external_id": "SHOP-8891",
  "customer_name": "Amine B.",
  "phone": "0550 12 34 56",
  "wilaya": "Alger",
  "commune": "Bab Ezzouar",
  "delivery_type": "home",
  "items": [{ "product_name": "Montre X", "quantity": 1, "unit_price": 4500 }],
  "delivery_price": 500
}`}
        </pre>
      </Card>
    </Section>
  );
}
