"use client";

import * as React from "react";
import useSWR from "swr";
import { ShieldCheck, AlertTriangle, CheckCircle2, ShieldAlert } from "lucide-react";
import { fetcher } from "@/components/dashboard/shell";
import { useDashLocale, useFormat } from "@/components/dashboard/locale";
import { PageHeader, KpiCard } from "@/components/dashboard/common";
import { Card, CardHeader, CardTitle, CardBody, Badge, Skeleton, EmptyState, Select } from "@/components/ui";
import { SUPPRESSION_LABELS_CLIENT } from "../../orders/labels";

type Quality = {
  kpi: Record<string, number>;
  assessment: { badge: "good" | "monitor" | "at_risk"; recommendations: { level: string; text: string }[] };
  templates: { template_id: string; name: string; category: string; sent: number; failed: number; read: number }[];
  suppressions: Record<string, string | null>[];
  meta: { qualityRating: string | null; raw: string | null } | null;
};

export default function QualityPage() {
  const { locale } = useDashLocale();
  const f = useFormat();
  const ar = locale === "ar";
  const [preset, setPreset] = React.useState("30d");
  const { data, isLoading } = useSWR<Quality>(`/api/whatsapp/quality?preset=${preset}`, fetcher);

  const badge = data?.assessment.badge;

  return (
    <div className="space-y-3">
      <PageHeader
        title={ar ? "جودة واتساب" : "Qualité WhatsApp"}
        subtitle={ar ? "مؤشرات داخلية لحماية رقمك" : "Indicateurs internes pour protéger votre numéro"}
        actions={
          <Select className="h-9 w-auto" value={preset} onChange={(e) => setPreset(e.target.value)}>
            <option value="today">{ar ? "اليوم" : "Aujourd'hui"}</option>
            <option value="7d">7 j</option>
            <option value="30d">30 j</option>
            <option value="90d">90 j</option>
          </Select>
        }
      />

      {data && (
        <Card
          className={
            badge === "good" ? "border-emerald-200 bg-emerald-50/60 p-4" : badge === "monitor" ? "border-amber-200 bg-amber-50/60 p-4" : "border-red-200 bg-red-50/60 p-4"
          }
        >
          <div className="flex items-start gap-3">
            {badge === "good" ? <ShieldCheck className="h-5 w-5 shrink-0 text-emerald-600" /> : badge === "monitor" ? <ShieldAlert className="h-5 w-5 shrink-0 text-amber-600" /> : <AlertTriangle className="h-5 w-5 shrink-0 text-red-600" />}
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <p className="text-[14px] font-semibold text-ink-900">{ar ? "التقييم الداخلي" : "Évaluation interne"}</p>
                <Badge tone={badge === "good" ? "green" : badge === "monitor" ? "amber" : "red"} dot>
                  {badge === "good" ? (ar ? "جيد" : "Bon") : badge === "monitor" ? (ar ? "للمراقبة" : "À surveiller") : ar ? "في خطر" : "À risque"}
                </Badge>
              </div>
              <ul className="mt-2.5 space-y-1.5">
                {data.assessment.recommendations.map((r, i) => (
                  <li key={i} className="flex items-start gap-2 text-[13px] text-ink-700">
                    {r.level === "good" ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" /> : <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />}
                    {r.text}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
        {isLoading || !data
          ? Array.from({ length: 10 }).map((_, i) => <Skeleton key={i} className="h-[74px] rounded-[14px]" />)
          : [
              { l: ar ? "الرسائل المرسلة" : "Messages envoyés", v: f.num(data.kpi.messagesSent) },
              { l: ar ? "معدل التسليم" : "Taux de délivrance", v: `${data.kpi.messageDeliveryRate} %`, tone: "green" as const },
              { l: ar ? "معدل القراءة" : "Taux de lecture", v: `${data.kpi.messageReadRate} %` },
              { l: ar ? "معدل الرد" : "Taux de réponse", v: `${data.kpi.replyRate} %` },
              { l: ar ? "معدل الفشل" : "Taux d'échec", v: `${data.kpi.failureRate} %`, tone: data.kpi.failureRate >= 4 ? ("red" as const) : ("green" as const) },
              { l: ar ? "معدل إلغاء الاشتراك" : "Taux d'opt-out", v: `${data.kpi.optOutRate} %`, tone: data.kpi.optOutRate >= 2 ? ("red" as const) : undefined },
              { l: ar ? "رسائل لكل طلب" : "Messages / commande", v: data.kpi.messagesPerOrder, tone: data.kpi.messagesPerOrder > 4 ? ("amber" as const) : undefined },
              { l: ar ? "تكرارات ممنوعة" : "Doublons évités", v: f.num(data.kpi.duplicatesPrevented), tone: "green" as const },
              { l: ar ? "رسائل موقوفة" : "Envois supprimés", v: f.num(data.kpi.suppressed) },
              { l: ar ? "إلغاءات الاشتراك" : "Opt-outs", v: f.num(data.kpi.optOuts) },
            ].map((k) => <KpiCard key={k.l} label={k.l} value={k.v} tone={k.tone} />)}
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{ar ? "أداء القوالب" : "Performance des templates"}</CardTitle>
          </CardHeader>
          {!data?.templates.length ? (
            <EmptyState icon={ShieldCheck} title={ar ? "لا توجد بيانات" : "Aucune donnée"} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[12.5px]">
                <thead>
                  <tr className="border-b border-ink-100 bg-ink-50/60 text-[11px] uppercase text-ink-500">
                    {[ar ? "القالب" : "Template", ar ? "مرسلة" : "Envoyés", ar ? "مقروءة" : "Lus", ar ? "فشل" : "Échecs", ar ? "نسبة الفشل" : "Taux d'échec"].map((h) => (
                      <th key={h} className="px-3 py-2 text-start font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {data.templates.map((t) => {
                    const rate = t.sent + t.failed ? Math.round((t.failed / (t.sent + t.failed)) * 1000) / 10 : 0;
                    return (
                      <tr key={t.template_id}>
                        <td className="px-3 py-2" dir="ltr">{t.name}</td>
                        <td className="px-3 py-2 tabular">{t.sent}</td>
                        <td className="px-3 py-2 tabular">{t.read}</td>
                        <td className="px-3 py-2 tabular">{t.failed}</td>
                        <td className="px-3 py-2"><Badge tone={rate >= 10 ? "red" : rate >= 4 ? "amber" : "green"}>{rate} %</Badge></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{ar ? "الرسائل الممنوعة مؤخرا" : "Envois récemment bloqués"}</CardTitle>
          </CardHeader>
          {!data?.suppressions.length ? (
            <EmptyState icon={ShieldCheck} title={ar ? "لم يتم منع أي رسالة" : "Aucun envoi bloqué"} description={ar ? "قواعد الجودة تعمل في الخلفية." : "Les règles qualité tournent en arrière-plan."} />
          ) : (
            <div className="divide-y divide-ink-100">
              {data.suppressions.map((s) => (
                <div key={String(s.id)} className="flex items-start gap-2.5 px-4 py-2.5">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                  <div className="min-w-0">
                    <p className="text-[12.5px] text-ink-700">{SUPPRESSION_LABELS_CLIENT[String(s.reason)] ?? s.reason}</p>
                    <p className="text-[11px] text-ink-400">{s.trigger} · {f.relative(s.created_at)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{ar ? "مؤشرات ميتا الرسمية" : "Indicateurs officiels Meta"}</CardTitle>
        </CardHeader>
        <CardBody>
          {data?.meta?.qualityRating ? (
            <div className="flex items-center gap-2">
              <Badge tone={data.meta.qualityRating === "GREEN" ? "green" : data.meta.qualityRating === "YELLOW" ? "amber" : "red"} dot>
                {data.meta.qualityRating}
              </Badge>
              <p className="text-[12.5px] text-ink-500">{ar ? "مصدر: واجهة ميتا" : "Source : API Meta"}</p>
            </div>
          ) : (
            <p className="text-[13px] text-ink-500">
              {ar
                ? "لا تتوفر مؤشرات ميتا حاليا. تظهر هنا فقط عندما توفرها الواجهة الرسمية — لا نخترع أي قيمة."
                : "Aucun indicateur Meta disponible actuellement. Ils s'affichent uniquement lorsque l'API officielle les expose — aucune valeur n'est inventée."}
            </p>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
