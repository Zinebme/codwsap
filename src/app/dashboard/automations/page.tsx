"use client";

import * as React from "react";
import useSWR from "swr";
import Link from "next/link";
import { Zap, AlertTriangle, CheckCircle2, ShieldCheck, Clock } from "lucide-react";
import { fetcher } from "@/components/dashboard/shell";
import { useDashLocale, useFormat } from "@/components/dashboard/locale";
import { PageHeader } from "@/components/dashboard/common";
import { Card, CardHeader, CardTitle, Badge, Button, Select, Toggle, Skeleton, EmptyState, useToast } from "@/components/ui";
import { AUTOMATION_META, type AutomationType } from "@/lib/domain";
import { SUPPRESSION_LABELS_CLIENT } from "../orders/labels";

type Automation = {
  id: string;
  type: AutomationType;
  name: string;
  enabled: number;
  template_id: string | null;
  template_name: string | null;
  template_status: string | null;
  cooldown_minutes: number;
  delay_minutes: number;
  last_run_at: string | null;
  last_status: string | null;
  run_count: number;
  failure_count: number;
  suppressed_count: number;
};
type Tpl = { id: string; name: string; status: string; event_key: string | null };
type Run = { id: string; automation_type: string | null; trigger: string; result: string; reason: string | null; created_at: string };

