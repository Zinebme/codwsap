"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale } from "@/components/marketing/site";
import { Card, Button, Input, Field, useToast } from "@/components/ui";
import { makeT } from "@/lib/i18n";
import { CheckItem as MarketingCheck } from "@/components/marketing/site";

export default function SignupPage() {
  const locale = useLocale();
  const t = makeT(locale);
  const ar = locale === "ar";
  const router = useRouter();
  const { push } = useToast();
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const withLang = (h: string) => (ar ? `${h}?lang=ar` : h);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: fd.get("fullName"),
          business: fd.get("business"),
          email: fd.get("email"),
          phone: fd.get("phone"),
          password: fd.get("password"),
        }),
      });
      const json = await res.json();
      if (!res.ok || json.error) {
        setError(json.error ?? (ar ? "تعذر إنشاء الحساب." : "Création impossible."));
        return;
      }
      push({ variant: "success", title: ar ? "تم إنشاء الحساب" : "Compte créé" });
      router.push("/onboarding");
      router.refresh();
    } catch {
      setError(ar ? "تعذر الاتصال بالخادم." : "Serveur injoignable.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto grid max-w-5xl gap-6 px-4 py-12 lg:grid-cols-[1fr_420px]">
      <div className="hidden lg:block">
        <h1 className="text-2xl font-semibold tracking-tight text-ink-900">{t("hero.title")}</h1>
        <p className="mt-3 text-[14.5px] leading-relaxed text-ink-600">{t("hero.subtitle")}</p>
        <ul className="mt-6 space-y-2.5">
          {(ar
            ? ["14 يوما تجربة مجانية", "بدون بطاقة بنكية", "إعداد موجه خطوة بخطوة", "واجهة بالفرنسية والعربية"]
            : ["14 jours d'essai gratuit", "Sans carte bancaire", "Onboarding guidé étape par étape", "Interface française et arabe"]
          ).map((x) => (
            <MarketingCheck key={x}>{x}</MarketingCheck>
          ))}
        </ul>
      </div>
      <Card className="p-6">
        <h2 className="text-xl font-semibold text-ink-900">{t("auth.signup.title")}</h2>
        <form onSubmit={submit} className="mt-5 space-y-3.5">
          <Field label={t("auth.fullname")}>
            <Input name="fullName" required minLength={2} maxLength={80} />
          </Field>
          <Field label={t("auth.business")}>
            <Input name="business" required minLength={2} maxLength={80} />
          </Field>
          <Field label={t("auth.email")}>
            <Input name="email" type="email" required dir="ltr" />
          </Field>
          <Field label={t("auth.phone")}>
            <Input name="phone" required inputMode="tel" dir="ltr" placeholder="0550 12 34 56" />
          </Field>
          <Field label={t("auth.password")} hint={ar ? "8 أحرف على الأقل" : "8 caractères minimum"}>
            <Input name="password" type="password" required minLength={8} dir="ltr" autoComplete="new-password" />
          </Field>
          {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12.5px] text-red-700">{error}</div>}
          <Button type="submit" variant="primary" className="w-full justify-center" loading={loading}>
            {t("auth.submit.signup")}
          </Button>
        </form>
        <p className="mt-4 text-center text-[13px] text-ink-500">
          {t("auth.member")}{" "}
          <Link href={withLang("/login")} className="font-medium text-brand-600 hover:underline">
            {t("nav.login")}
          </Link>
        </p>
      </Card>
    </div>
  );
}
