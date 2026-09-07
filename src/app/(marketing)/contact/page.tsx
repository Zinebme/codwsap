"use client";

import * as React from "react";
import { Mail, MessageSquare, MapPin } from "lucide-react";
import { Section, SectionHead, useLocale } from "@/components/marketing/site";
import { Card, Button, Input, Textarea, Field, useToast } from "@/components/ui";
import { makeT } from "@/lib/i18n";

export default function ContactPage() {
  const locale = useLocale();
  const t = makeT(locale);
  const ar = locale === "ar";
  const { push } = useToast();
  const [loading, setLoading] = React.useState(false);
  const [done, setDone] = React.useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setLoading(true);
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: fd.get("name"),
          email: fd.get("email"),
          phone: fd.get("phone") || undefined,
          message: fd.get("message"),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "error");
      setDone(true);
      push({ variant: "success", title: t("contact.sent") });
    } catch (err) {
      push({ variant: "error", title: ar ? "تعذر الإرسال" : "Envoi impossible", description: (err as Error).message });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Section className="max-w-4xl">
      <SectionHead title={t("contact.title")} subtitle={t("contact.subtitle")} />
      <div className="grid gap-3 md:grid-cols-[1fr_320px]">
        <Card className="p-5">
          {done ? (
            <div className="py-10 text-center">
              <p className="text-[15px] font-semibold text-ink-900">{t("contact.sent")}</p>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-3.5">
              <div className="grid gap-3.5 sm:grid-cols-2">
                <Field label={t("contact.name")}>
                  <Input name="name" required minLength={2} maxLength={80} />
                </Field>
                <Field label={t("contact.email")}>
                  <Input name="email" type="email" required maxLength={160} />
                </Field>
              </div>
              <Field label={t("contact.phone")}>
                <Input name="phone" inputMode="tel" maxLength={30} placeholder="0550 12 34 56" />
              </Field>
              <Field label={t("contact.message")}>
                <Textarea name="message" required minLength={5} maxLength={2000} rows={5} />
              </Field>
              <Button type="submit" variant="primary" loading={loading}>
                {t("contact.send")}
              </Button>
            </form>
          )}
        </Card>
        <div className="space-y-3">
          {[
            { icon: Mail, l: "Email", v: "support@codwsap.app" },
            { icon: MessageSquare, l: "WhatsApp", v: "+213 550 00 00 00" },
            { icon: MapPin, l: ar ? "الموقع" : "Localisation", v: ar ? "الجزائر العاصمة، الجزائر" : "Alger, Algérie" },
          ].map((c) => (
            <Card key={c.l} className="flex items-center gap-3 p-4">
              <div className="grid h-9 w-9 place-items-center rounded-lg bg-brand-50">
                <c.icon className="h-[18px] w-[18px] text-brand-600" />
              </div>
              <div>
                <p className="text-[12px] text-ink-500">{c.l}</p>
                <p className="text-[13.5px] font-medium text-ink-800">{c.v}</p>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </Section>
  );
}
