"use client";

import * as React from "react";
import useSWR from "swr";
import { AreaChart, Area, BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Download } from "lucide-react";
import { fetcher } from "@/components/dashboard/shell";
import { useDashLocale, useFormat } from "@/components/dashboard/locale";
import { PageHeader, KpiCard } from "@/components/dashboard/common";
import { Card, CardHeader, CardTitle, CardBody, Button, Input, Skeleton, cn } from "@/components/ui";

const BRAND = "#1c5cf0", SUCCESS = "#10b981", DANGER = "#ef4444", AMBER = "#f59e0b", GRID = "#eef0f4", AXIS = "#98a1b3";

type Payload = {
  range: { from: string; to: string };
  kpi: Record<string, number>;
  ordersByDay: { day: string; orders: number; delivered: number; returned: number; confirmed: number }[];
  messagesByDay: { day: string; sent: number; failed: number; inbound: number }[];
};

export default function AnalyticsPage() {
  const { locale } = useDashLocale();
  const f = useFormat();
  const ar = locale === "ar";
  const [preset, setPreset] = React.useState("30d");
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const qs = new URLSearchParams({ preset });
  if (preset === "custom" && from && to) { qs.set("from", from); qs.set("to", to); }
  const { data, isLoading } = useSWR<Payload>(`/api/analytics?${qs}`, fetcher, { keepPreviousData: true });

  const presets = [
    { id: "today", fr: "Aujourd'hui", ar: "اليوم" },
    { id: "7d", fr: "7 jours", ar: "7 أيام" },
    { id: "30d", fr: "30 jours", ar: "30 يوما" },
    { id: "90d", fr: "90 jours", ar: "90 يوما" },
    { id: "custom", fr: "Personnalisé", ar: "مخصص" },
  ];

  return (
    <div className="space-y-3">
      <PageHeader
        title={ar ? "الإحصائيات" : "Statistiques"}
        subtitle={data ? `${f.date(data.range.from)} → ${f.date(data.range.to)}` : undefined}
        actions={
          <a href={`/api/orders/export?preset=${preset}`}>
            <Button size="sm"><Download className="h-3.5 w-3.5" /> {ar ? "تصدير CSV" : "Exporter CSV"}</Button>
          </a>
        }
      />

      <Card className="flex flex-wrap items-center gap-2 p-2.5">
        <div className="flex flex-wrap gap-1">
          {presets.map((p) => (
            <button
              key={p.id}
              onClick={() => setPreset(p.id)}
              className={cn("rounded-lg px-2.5 py-1.5 text-[12.5px] font-medium", preset === p.id ? "bg-brand-600 text-white" : "text-ink-600 hover:bg-ink-100")}
            >
              {ar ? p.ar : p.fr}
            </button>
          ))}
        </div>
        {preset === "custom" && (
          <div className="flex items-center gap-2">
            <Input type="date" className="h-8 w-auto text-[12.5px]" value={from} onChange={(e) => setFrom(e.target.value)} />
            <span className="text-ink-400">→</span>
            <Input type="date" className="h-8 w-auto text-[12.5px]" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        )}
      </Card>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
        {isLoading || !data
          ? Array.from({ length: 12 }).map((_, i) => <Skeleton key={i} className="h-[74px] rounded-[14px]" />)
          : [
              { l: ar ? "الطلبات" : "Commandes", v: f.num(data.kpi.orders) },
              { l: ar ? "مؤكدة" : "Confirmées", v: f.num(data.kpi.confirmed) },
              { l: ar ? "معدل التأكيد" : "Taux de confirmation", v: `${data.kpi.confirmationRate} %`, tone: "green" as const },
              { l: ar ? "تم التسليم" : "Livrées", v: f.num(data.kpi.delivered) },
              { l: ar ? "معدل التسليم" : "Taux de livraison", v: `${data.kpi.deliveryRate} %`, tone: "green" as const },
              { l: ar ? "معدل الإرجاع" : "Taux de retour", v: `${data.kpi.returnRate} %`, tone: "red" as const },
              { l: ar ? "معدل الإلغاء" : "Taux d'annulation", v: `${data.kpi.cancellationRate} %` },
              { l: ar ? "بدون رد" : "Sans réponse", v: `${data.kpi.noResponseRate} %` },
              { l: ar ? "رقم الأعمال المحصّل" : "CA encaissé", v: f.money(data.kpi.revenue), tone: "green" as const },
              { l: ar ? "متوسط السلة" : "Panier moyen", v: f.money(data.kpi.aov) },
              { l: ar ? "رسائل مرسلة" : "Messages envoyés", v: f.num(data.kpi.messagesSent) },
              { l: ar ? "معدل الرد" : "Taux de réponse WA", v: `${data.kpi.replyRate} %` },
            ].map((k) => <KpiCard key={k.l} label={k.l} value={k.v} tone={k.tone} />)}
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>{ar ? "الطلبات يوميا" : "Commandes par jour"}</CardTitle></CardHeader>
          <CardBody className="h-64">
            {data && (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.ordersByDay} margin={{ left: -18, right: 6, top: 6 }}>
                  <defs>
                    <linearGradient id="gOrders" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={BRAND} stopOpacity={0.28} />
                      <stop offset="100%" stopColor={BRAND} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke={GRID} vertical={false} />
                  <XAxis dataKey="day" tick={{ fontSize: 11, fill: AXIS }} tickFormatter={(d) => String(d).slice(5)} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: AXIS }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #e6e8ee", fontSize: 12 }} />
                  <Area type="monotone" dataKey="orders" name={ar ? "طلبات" : "Commandes"} stroke={BRAND} strokeWidth={2} fill="url(#gOrders)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader><CardTitle>{ar ? "التسليم مقابل الإرجاع" : "Livraisons vs retours"}</CardTitle></CardHeader>
          <CardBody className="h-64">
            {data && (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.ordersByDay} margin={{ left: -18, right: 6, top: 6 }}>
                  <CartesianGrid stroke={GRID} vertical={false} />
                  <XAxis dataKey="day" tick={{ fontSize: 11, fill: AXIS }} tickFormatter={(d) => String(d).slice(5)} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: AXIS }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #e6e8ee", fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="delivered" name={ar ? "مسلّمة" : "Livrées"} fill={SUCCESS} radius={[3, 3, 0, 0]} />
                  <Bar dataKey="returned" name={ar ? "مرتجعة" : "Retours"} fill={AMBER} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader><CardTitle>{ar ? "رسائل واتساب" : "Messages WhatsApp"}</CardTitle></CardHeader>
          <CardBody className="h-64">
            {data && (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.messagesByDay} margin={{ left: -18, right: 6, top: 6 }}>
                  <CartesianGrid stroke={GRID} vertical={false} />
                  <XAxis dataKey="day" tick={{ fontSize: 11, fill: AXIS }} tickFormatter={(d) => String(d).slice(5)} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: AXIS }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #e6e8ee", fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="sent" name={ar ? "مرسلة" : "Envoyés"} stroke={BRAND} strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="inbound" name={ar ? "ردود" : "Réponses"} stroke={SUCCESS} strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="failed" name={ar ? "فاشلة" : "Échecs"} stroke={DANGER} strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader><CardTitle>{ar ? "معدل التأكيد يوميا" : "Taux de confirmation par jour"}</CardTitle></CardHeader>
          <CardBody className="h-64">
            {data && (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={data.ordersByDay.map((d) => ({ day: d.day, rate: d.orders ? Math.round((d.confirmed / d.orders) * 100) : 0 }))}
                  margin={{ left: -18, right: 6, top: 6 }}
                >
                  <CartesianGrid stroke={GRID} vertical={false} />
                  <XAxis dataKey="day" tick={{ fontSize: 11, fill: AXIS }} tickFormatter={(d) => String(d).slice(5)} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: AXIS }} axisLine={false} tickLine={false} domain={[0, 100]} unit="%" />
                  <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #e6e8ee", fontSize: 12 }} formatter={(v) => [`${v} %`, ar ? "معدل التأكيد" : "Confirmation"]} />
                  <Line type="monotone" dataKey="rate" stroke={BRAND} strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
