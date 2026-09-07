"use client";

import useSWR from "swr";
import { Activity, Webhook } from "lucide-react";
import { fetcher } from "@/components/dashboard/shell";
import { Card, CardHeader, CardTitle, Badge, Skeleton, EmptyState, Button } from "@/components/ui";
import type { Health } from "../types";

const fmt = new Intl.NumberFormat("fr-FR");
const dt = (v?: string | null) => (v ? new Date(v.includes("T") ? v : `${v.replace(" ", "T")}Z`).toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");

export default function ObservabilityPage() {
  const { data, isLoading, mutate } = useSWR<Health>("/api/admin/health", fetcher, { refreshInterval: 30_000 });

  if (isLoading || !data) return <div className="grid gap-3 md:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-[14px]" />)}</div>;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[13px] text-ink-500">Santé des services sur les dernières 24 heures.</p>
        <Button size="sm" onClick={() => mutate()}>Actualiser</Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Object.entries(data.services).map(([name, s]) => (
          <Card key={name} className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-[13.5px] font-semibold capitalize text-ink-900">{name}</p>
              <Badge tone={s.state === "healthy" ? "green" : s.state === "degraded" ? "amber" : "red"} dot>
                {s.state === "healthy" ? "Healthy" : s.state === "degraded" ? "Degraded" : "Down"}
              </Badge>
            </div>
            <div className="mt-2.5 space-y-1 text-[12px]">
              {"calls" in s && s.calls !== undefined && (
                <>
                  <Row l="Appels (24 h)" v={fmt.format(s.calls)} />
                  <Row l="Échecs" v={fmt.format(s.failures ?? 0)} />
                  <Row l="Taux d'échec" v={`${s.calls ? Math.round(((s.failures ?? 0) / s.calls) * 1000) / 10 : 0} %`} />
                </>
              )}
              {s.pending !== undefined && (
                <>
                  <Row l="En attente" v={fmt.format(s.pending)} />
                  <Row l="En échec" v={fmt.format(s.failed ?? 0)} />
                  <Row l="Bloqués" v={fmt.format(s.stuck ?? 0)} />
                </>
              )}
            </div>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle>Webhooks en échec</CardTitle></CardHeader>
        {!data.failedWebhooks.length ? (
          <EmptyState icon={Webhook} title="Aucun webhook en échec" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-[12.5px]">
              <thead>
                <tr className="border-b border-ink-100 bg-ink-50/60 text-[11px] uppercase text-ink-500">
                  {["Date", "Marchand", "Source", "Évènement", "Erreur"].map((h) => <th key={h} className="px-3 py-2 text-start font-medium">{h}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {data.failedWebhooks.map((w) => (
                  <tr key={w.id}>
                    <td className="whitespace-nowrap px-3 py-2 text-ink-500">{dt(w.created_at)}</td>
                    <td className="px-3 py-2 text-ink-700">{w.merchant_name ?? "—"}</td>
                    <td className="px-3 py-2"><Badge tone="gray">{w.source}</Badge></td>
                    <td className="px-3 py-2 text-ink-600">{w.event_type ?? "—"}</td>
                    <td className="max-w-80 truncate px-3 py-2 text-red-600">{w.error ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card>
        <CardHeader><CardTitle>Erreurs centralisées</CardTitle></CardHeader>
        {!data.recentErrors.length ? (
          <EmptyState icon={Activity} title="Aucune erreur" />
        ) : (
          <div className="max-h-[420px] divide-y divide-ink-100 overflow-y-auto">
            {data.recentErrors.map((e, i) => (
              <div key={i} className="px-4 py-2.5">
                <p className="text-[12.5px] text-ink-800">{e.error ?? "—"}</p>
                <p className="text-[11px] text-ink-400">{e.merchant_name ?? "—"} · {e.service} · {e.operation} · {dt(e.created_at)}</p>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function Row({ l, v }: { l: string; v: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-ink-500">{l}</span>
      <span className="font-medium text-ink-800">{v}</span>
    </div>
  );
}
