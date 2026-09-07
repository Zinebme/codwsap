"use client";

import * as React from "react";
import Link from "next/link";
import useSWR from "swr";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, BarChart, Bar,
} from "recharts";
import { AlertTriangle, ArrowRight, Package, MessageSquare, Truck, Zap, Rocket } from "lucide-react";
import { fetcher } from "@/components/dashboard/shell";
import { useDashLocale, useFormat } from "@/components/dashboard/locale";
import { PageHeader, KpiCard, OrderStatusBadge, ErrorState, PhoneCell } from "@/components/dashboard/common";
import { Card, CardHeader, CardTitle, CardBody, Badge, Button, Skeleton, EmptyState, Tabs } from "@/components/ui";

type Dash = {
  kpi: Record<string, number>;
  today: Record<string, number>;
  recentOrders: Record<string, string | number | null>[];
  recentReplies: Record<string, string | null>[];
  incidents: Record<string, string | null>[];
  alerts: Record<string, string | null>[];
  automationFailures: Record<string, string | null>[];
  ordersByDay: { day: string; orders: number; delivered: number; confirmed: number }[];
  messagesByDay: { day: string; sent: number; failed: number; inbound: number }[];
  onboarding: { completed: boolean; progress: Record<string, boolean> };
};

export default function DashboardHome() {
  const { t, locale } = useDashLocale();
  const f = useFormat();
  const ar = locale === "ar";
  const { data, error, isLoading, mutate } = useSWR<Dash>("/api/dashboard", fetcher, { refreshInterval: 30_000 });
  const [chartTab, setChartTab] = React.useState("orders");

  if (error) return <ErrorState error={error.message} retry={() => mutate()} />;

  return (
    <div className="space-y-4">
      <PageHeader
        title={t("d.home")}
        subtitle={ar ? "نظرة سريعة على نشاط اليوم" : "Vue d'ensemble de votre activité"}
        actions={
          <>
            <Link href="/dashboard/orders?new=1">
              <Button variant="primary" size="sm">
                <Package className="h-3.5 w-3.5" /> {ar ? "طلب جديد" : "Nouvelle commande"}
              </Button>
            </Link>
          </>
        }
      />

      {data && !data.onboarding.completed && <OnboardingBanner progress={data.onboarding.progress} ar={ar} />}

      {/* KPI grid */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
        {isLoading || !data
          ? Array.from({ length: 12 }).map((_, i) => <Skeleton key={i} className="h-[74px] rounded-[14px]" />)
          : [
              { l: ar ? "طلبات اليوم" : "Commandes aujourd'hui", v: data.today.orders, q: "" },
              { l: ar ? "طلبات جديدة" : "Nouvelles", v: data.today.new, q: "status=new" },
              { l: ar ? "في انتظار التأكيد" : "À confirmer", v: data.today.awaiting, q: "status=awaiting_confirmation", tone: "amber" as const },
              { l: ar ? "مؤكدة" : "Confirmées", v: data.today.confirmed, q: "status=confirmed" },
              { l: ar ? "تم الشحن" : "Expédiées", v: data.today.shipped, q: "status=shipped" },
              { l: ar ? "في المكتب" : "Au bureau", v: data.today.atOffice, q: "status=at_office" },
              { l: ar ? "تم التسليم" : "Livrées", v: data.today.delivered, q: "status=delivered", tone: "green" as const },
              { l: ar ? "مرتجعة" : "Retournées", v: data.today.returned, q: "status=returned" },
              { l: ar ? "ملغاة" : "Annulées", v: data.today.cancelled, q: "status=cancelled_by_customer", tone: "red" as const },
              { l: ar ? "لا يردون" : "Sans réponse", v: data.today.noResponse, q: "status=no_response" },
              { l: ar ? "رسائل مرسلة" : "Messages envoyés", v: data.kpi.messagesSent, q: "" },
              { l: ar ? "فشل الإرسال" : "Échecs WhatsApp", v: data.kpi.messagesFailed, q: "wa=failed", tone: "red" as const },
            ].map((k) => (
              <Link key={k.l} href={k.q ? `/dashboard/orders?${k.q}` : "/dashboard/orders"}>
                <KpiCard label={k.l} value={f.num(k.v ?? 0)} tone={k.tone} />
              </Link>
            ))}
      </div>

      {data && data.kpi.attention > 0 && (
        <Link href="/dashboard/orders?attention=1">
          <Card className="flex items-center gap-3 border-amber-200 bg-amber-50 p-3.5 transition-colors hover:bg-amber-100/70">
            <AlertTriangle className="h-4.5 w-4.5 shrink-0 text-amber-600" style={{ width: 18, height: 18 }} />
            <p className="flex-1 text-[13.5px] font-medium text-amber-900">
              {f.num(data.kpi.attention)} {ar ? "طلبا يتطلب انتباهك" : "commandes nécessitent votre attention"}
            </p>
            <ArrowRight className="h-4 w-4 text-amber-700 rtl:rotate-180" />
          </Card>
        </Link>
      )}

      {/* Charts */}
      <Card>
        <CardHeader>
          <CardTitle>{ar ? "الاتجاهات" : "Tendances"}</CardTitle>
          <Tabs
            className="border-none"
            value={chartTab}
            onChange={setChartTab}
            tabs={[
              { id: "orders", label: ar ? "الطلبات" : "Commandes" },
              { id: "rates", label: ar ? "المعدلات" : "Taux" },
              { id: "messages", label: "WhatsApp" },
            ]}
          />
        </CardHeader>
        <CardBody>
          {isLoading || !data ? (
            <Skeleton className="h-56" />
          ) : chartTab === "orders" ? (
            <ChartArea data={data.ordersByDay} keys={[{ k: "orders", c: "#1c5cf0", n: ar ? "طلبات" : "Commandes" }, { k: "delivered", c: "#10b981", n: ar ? "تم التسليم" : "Livrées" }]} />
          ) : chartTab === "rates" ? (
            <RateBars data={data.kpi} ar={ar} />
          ) : (
            <ChartArea data={data.messagesByDay} keys={[{ k: "sent", c: "#1c5cf0", n: ar ? "مرسلة" : "Envoyés" }, { k: "inbound", c: "#10b981", n: ar ? "ردود" : "Réponses" }, { k: "failed", c: "#ef4444", n: ar ? "فشل" : "Échecs" }]} />
          )}
        </CardBody>
      </Card>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{ar ? "آخر الطلبات" : "Commandes récentes"}</CardTitle>
            <Link href="/dashboard/orders" className="text-[12.5px] font-medium text-brand-600 hover:underline">
              {ar ? "عرض الكل" : "Voir tout"}
            </Link>
          </CardHeader>
          {isLoading || !data ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10" />
              ))}
            </div>
          ) : !data.recentOrders.length ? (
            <EmptyState icon={Package} title={ar ? "لا توجد طلبات بعد" : "Aucune commande pour le moment"} description={ar ? "اربط مصدر طلبات أو أنشئ طلبا يدويا." : "Connectez une source ou créez une commande manuellement."} />
          ) : (
            <div className="divide-y divide-ink-100">
              {data.recentOrders.map((o) => (
                <Link key={String(o.id)} href={`/dashboard/orders?order=${o.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-ink-50">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium text-ink-800">
                      {String(o.reference)} · {String(o.customer_name ?? "—")}
                    </p>
                    <div className="mt-0.5 flex items-center gap-2">
                      <span className="text-[11.5px] text-ink-400">{o.wilaya ?? "—"}</span>
                      <PhoneCell phone={o.normalized_phone as string} />
                    </div>
                  </div>
                  <span className="text-[12.5px] font-medium text-ink-700 tabular">{f.money(Number(o.total))}</span>
                  <OrderStatusBadge status={String(o.status)} />
                </Link>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{ar ? "آخر ردود واتساب" : "Réponses WhatsApp récentes"}</CardTitle>
            <Link href="/dashboard/whatsapp/conversations" className="text-[12.5px] font-medium text-brand-600 hover:underline">
              {ar ? "الصندوق" : "Inbox"}
            </Link>
          </CardHeader>
          {isLoading || !data ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10" />
              ))}
            </div>
          ) : !data.recentReplies.length ? (
            <EmptyState icon={MessageSquare} title={ar ? "لا توجد ردود" : "Aucune réponse"} description={ar ? "ستظهر ردود زبائنك هنا." : "Les réponses de vos clients apparaîtront ici."} />
          ) : (
            <div className="divide-y divide-ink-100">
              {data.recentReplies.map((m) => (
                <div key={String(m.id)} className="px-4 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-[13px] font-medium text-ink-800">{m.customer_name || m.normalized_phone}</p>
                    <span className="shrink-0 text-[11px] text-ink-400">{f.relative(m.created_at)}</span>
                  </div>
                  <p className="mt-0.5 line-clamp-1 text-[12.5px] text-ink-500">{m.body}</p>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{ar ? "حوادث التوصيل" : "Incidents de livraison"}</CardTitle>
          </CardHeader>
          {!data?.incidents.length ? (
            <EmptyState icon={Truck} title={ar ? "لا توجد حوادث" : "Aucun incident"} />
          ) : (
            <div className="divide-y divide-ink-100">
              {data.incidents.map((i) => (
                <Link key={String(i.id)} href={`/dashboard/orders?order=${i.order_id}`} className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-ink-50">
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-medium text-ink-800">{i.reference}</p>
                    <p className="text-[11.5px] text-ink-400">{i.raw_status}</p>
                  </div>
                  <Badge tone={i.normalized_status === "returned" ? "orange" : "red"}>{i.normalized_status}</Badge>
                </Link>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{ar ? "تنبيهات وأخطاء" : "Alertes et erreurs"}</CardTitle>
            <Link href="/dashboard/notifications" className="text-[12.5px] font-medium text-brand-600 hover:underline">
              {ar ? "الكل" : "Tout"}
            </Link>
          </CardHeader>
          {!data?.alerts.length && !data?.automationFailures.length ? (
            <EmptyState icon={Zap} title={ar ? "كل شيء يعمل جيدا" : "Tout fonctionne correctement"} />
          ) : (
            <div className="divide-y divide-ink-100">
              {data?.alerts.map((a) => (
                <div key={String(a.id)} className="flex items-start gap-2.5 px-4 py-2.5">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-medium text-ink-800">{a.title}</p>
                    <p className="text-[11.5px] text-ink-400">{f.relative(a.created_at)}</p>
                  </div>
                </div>
              ))}
              {data?.automationFailures.map((a) => (
                <div key={String(a.id)} className="flex items-start gap-2.5 px-4 py-2.5">
                  <Zap className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                  <div className="min-w-0">
                    <p className="truncate text-[13px] text-ink-700">
                      {ar ? "فشل الأتمتة" : "Échec d'automatisation"} · {a.reason}
                    </p>
                    <p className="text-[11.5px] text-ink-400">{f.relative(a.created_at)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function OnboardingBanner({ progress, ar }: { progress: Record<string, boolean>; ar: boolean }) {
  const steps = Object.values(progress).filter(Boolean).length;
  const total = Object.keys(progress).length - 1;
  return (
    <Card className="flex flex-col gap-3 border-brand-200 bg-brand-50/60 p-4 sm:flex-row sm:items-center">
      <Rocket className="h-5 w-5 shrink-0 text-brand-600" />
      <div className="flex-1">
        <p className="text-[13.5px] font-semibold text-ink-900">{ar ? "أكمل إعداد حسابك" : "Terminez la configuration de votre compte"}</p>
        <p className="mt-0.5 text-[12.5px] text-ink-600">
          {steps}/{total} {ar ? "خطوات مكتملة" : "étapes complétées"}
        </p>
        <div className="mt-2 h-1.5 w-full max-w-sm overflow-hidden rounded-full bg-white">
          <div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${Math.min(100, (steps / Math.max(1, total)) * 100)}%` }} />
        </div>
      </div>
      <Link href="/onboarding">
        <Button variant="primary" size="sm">
          {ar ? "متابعة" : "Continuer"} <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" />
        </Button>
      </Link>
    </Card>
  );
}

function ChartArea({ data, keys }: { data: Record<string, string | number>[]; keys: { k: string; c: string; n: string }[] }) {
  if (!data.length) return <div className="grid h-56 place-items-center text-[13px] text-ink-400">Pas encore de données</div>;
  return (
    <ResponsiveContainer width="100%" height={224}>
      <AreaChart data={data} margin={{ top: 4, right: 8, left: -22, bottom: 0 }}>
        <defs>
          {keys.map((k) => (
            <linearGradient key={k.k} id={`g-${k.k}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={k.c} stopOpacity={0.22} />
              <stop offset="100%" stopColor={k.c} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#eef0f4" vertical={false} />
        <XAxis dataKey="day" tick={{ fontSize: 11, fill: "#98a1b3" }} tickLine={false} axisLine={false} tickFormatter={(v: string) => v.slice(5)} />
        <YAxis tick={{ fontSize: 11, fill: "#98a1b3" }} tickLine={false} axisLine={false} allowDecimals={false} width={38} />
        <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #e6e9ef", fontSize: 12 }} />
        {keys.map((k) => (
          <Area key={k.k} type="monotone" dataKey={k.k} name={k.n} stroke={k.c} fill={`url(#g-${k.k})`} strokeWidth={2} isAnimationActive={false} />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}

function RateBars({ data, ar }: { data: Record<string, number>; ar: boolean }) {
  const rows = [
    { n: ar ? "التأكيد" : "Confirmation", v: data.confirmationRate },
    { n: ar ? "التسليم" : "Livraison", v: data.deliveryRate },
    { n: ar ? "الإرجاع" : "Retour", v: data.returnRate },
    { n: ar ? "رد واتساب" : "Réponse WA", v: data.replyRate },
  ];
  return (
    <ResponsiveContainer width="100%" height={224}>
      <BarChart data={rows} margin={{ top: 4, right: 8, left: -22, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#eef0f4" vertical={false} />
        <XAxis dataKey="n" tick={{ fontSize: 11, fill: "#98a1b3" }} tickLine={false} axisLine={false} />
        <YAxis tick={{ fontSize: 11, fill: "#98a1b3" }} tickLine={false} axisLine={false} width={38} unit="%" />
        <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #e6e9ef", fontSize: 12 }} formatter={(v) => `${v} %`} />
        <Bar dataKey="v" name="%" fill="#1c5cf0" radius={[6, 6, 0, 0]} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}
