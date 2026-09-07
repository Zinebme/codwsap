"use client";

import Link from "next/link";
import {
  MessageSquare, Package, Truck, Bell, Repeat, ShieldCheck, Smartphone, Layers,
  ArrowRight, CheckCircle2, Phone, Clock,
} from "lucide-react";
import { Section, SectionHead, useLocale } from "@/components/marketing/site";
import { Button, Badge, Card } from "@/components/ui";
import { makeT } from "@/lib/i18n";

const FEATURES = [
  { icon: MessageSquare, t: "f.wa.title", d: "f.wa.desc" },
  { icon: Package, t: "f.cod.title", d: "f.cod.desc" },
  { icon: Truck, t: "f.track.title", d: "f.track.desc" },
  { icon: Repeat, t: "f.follow.title", d: "f.follow.desc" },
  { icon: Bell, t: "f.notif.title", d: "f.notif.desc" },
  { icon: Layers, t: "f.multi.title", d: "f.multi.desc" },
  { icon: ShieldCheck, t: "f.quality.title", d: "f.quality.desc" },
  { icon: Smartphone, t: "f.simple.title", d: "f.simple.desc" },
];

export default function HomePage() {
  const locale = useLocale();
  const t = makeT(locale);
  const withLang = (h: string) => (locale === "ar" ? `${h}?lang=ar` : h);
  const ar = locale === "ar";

  return (
    <>
      {/* Hero */}
      <div className="border-b border-ink-100 bg-gradient-to-b from-ink-50/70 to-white">
        <Section className="py-14 sm:py-20">
          <div className="grid items-center gap-10 lg:grid-cols-[1.05fr_0.95fr]">
            <div>
              <Badge tone="blue" dot>
                {t("hero.badge")}
              </Badge>
              <h1 className="mt-4 text-[32px] font-semibold leading-[1.15] tracking-tight text-ink-900 sm:text-[42px]">{t("hero.title")}</h1>
              <p className="mt-4 max-w-xl text-[15.5px] leading-relaxed text-ink-600">{t("hero.subtitle")}</p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link href={withLang("/signup")}>
                  <Button variant="primary" size="lg">
                    {t("hero.cta")} <ArrowRight className="h-4 w-4 rtl:rotate-180" />
                  </Button>
                </Link>
                <Link href={withLang("/features")}>
                  <Button size="lg">{t("hero.cta2")}</Button>
                </Link>
              </div>
              <p className="mt-4 text-[12.5px] text-ink-400">{t("hero.note")}</p>
            </div>
            <HeroPreview ar={ar} />
          </div>
        </Section>
      </div>

      {/* Trust strip */}
      <div className="border-b border-ink-100 bg-white">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-px bg-ink-100 px-0 sm:grid-cols-4">
          {[
            { v: "58", l: ar ? "ولاية مغطاة" : "Wilayas couvertes" },
            { v: "4+", l: ar ? "شركات توصيل" : "Transporteurs" },
            { v: "24/7", l: ar ? "أتمتة تعمل دائما" : "Automatisations actives" },
            { v: "FR / AR", l: ar ? "واجهة ثنائية اللغة" : "Interface bilingue" },
          ].map((s) => (
            <div key={s.l} className="bg-white px-4 py-5 text-center">
              <p className="text-xl font-semibold text-ink-900">{s.v}</p>
              <p className="mt-0.5 text-[12.5px] text-ink-500">{s.l}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Features */}
      <Section>
        <SectionHead eyebrow={ar ? "الميزات" : "Fonctionnalités"} title={t("features.title")} subtitle={t("features.subtitle")} />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f) => (
            <Card key={f.t} className="p-4 transition-shadow hover:shadow-md">
              <div className="mb-3 grid h-9 w-9 place-items-center rounded-lg bg-brand-50">
                <f.icon className="h-4.5 w-4.5 text-brand-600" style={{ width: 18, height: 18 }} />
              </div>
              <p className="text-[14px] font-semibold text-ink-900">{t(f.t)}</p>
              <p className="mt-1.5 text-[13px] leading-relaxed text-ink-500">{t(f.d)}</p>
            </Card>
          ))}
        </div>
      </Section>

      {/* Quality protection highlight */}
      <div className="border-y border-ink-100 bg-ink-50/60">
        <Section>
          <div className="grid items-center gap-10 lg:grid-cols-2">
            <div>
              <Badge tone="green" dot>
                {ar ? "حماية الجودة" : "Protection de la qualité"}
              </Badge>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight text-ink-900 sm:text-[28px]">
                {ar ? "لا ترسل رسالة عند كل تغيير حالة." : "N'envoyez pas un message à chaque changement de statut."}
              </h2>
              <p className="mt-3 text-[15px] leading-relaxed text-ink-600">
                {ar
                  ? "محرك القواعد يقرر ما إذا كانت الرسالة مفيدة فعلا للزبون: منع التكرار، فترة تهدئة، احترام إلغاء الاشتراك، وتجاهل الحالات الداخلية لشركة التوصيل."
                  : "Notre moteur de règles décide si un message est réellement utile au client : anti-doublon, cooldown, respect des désinscriptions et filtrage des statuts internes du transporteur."}
              </p>
              <ul className="mt-5 space-y-2.5">
                {(ar
                  ? ["طلب جديد ← رسالة تأكيد واحدة", "حالات التحضير الداخلية ← بدون رسائل", "وصول الطرد للمكتب ← إشعار مفيد", "تم التسليم ← رسالة شكر"]
                  : [
                      "Nouvelle commande → une seule demande de confirmation",
                      "Statuts internes de préparation → aucun message",
                      "Colis arrivé au bureau → notification utile",
                      "Livrée → message de remerciement",
                    ]
                ).map((x) => (
                  <li key={x} className="flex items-start gap-2.5 text-[13.5px] text-ink-700">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                    {x}
                  </li>
                ))}
              </ul>
            </div>
            <QualityPreview ar={ar} />
          </div>
        </Section>
      </div>

      {/* How it works */}
      <Section>
        <SectionHead eyebrow={ar ? "البدء" : "Démarrage"} title={t("how.title")} subtitle={t("how.subtitle")} />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((n) => (
            <Card key={n} className="p-4">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-ink-900 text-[12.5px] font-semibold text-white">{n}</span>
              <p className="mt-3 text-[14px] font-semibold text-ink-900">{t(`how.s${n}.t`)}</p>
              <p className="mt-1.5 text-[13px] leading-relaxed text-ink-500">{t(`how.s${n}.d`)}</p>
            </Card>
          ))}
        </div>
      </Section>

      {/* CTA */}
      <Section className="pb-20">
        <div className="rounded-2xl border border-ink-200 bg-ink-900 px-6 py-10 text-center sm:px-12">
          <h2 className="text-2xl font-semibold tracking-tight text-white sm:text-[28px]">
            {ar ? "ابدأ بأتمتة طلباتك اليوم" : "Commencez à automatiser vos commandes dès aujourd'hui"}
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-[14.5px] leading-relaxed text-ink-300">
            {ar ? "أنشئ حسابك، اربط واتساب وشركة التوصيل، وفعّل الأتمتة في أقل من 30 دقيقة." : "Créez votre compte, connectez WhatsApp et votre transporteur, activez vos automatisations en moins de 30 minutes."}
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <Link href={withLang("/signup")}>
              <Button variant="primary" size="lg">
                {t("hero.cta")}
              </Button>
            </Link>
            <Link href={withLang("/pricing")}>
              <Button size="lg" className="border-ink-700 bg-transparent text-white hover:bg-ink-800">
                {t("nav.pricing")}
              </Button>
            </Link>
          </div>
        </div>
      </Section>
    </>
  );
}

