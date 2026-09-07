"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { Building2, Table2, MessageCircle, Truck, FileText, Zap, FlaskConical, Rocket, Check, ArrowRight, ArrowLeft, SkipForward } from "lucide-react";
import { fetcher } from "@/components/dashboard/shell";
import { useDashLocale } from "@/components/dashboard/locale";
import { Card, Button, Input, Field, Select, Badge, Skeleton, useToast, cn } from "@/components/ui";
import { WILAYAS } from "@/lib/domain";

type Progress = { business: boolean; source: boolean; whatsapp: boolean; delivery: boolean; templates: boolean; testOrder: boolean; completed: boolean };
type Payload = { merchant: Record<string, string | number | null>; progress: Progress };

const STEPS = [
  { id: 1, icon: Building2, fr: "Entreprise", ar: "المؤسسة", optional: false },
  { id: 2, icon: Table2, fr: "Source des commandes", ar: "مصدر الطلبات", optional: true },
  { id: 3, icon: MessageCircle, fr: "WhatsApp", ar: "واتساب", optional: true },
  { id: 4, icon: Truck, fr: "Transporteur", ar: "شركة التوصيل", optional: true },
  { id: 5, icon: FileText, fr: "Templates", ar: "القوالب", optional: true },
  { id: 6, icon: Zap, fr: "Automatisations", ar: "الأتمتة", optional: true },
  { id: 7, icon: FlaskConical, fr: "Commande de test", ar: "طلب تجريبي", optional: true },
  { id: 8, icon: Rocket, fr: "Activation", ar: "التفعيل", optional: false },
];