export default function AutomationsPage() {
  const { locale } = useDashLocale();
  const f = useFormat();
  const ar = locale === "ar";
  const { push } = useToast();
  const { data, isLoading, mutate } = useSWR<{ rows: Automation[]; templates: Tpl[]; runs: Run[] }>("/api/automations", fetcher, { refreshInterval: 60_000 });

  async function patch(id: string, body: Record<string, unknown>) {
    const res = await fetch(`/api/automations/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = await res.json();
    if (!res.ok) return push({ variant: "error", title: json.error ?? "Erreur" });
    push({ variant: "success", title: ar ? "تم التحديث" : "Automatisation mise à jour" });
    mutate();
  }

  return (
    <div className="space-y-3">
      <PageHeader
        title={ar ? "الأتمتة" : "Automatisations"}
        subtitle={ar ? "رسائل تلقائية محكومة بقواعد جودة تمنع الإزعاج والتكرار." : "Messages automatiques encadrés par des règles qualité qui évitent le spam et les doublons."}
      />

      <Card className="flex items-start gap-3 border-brand-100 bg-brand-50/50 p-3.5">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
        <p className="text-[12.5px] leading-relaxed text-ink-700">
          {ar
            ? "لا يتم إرسال رسالة عند كل تغيير حالة. تتحقق المنصة من الموافقة، فترة التهدئة، التكرار، عدد الرسائل لكل طلب، واعتماد القالب قبل كل إرسال."
            : "Un changement de statut ne déclenche pas systématiquement un envoi : consentement, cooldown, doublon, nombre max de messages par commande et approbation du template sont vérifiés avant chaque message."}
        </p>
      </Card>

      {isLoading || !data ? (
        <div className="grid gap-3 lg:grid-cols-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-40 rounded-[14px]" />)}</div>
      ) : !data.rows.length ? (
        <Card><EmptyState icon={Zap} title={ar ? "لا توجد أتمتة" : "Aucune automatisation"} /></Card>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {data.rows.map((a) => {
            const meta = AUTOMATION_META[a.type];
            const templateOk = a.template_status === "approved";
            return (
              <Card key={a.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-[13.5px] font-semibold text-ink-900">{ar ? meta?.ar ?? a.name : meta?.fr ?? a.name}</p>
                      <Badge tone={a.enabled ? "green" : "gray"} dot>{a.enabled ? (ar ? "مفعّلة" : "Active") : ar ? "متوقفة" : "Inactive"}</Badge>
                    </div>
                    <p className="mt-1 text-[12px] leading-relaxed text-ink-500">{ar ? meta?.desc_ar : meta?.desc_fr}</p>
                  </div>
                  <Toggle checked={!!a.enabled} onChange={(v) => patch(a.id, { enabled: v })} />
                </div>

                <div className="mt-3 grid gap-2.5 sm:grid-cols-3">
                  <label className="block">
                    <span className="text-[11px] font-medium uppercase text-ink-400">{ar ? "القالب" : "Template"}</span>
                    <Select className="mt-1 h-8 py-0 text-[12.5px]" value={a.template_id ?? ""} onChange={(e) => patch(a.id, { templateId: e.target.value || null })}>
                      <option value="">{ar ? "بدون" : "Aucun"}</option>
                      {data.templates.map((t) => (
                        <option key={t.id} value={t.id}>{t.name} {t.status !== "approved" ? `(${t.status})` : ""}</option>
                      ))}
                    </Select>
                  </label>
                  <label className="block">
                    <span className="text-[11px] font-medium uppercase text-ink-400">{ar ? "تأخير (دقيقة)" : "Délai (min)"}</span>
                    <Select className="mt-1 h-8 py-0 text-[12.5px]" value={String(a.delay_minutes)} onChange={(e) => patch(a.id, { delayMinutes: Number(e.target.value) })}>
                      {[0, 5, 15, 30, 60, 180, 360, 720, 1440].map((v) => <option key={v} value={v}>{v}</option>)}
                    </Select>
                  </label>
                  <label className="block">
                    <span className="text-[11px] font-medium uppercase text-ink-400">{ar ? "تهدئة (دقيقة)" : "Cooldown (min)"}</span>
                    <Select className="mt-1 h-8 py-0 text-[12.5px]" value={String(a.cooldown_minutes)} onChange={(e) => patch(a.id, { cooldownMinutes: Number(e.target.value) })}>
                      {[0, 30, 60, 180, 360, 720, 1440].map((v) => <option key={v} value={v}>{v}</option>)}
                    </Select>
                  </label>
                </div>

                {a.enabled && !templateOk && (
                  <div className="mt-2.5 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-[12px] text-amber-900">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    {a.template_id
                      ? ar ? "القالب غير معتمد من ميتا — سيتم إيقاف الإرسال." : "Template non approuvé par Meta — les envois seront bloqués."
                      : ar ? "اختر قالبا معتمدا لتفعيل الإرسال." : "Choisissez un template approuvé pour activer les envois."}
                    <Link href="/dashboard/whatsapp/templates" className="ms-auto shrink-0 font-medium underline">{ar ? "القوالب" : "Templates"}</Link>
                  </div>
                )}

                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-ink-100 pt-2.5 text-[11.5px] text-ink-500">
                  <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" /> {ar ? "آخر تشغيل" : "Dernière exécution"} : {f.dateTime(a.last_run_at)}</span>
                  <span>{ar ? "عمليات" : "Exécutions"} : <b className="text-ink-800">{f.num(a.run_count)}</b></span>
                  <span>{ar ? "موقوفة" : "Bloquées"} : <b className="text-ink-800">{f.num(a.suppressed_count)}</b></span>
                  <span className={a.failure_count ? "text-red-600" : ""}>{ar ? "أخطاء" : "Échecs"} : <b>{f.num(a.failure_count)}</b></span>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{ar ? "آخر عمليات التشغيل" : "Dernières exécutions"}</CardTitle>
          <Button size="sm" onClick={() => mutate()}>{ar ? "تحديث" : "Actualiser"}</Button>
        </CardHeader>
        {!data?.runs.length ? (
          <EmptyState icon={Zap} title={ar ? "لا يوجد سجل بعد" : "Aucun historique"} />
        ) : (
          <div className="divide-y divide-ink-100">
            {data.runs.map((r) => (
              <div key={r.id} className="flex items-start gap-2.5 px-4 py-2.5">
                {r.result === "sent" ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                ) : r.result === "failed" ? (
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                ) : (
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-ink-400" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-[12.5px] text-ink-800">
                    {r.automation_type ? (ar ? AUTOMATION_META[r.automation_type as AutomationType]?.ar : AUTOMATION_META[r.automation_type as AutomationType]?.fr) ?? r.automation_type : r.trigger}
                  </p>
                  {r.reason && <p className="text-[11.5px] text-ink-500">{SUPPRESSION_LABELS_CLIENT[r.reason] ?? r.reason}</p>}
                </div>
                <Badge tone={r.result === "sent" ? "green" : r.result === "failed" ? "red" : "gray"}>
                  {r.result === "sent" ? (ar ? "أُرسلت" : "Envoyé") : r.result === "failed" ? (ar ? "فشل" : "Échec") : r.result === "suppressed" ? (ar ? "موقوفة" : "Bloqué") : r.result}
                </Badge>
                <span className="shrink-0 text-[11px] text-ink-400">{f.relative(r.created_at)}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