function HeroPreview({ ar }: { ar: boolean }) {
  const rows = [
    { ref: "CMD-01042", name: ar ? "أمين ب." : "Amine B.", w: "Alger", tone: "amber" as const, s: ar ? "في انتظار التأكيد" : "À confirmer", total: "5 400 DA" },
    { ref: "CMD-01041", name: ar ? "سارة م." : "Sarah M.", w: "Oran", tone: "teal" as const, s: ar ? "مؤكد" : "Confirmée", total: "3 200 DA" },
    { ref: "CMD-01040", name: ar ? "ياسين ك." : "Yacine K.", w: "Sétif", tone: "violet" as const, s: ar ? "في المكتب" : "Au bureau", total: "7 900 DA" },
    { ref: "CMD-01039", name: ar ? "نور ح." : "Nour H.", w: "Blida", tone: "green" as const, s: ar ? "تم التسليم" : "Livrée", total: "4 100 DA" },
  ];
  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between border-b border-ink-100 px-4 py-3">
        <div>
          <p className="text-[13px] font-semibold text-ink-800">{ar ? "الطلبات اليوم" : "Commandes du jour"}</p>
          <p className="text-[11.5px] text-ink-400">{ar ? "تحديث مباشر" : "Mise à jour en direct"}</p>
        </div>
        <Badge tone="green" dot>
          {ar ? "واتساب متصل" : "WhatsApp connecté"}
        </Badge>
      </div>
      <div className="divide-y divide-ink-100">
        {rows.map((r) => (
          <div key={r.ref} className="flex items-center gap-3 px-4 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium text-ink-800">
                {r.ref} · {r.name}
              </p>
              <p className="text-[11.5px] text-ink-400">{r.w}</p>
            </div>
            <span className="text-[12.5px] font-medium text-ink-700 tabular">{r.total}</span>
            <Badge tone={r.tone}>{r.s}</Badge>
            <span className="grid h-7 w-7 place-items-center rounded-lg border border-ink-200 text-ink-500">
              <Phone className="h-3.5 w-3.5" />
            </span>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 border-t border-ink-100 bg-ink-50/60 px-4 py-2.5">
        <Clock className="h-3.5 w-3.5 text-ink-400" />
        <p className="text-[11.5px] text-ink-500">{ar ? "تم منع 3 رسائل مكررة اليوم" : "3 messages en double évités aujourd'hui"}</p>
      </div>
    </div>
  );
}

function QualityPreview({ ar }: { ar: boolean }) {
  const items = [
    { l: ar ? "الرسائل المرسلة" : "Messages envoyés", v: "1 284", tone: "gray" as const },
    { l: ar ? "معدل التسليم" : "Taux de délivrance", v: "97,4 %", tone: "green" as const },
    { l: ar ? "معدل الفشل" : "Taux d'échec", v: "1,2 %", tone: "green" as const },
    { l: ar ? "رسائل لكل طلب" : "Messages / commande", v: "2,1", tone: "teal" as const },
  ];
  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-[14px] font-semibold text-ink-900">{ar ? "جودة واتساب" : "Qualité WhatsApp"}</p>
        <Badge tone="green" dot>
          {ar ? "جيد" : "Bon"}
        </Badge>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        {items.map((i) => (
          <div key={i.l} className="rounded-xl border border-ink-100 bg-ink-50/50 p-3">
            <p className="text-[11.5px] text-ink-500">{i.l}</p>
            <p className="mt-1 text-lg font-semibold text-ink-900 tabular">{i.v}</p>
          </div>
        ))}
      </div>
      <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
        <p className="text-[12.5px] leading-relaxed text-amber-800">
          {ar ? "«هذا القالب يسجل نسبة فشل أعلى من المعتاد.»" : "« Ce template présente un taux d'échec supérieur à la normale. »"}
        </p>
      </div>
    </Card>
  );
}