export default function OnboardingPage() {
  const { locale, setLocale } = useDashLocale();
  const ar = locale === "ar";
  const router = useRouter();
  const { push } = useToast();
  const { data, mutate } = useSWR<Payload>("/api/onboarding", fetcher);
  const [step, setStep] = React.useState(1);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (data?.merchant?.onboarding_step) setStep(Math.min(8, Number(data.merchant.onboarding_step)));
  }, [data?.merchant?.onboarding_step]);

  async function goto(next: number) {
    setStep(next);
    await fetch("/api/onboarding", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "step", step: next }) });
    mutate();
  }

  async function createTestOrder() {
    setBusy(true);
    const res = await fetch("/api/onboarding", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "test_order" }) });
    setBusy(false);
    if (res.ok) { push({ variant: "success", title: ar ? "تم إنشاء طلب تجريبي" : "Commande de test créée" }); mutate(); }
  }

  async function complete() {
    setBusy(true);
    await fetch("/api/onboarding", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "complete" }) });
    router.push("/dashboard");
  }

  if (!data) return <div className="mx-auto max-w-3xl p-6"><Skeleton className="h-96 rounded-[14px]" /></div>;

  const cur = STEPS.find((s) => s.id === step)!;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-wide text-brand-600">CODWSAP</p>
          <h1 className="mt-0.5 text-[22px] font-semibold text-ink-900">{ar ? "لنجهّز حسابك" : "Configurons votre compte"}</h1>
          <p className="mt-1 text-[13px] text-ink-500">
            {ar ? "كل الخطوات ما عدا الأولى اختيارية — يمكنك تخطيها والعودة لاحقا." : "Toutes les étapes sauf la première sont optionnelles — vous pouvez les passer et y revenir plus tard."}
          </p>
        </div>
        <Button size="sm" onClick={() => setLocale(ar ? "fr" : "ar")}>{ar ? "Français" : "العربية"}</Button>
      </div>

      <div className="mb-4 flex gap-1.5 overflow-x-auto pb-1">
        {STEPS.map((s) => {
          const done =
            (s.id === 1 && data.progress.business) ||
            (s.id === 2 && data.progress.source) ||
            (s.id === 3 && data.progress.whatsapp) ||
            (s.id === 4 && data.progress.delivery) ||
            (s.id === 5 && data.progress.templates) ||
            (s.id === 7 && data.progress.testOrder);
          return (
            <button
              key={s.id}
              onClick={async () => await goto(s.id)}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12px]",
                step === s.id ? "border-brand-300 bg-brand-50 font-medium text-brand-700" : done ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-ink-200 bg-white text-ink-500",
              )}
            >
              {done ? <Check className="h-3 w-3" /> : <s.icon className="h-3 w-3" />}
              {ar ? s.ar : s.fr}
            </button>
          );
        })}
      </div>

      <Card className="p-5">
        <div className="mb-4 flex items-center gap-2">
          <cur.icon className="h-[18px] w-[18px] text-brand-600" />
          <h2 className="text-[16px] font-semibold text-ink-900">{ar ? cur.ar : cur.fr}</h2>
          {cur.optional && <Badge tone="gray">{ar ? "اختياري" : "Optionnel"}</Badge>}
        </div>

        {step === 1 && (
          <form
            className="space-y-3.5"
            onSubmit={async (e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              setBusy(true);
              const res = await fetch("/api/onboarding", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "business", name: fd.get("name"), phone: fd.get("phone"), wilaya: fd.get("wilaya"), address: fd.get("address") }),
              });
              setBusy(false);
              if (!res.ok) return push({ variant: "error", title: "Erreur" });
              mutate();
              await goto(2);
            }}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={ar ? "اسم المتجر" : "Nom de la boutique"}><Input name="name" required defaultValue={String(data.merchant.name ?? "")} /></Field>
              <Field label={ar ? "هاتف المتجر" : "Téléphone de la boutique"}><Input name="phone" required dir="ltr" defaultValue={String(data.merchant.phone ?? "")} /></Field>
              <Field label={ar ? "الولاية" : "Wilaya"}>
                <Select name="wilaya" required defaultValue={String(data.merchant.wilaya ?? "")}>
                  <option value="">—</option>
                  {WILAYAS.map((w, i) => <option key={w} value={w}>{String(i + 1).padStart(2, "0")} — {w}</option>)}
                </Select>
              </Field>
              <Field label={ar ? "العنوان" : "Adresse"}><Input name="address" defaultValue={String(data.merchant.address ?? "")} /></Field>
            </div>
            <Button type="submit" variant="primary" loading={busy}>{ar ? "متابعة" : "Continuer"} <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" /></Button>
          </form>
        )}

        {step === 2 && (
          <StepLinks
            ar={ar}
            text={ar
              ? "من أين تأتي طلباتك؟ يمكنك الربط بجدول Google، أو استخدام الويب هوك/الواجهة، أو استيراد ملف CSV، أو إضافة الطلبات يدويا."
              : "D'où viennent vos commandes ? Connectez une feuille Google, utilisez le webhook / l'API, importez un CSV, ou saisissez-les manuellement."}
            links={[{ href: "/dashboard/integrations", label: ar ? "فتح صفحة التكاملات" : "Ouvrir les intégrations" }]}
            done={data.progress.source}
          />
        )}

        {step === 3 && (
          <StepLinks
            ar={ar}
            text={ar
              ? "اربط حساب WhatsApp Business Cloud API الرسمي الخاص بك. بدون ربط، تعمل الأتمتة في وضع الاختبار فقط."
              : "Connectez votre compte officiel WhatsApp Business Cloud API. Sans connexion, les automatisations restent en mode test."}
            links={[{ href: "/dashboard/whatsapp/settings", label: ar ? "إعداد واتساب" : "Configurer WhatsApp" }]}
            done={data.progress.whatsapp}
          />
        )}

        {step === 4 && (
          <StepLinks
            ar={ar}
            text={ar
              ? "أضف شركة التوصيل التي تعمل معها. إذا لم تكن مدرجة، أرسل لنا طلبا من نفس الصفحة."
              : "Ajoutez le transporteur avec lequel vous travaillez. S'il n'est pas listé, envoyez-nous une demande depuis la même page."}
            links={[{ href: "/dashboard/delivery", label: ar ? "إضافة ناقل" : "Ajouter un transporteur" }]}
            done={data.progress.delivery}
          />
        )}

        {step === 5 && (
          <StepLinks
            ar={ar}
            text={ar
              ? "جهّزنا لك قوالب رسائل بالفرنسية والعربية. عدّلها ثم أرسلها للاعتماد لدى ميتا."
              : "Des templates FR/AR sont préparés pour vous. Adaptez-les puis faites-les approuver par Meta avant tout envoi automatique."}
            links={[{ href: "/dashboard/whatsapp/templates", label: ar ? "فتح القوالب" : "Ouvrir les templates" }]}
            done={data.progress.templates}
          />
        )}

        {step === 6 && (
          <StepLinks
            ar={ar}
            text={ar
              ? "فعّل الأتمتة التي تحتاجها فقط: تأكيد الطلب، إشعار الشحن، وصول الطرد للمكتب، شكر بعد التسليم… مع قواعد جودة تمنع الإزعاج."
              : "Activez uniquement les automatisations utiles : confirmation, expédition, colis au bureau, remerciement après livraison… encadrées par les règles qualité."}
            links={[{ href: "/dashboard/automations", label: ar ? "إعداد الأتمتة" : "Configurer les automatisations" }]}
            done
          />
        )}

        {step === 7 && (
          <div className="space-y-3">
            <p className="text-[13px] leading-relaxed text-ink-600">
              {ar
                ? "أنشئ طلبا تجريبيا للتأكد من أن كل شيء يعمل. تُوسم بيانات الاختبار بوضوح ولا تدخل في الإحصائيات."
                : "Créez une commande de test pour vérifier que tout fonctionne. Les données de test sont clairement marquées et exclues des statistiques."}
            </p>
            <div className="flex gap-2">
              <Button variant="primary" loading={busy} onClick={createTestOrder}><FlaskConical className="h-3.5 w-3.5" /> {ar ? "إنشاء طلب تجريبي" : "Créer une commande de test"}</Button>
              {data.progress.testOrder && <Badge tone="green" dot>{ar ? "تم" : "Fait"}</Badge>}
            </div>
          </div>
        )}

        {step === 8 && (
          <div className="space-y-3">
            <p className="text-[13px] leading-relaxed text-ink-600">
              {ar ? "أنت جاهز. يمكنك دائما إكمال الخطوات المتبقية من الإعدادات." : "Vous êtes prêt. Les étapes restantes peuvent être complétées à tout moment depuis les paramètres."}
            </p>
            <ul className="space-y-1.5">
              {STEPS.slice(0, 7).map((s) => {
                const done =
                  (s.id === 1 && data.progress.business) || (s.id === 2 && data.progress.source) || (s.id === 3 && data.progress.whatsapp) ||
                  (s.id === 4 && data.progress.delivery) || (s.id === 5 && data.progress.templates) || s.id === 6 || (s.id === 7 && data.progress.testOrder);
                return (
                  <li key={s.id} className="flex items-center gap-2 text-[13px]">
                    <span className={cn("grid h-4 w-4 place-items-center rounded-full", done ? "bg-emerald-500 text-white" : "bg-ink-200")}>{done && <Check className="h-2.5 w-2.5" />}</span>
                    <span className={done ? "text-ink-700" : "text-ink-400"}>{ar ? s.ar : s.fr}</span>
                  </li>
                );
              })}
            </ul>
            <Button variant="primary" loading={busy} onClick={complete}><Rocket className="h-3.5 w-3.5" /> {ar ? "تفعيل حسابي" : "Activer mon compte"}</Button>
          </div>
        )}

        <div className="mt-5 flex items-center justify-between border-t border-ink-100 pt-4">
          <Button size="sm" disabled={step === 1} onClick={async () => await goto(step - 1)}><ArrowLeft className="h-3.5 w-3.5 rtl:rotate-180" /> {ar ? "السابق" : "Précédent"}</Button>
          {step < 8 && (
            <Button size="sm" onClick={async () => await goto(step + 1)}>
              {cur.optional ? <><SkipForward className="h-3.5 w-3.5" /> {ar ? "تخطي" : "Passer"}</> : <>{ar ? "التالي" : "Suivant"} <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" /></>}
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}

function StepLinks({ ar, text, links, done }: { ar: boolean; text: string; links: { href: string; label: string }[]; done?: boolean }) {
  return (
    <div className="space-y-3">
      <p className="text-[13px] leading-relaxed text-ink-600">{text}</p>
      <div className="flex flex-wrap items-center gap-2">
        {links.map((l) => (
          <a key={l.href} href={l.href} target="_blank" rel="noreferrer">
            <Button variant="primary" size="sm">{l.label} <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" /></Button>
          </a>
        ))}
        {done && <Badge tone="green" dot>{ar ? "تم" : "Configuré"}</Badge>}
      </div>
    </div>
  );
}
