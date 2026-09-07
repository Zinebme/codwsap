"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale } from "@/components/marketing/site";
import { Card, Button, Input, Field, useToast } from "@/components/ui";
import { makeT } from "@/lib/i18n";

export default function LoginPage() {
  const locale = useLocale();
  const t = makeT(locale);
  const router = useRouter();
  const { push } = useToast();
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const withLang = (h: string) => (locale === "ar" ? `${h}?lang=ar` : h);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: fd.get("email"), password: fd.get("password") }),
      });
      const json = await res.json();
      if (!res.ok || json.error) {
        setError(json.error ?? (locale === "ar" ? "تعذر تسجيل الدخول." : "Connexion impossible."));
        return;
      }
      push({ variant: "success", title: locale === "ar" ? "مرحبا بعودتك" : "Bon retour parmi nous" });
      router.push(json.redirect ?? "/dashboard");
      router.refresh();
    } catch {
      setError(locale === "ar" ? "تعذر الاتصال بالخادم." : "Serveur injoignable.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md items-center px-4 py-12">
      <Card className="w-full p-6">
        <h1 className="text-xl font-semibold text-ink-900">{t("auth.login.title")}</h1>
        <p className="mt-1 text-[13px] text-ink-500">
          {locale === "ar" ? "أدخل بياناتك للوصول إلى لوحة التحكم." : "Entrez vos identifiants pour accéder à votre tableau de bord."}
        </p>
        <form onSubmit={submit} className="mt-5 space-y-3.5">
          <Field label={t("auth.email")}>
            <Input name="email" type="email" required autoComplete="email" dir="ltr" />
          </Field>
          <Field label={t("auth.password")}>
            <Input name="password" type="password" required autoComplete="current-password" dir="ltr" />
          </Field>
          {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12.5px] text-red-700">{error}</div>}
          <Button type="submit" variant="primary" className="w-full justify-center" loading={loading}>
            {t("auth.submit.login")}
          </Button>
        </form>
        <p className="mt-4 text-center text-[13px] text-ink-500">
          {t("auth.nomember")}{" "}
          <Link href={withLang("/signup")} className="font-medium text-brand-600 hover:underline">
            {t("nav.signup")}
          </Link>
        </p>
      </Card>
    </div>
  );
}
