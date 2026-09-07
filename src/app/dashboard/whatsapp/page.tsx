"use client";

import Link from "next/link";
import useSWR from "swr";
import { AlertTriangle, CheckCircle2, Send, Inbox, ShieldCheck } from "lucide-react";
import { fetcher } from "@/components/dashboard/shell";
import { useDashLocale, useFormat } from "@/components/dashboard/locale";
import { PageHeader, KpiCard } from "@/components/dashboard/common";
import { Card, CardHeader, CardTitle, CardBody, Badge, Button, Skeleton } from "@/components/ui";

export default function WhatsappOverview() {
  const { locale } = useDashLocale();
  const f = useFormat();
  const ar = locale === "ar";
  const { data, isLoading } = useSWR<{ kpi: Record<string, number>; assessment: { badge: string; recommendations: { level: string; text: string }[] }; meta: { qualityRating: string | null } | null }>(
    "/api/whatsapp/quality?preset=30d",
    fetcher,
  );
  const { data: conn } = useSWR<{ connection: Record<string, string | null> | null }>("/api/whatsapp/connection", fetcher);

  return (
    <div className="space-y-3">
      <PageHeader
        title="WhatsApp"
        subtitle={ar ? "آخر 30 يوما" : "30 derniers jours"}
        actions={
          <Link href="/dashboard/whatsapp/settings">
            <Button size="sm" variant={conn?.connection?.status === "connected" ? "secondary" : "primary"}>
              {conn?.connection?.status === "connected" ? (ar ? "إدارة الاتصال" : "Gérer la connexion") : ar ? "ربط واتساب" : "Connecter WhatsApp"}
            </Button>
          </Link>
        }
      />

      {conn && conn.connection?.status !== "connected" && (
        <Card className="flex items-center gap-3 border-amber-200 bg-amber-50 p-3.5">
          <AlertTriangle className="h-[18px] w-[18px] shrink-0 text-amber-600" />
          <p className="text-[13px] text-amber-900">
            {ar
              ? "لم يتم ربط واتساب بعد. تعمل الأتمتة في وضع الاختبار حتى تربط حسابك الرسمي."
              : "WhatsApp n'est pas encore connecté. Les automatisations fonctionnent en mode test tant que votre compte officiel n'est pas relié."}
          </p>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
        {isLoading || !data
          ? Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-[74px] rounded-[14px]" />)
          : [
              { l: ar ? "مرسلة" : "Envoyés", v: f.num(data.kpi.messagesSent) },
              { l: ar ? "معدل التسليم" : "Délivrance", v: `${data.kpi.messageDeliveryRate} %`, tone: "green" as const },
              { l: ar ? "معدل القراءة" : "Lecture", v: `${data.kpi.messageReadRate} %` },
              { l: ar ? "معدل الرد" : "Réponses", v: `${data.kpi.replyRate} %` },
              { l: ar ? "معدل الفشل" : "Échecs", v: `${data.kpi.failureRate} %`, tone: data.kpi.failureRate > 5 ? ("red" as const) : undefined },
              { l: ar ? "رسائل/طلب" : "Msg / commande", v: data.kpi.messagesPerOrder },
            ].map((k) => <KpiCard key={k.l} label={k.l} value={k.v} tone={k.tone} />)}
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{ar ? "حالة الاتصال" : "État de la connexion"}</CardTitle>
            {conn?.connection && (
              <Badge tone={conn.connection.status === "connected" ? "green" : conn.connection.status === "error" ? "red" : "gray"} dot>
                {conn.connection.status === "connected" ? (ar ? "متصل" : "Connecté") : conn.connection.status === "error" ? (ar ? "خطأ" : "Erreur") : ar ? "غير متصل" : "Déconnecté"}
              </Badge>
            )}
          </CardHeader>
          <CardBody className="space-y-2 text-[13px]">
            {[
              { l: ar ? "الرقم" : "Numéro", v: conn?.connection?.display_phone ?? "—" },
              { l: ar ? "آخر ويب هوك" : "Dernier webhook", v: f.dateTime(conn?.connection?.last_webhook_at) },
              { l: ar ? "آخر رسالة" : "Dernier message", v: f.dateTime(conn?.connection?.last_message_at) },
              { l: ar ? "آخر خطأ" : "Dernière erreur", v: conn?.connection?.last_error ?? "—" },
            ].map((r) => (
              <div key={r.l} className="flex items-center justify-between gap-3 border-b border-ink-100 pb-2 last:border-0">
                <span className="text-ink-500">{r.l}</span>
                <span className="truncate font-medium text-ink-800">{r.v}</span>
              </div>
            ))}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{ar ? "تقييم الجودة الداخلي" : "Évaluation qualité interne"}</CardTitle>
            {data && (
              <Badge tone={data.assessment.badge === "good" ? "green" : data.assessment.badge === "monitor" ? "amber" : "red"} dot>
                {data.assessment.badge === "good" ? (ar ? "جيد" : "Bon") : data.assessment.badge === "monitor" ? (ar ? "للمراقبة" : "À surveiller") : ar ? "في خطر" : "À risque"}
              </Badge>
            )}
          </CardHeader>
          <CardBody className="space-y-2">
            {data?.assessment.recommendations.map((r, i) => (
              <div key={i} className="flex items-start gap-2.5 rounded-lg border border-ink-100 p-2.5">
                {r.level === "good" ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />}
                <p className="text-[12.5px] leading-relaxed text-ink-700">{r.text}</p>
              </div>
            ))}
            {data?.meta?.qualityRating && (
              <div className="rounded-lg border border-ink-200 bg-ink-50 p-2.5">
                <p className="text-[11.5px] font-semibold uppercase text-ink-400">{ar ? "مؤشر ميتا" : "Indicateur Meta"}</p>
                <p className="mt-0.5 text-[13px] text-ink-800">{data.meta.qualityRating}</p>
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { href: "/dashboard/whatsapp/conversations", icon: Inbox, t: ar ? "المحادثات" : "Conversations", d: ar ? "رد على زبائنك" : "Répondez à vos clients" },
          { href: "/dashboard/whatsapp/templates", icon: Send, t: ar ? "القوالب" : "Templates", d: ar ? "أدر رسائلك المعتمدة" : "Gérez vos messages approuvés" },
          { href: "/dashboard/whatsapp/quality", icon: ShieldCheck, t: ar ? "جودة واتساب" : "Qualité WhatsApp", d: ar ? "احم رقمك" : "Protégez votre numéro" },
        ].map((c) => (
          <Link key={c.href} href={c.href}>
            <Card className="flex items-center gap-3 p-4 transition-shadow hover:shadow-md">
              <div className="grid h-9 w-9 place-items-center rounded-lg bg-brand-50">
                <c.icon className="h-[18px] w-[18px] text-brand-600" />
              </div>
              <div>
                <p className="text-[13.5px] font-semibold text-ink-900">{c.t}</p>
                <p className="text-[12px] text-ink-500">{c.d}</p>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
