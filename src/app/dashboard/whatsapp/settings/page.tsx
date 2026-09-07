"use client";

import * as React from "react";
import useSWR from "swr";
import { Plug, Copy, AlertTriangle } from "lucide-react";
import { fetcher } from "@/components/dashboard/shell";
import { useDashLocale, useFormat } from "@/components/dashboard/locale";
import { PageHeader } from "@/components/dashboard/common";
import { Card, CardHeader, CardTitle, CardBody, Button, Input, Field, Badge, useToast, Skeleton } from "@/components/ui";

export default function WhatsappSettings() {
  const { locale } = useDashLocale();
  const f = useFormat();
  const ar = locale === "ar";
  const { push } = useToast();
  const { data, isLoading, mutate } = useSWR<{ connection: Record<string, string | null> | null; recentErrors: Record<string, string>[] }>("/api/whatsapp/connection", fetcher);
  const [saving, setSaving] = React.useState(false);
  const [testing, setTesting] = React.useState(false);
  const c = data?.connection;
  const webhookUrl = typeof window !== "undefined" && c ? `${window.location.origin}${c.webhook_url}` : "";

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setSaving(true);
    try {
      const res = await fetch("/api/whatsapp/connection", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayPhone: fd.get("displayPhone"),
          phoneNumberId: fd.get("phoneNumberId"),
          businessAccountId: fd.get("businessAccountId"),
          accessToken: (fd.get("accessToken") as string) || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erreur");
      push({ variant: "success", title: ar ? "تم الحفظ" : "Identifiants enregistrés" });
      mutate();
    } catch (err) {
      push({ variant: "error", title: (err as Error).message });
    } finally {
      setSaving(false);
    }
  }

  async function test() {
    setTesting(true);
    const res = await fetch("/api/whatsapp/connection", { method: "POST" });
    const json = await res.json();
    push({ variant: json.ok ? "success" : "error", title: json.message, description: json.technical });
    setTesting(false);
    mutate();
  }

  if (isLoading) return <Skeleton className="h-96 rounded-[14px]" />;

  return (
    <div className="space-y-3">
      <PageHeader
        title={ar ? "إعدادات واتساب" : "Paramètres WhatsApp"}
        subtitle={ar ? "اربط حسابك الرسمي في WhatsApp Business Cloud API." : "Connectez votre compte officiel WhatsApp Business Cloud API."}
        actions={
          c && (
            <Badge tone={c.status === "connected" ? "green" : c.status === "error" ? "red" : "gray"} dot>
              {c.status === "connected" ? (ar ? "متصل" : "Connecté") : c.status === "error" ? (ar ? "خطأ" : "Erreur") : ar ? "غير متصل" : "Déconnecté"}
            </Badge>
          )
        }
      />

      <div className="grid gap-3 lg:grid-cols-[1.2fr_1fr]">
        <Card>
          <CardHeader><CardTitle>{ar ? "بيانات الاتصال" : "Identifiants"}</CardTitle></CardHeader>
          <CardBody>
            <form onSubmit={save} className="space-y-3.5">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={ar ? "رقم العرض" : "Numéro affiché"}>
                  <Input name="displayPhone" required dir="ltr" defaultValue={c?.display_phone ?? ""} placeholder="+213 5xx xx xx xx" />
                </Field>
                <Field label="Phone Number ID">
                  <Input name="phoneNumberId" required dir="ltr" defaultValue={c?.phone_number_id ?? ""} />
                </Field>
              </div>
              <Field label="WhatsApp Business Account ID">
                <Input name="businessAccountId" required dir="ltr" defaultValue={c?.business_account_id ?? ""} />
              </Field>
              <Field
                label={ar ? "رمز الوصول" : "Jeton d'accès permanent"}
                hint={c?.access_token_masked ? `${ar ? "مسجل حاليا" : "Actuellement enregistré"} : ${c.access_token_masked}` : ar ? "يخزن مشفرا على الخادم." : "Stocké chiffré côté serveur, jamais renvoyé au navigateur."}
              >
                <Input name="accessToken" type="password" dir="ltr" placeholder="EAAG…" />
              </Field>
              <div className="flex gap-2">
                <Button type="submit" variant="primary" loading={saving}>{ar ? "حفظ" : "Enregistrer"}</Button>
                <Button type="button" onClick={test} loading={testing} disabled={!c}>
                  <Plug className="h-3.5 w-3.5" /> {ar ? "اختبار الاتصال" : "Tester la connexion"}
                </Button>
              </div>
            </form>
          </CardBody>
        </Card>

        <div className="space-y-3">
          <Card>
            <CardHeader><CardTitle>{ar ? "إعداد الويب هوك" : "Configuration webhook"}</CardTitle></CardHeader>
            <CardBody className="space-y-2.5 text-[13px]">
              {c ? (
                <>
                  <div>
                    <p className="text-[11.5px] text-ink-400">Callback URL</p>
                    <div className="mt-1 flex items-center gap-2">
                      <code className="flex-1 truncate rounded-lg bg-ink-100 px-2 py-1.5 text-[11.5px]" dir="ltr">{webhookUrl}</code>
                      <button onClick={() => { navigator.clipboard.writeText(webhookUrl); push({ variant: "success", title: ar ? "تم النسخ" : "Copié" }); }} className="text-ink-400 hover:text-ink-700">
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  <div>
                    <p className="text-[11.5px] text-ink-400">Verify token</p>
                    <div className="mt-1 flex items-center gap-2">
                      <code className="flex-1 truncate rounded-lg bg-ink-100 px-2 py-1.5 text-[11.5px]" dir="ltr">{c.webhook_verify_token}</code>
                      <button onClick={() => { navigator.clipboard.writeText(String(c.webhook_verify_token)); push({ variant: "success", title: ar ? "تم النسخ" : "Copié" }); }} className="text-ink-400 hover:text-ink-700">
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="flex justify-between border-t border-ink-100 pt-2">
                    <span className="text-ink-500">{ar ? "آخر ويب هوك" : "Dernier webhook"}</span>
                    <span className="font-medium">{f.dateTime(c.last_webhook_at)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-ink-500">{ar ? "آخر رسالة ناجحة" : "Dernier envoi réussi"}</span>
                    <span className="font-medium">{f.dateTime(c.last_message_at)}</span>
                  </div>
                </>
              ) : (
                <p className="text-ink-500">{ar ? "احفظ بياناتك أولا للحصول على رابط الويب هوك." : "Enregistrez vos identifiants pour obtenir l'URL de webhook."}</p>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader><CardTitle>{ar ? "الأخطاء الأخيرة" : "Erreurs récentes"}</CardTitle></CardHeader>
            <CardBody>
              {!data?.recentErrors.length ? (
                <p className="text-[13px] text-ink-500">{ar ? "لا توجد أخطاء." : "Aucune erreur récente."}</p>
              ) : (
                <div className="space-y-2">
                  {data.recentErrors.map((e, i) => (
                    <div key={i} className="flex items-start gap-2 rounded-lg border border-red-100 bg-red-50/60 p-2.5">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-500" />
                      <div className="min-w-0">
                        <p className="text-[12.5px] text-red-800">{e.error}</p>
                        <p className="text-[11px] text-red-500">{e.operation} · {f.dateTime(e.created_at)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
