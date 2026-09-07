"use client";

import useSWR from "swr";
import Link from "next/link";
import { AlertTriangle, Activity, Store } from "lucide-react";
import { fetcher } from "@/components/dashboard/shell";
import { Card, CardHeader, CardTitle, Badge, Skeleton, EmptyState, Stat } from "@/components/ui";
import type { Health } from "./types";

const fmt = new Intl.NumberFormat("fr-FR");
const dt = (v?: string | null) => (v ? new Date(v.includes("T") ? v : `${v.replace(" ", "T")}Z`).toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");

function StateBadge({ state }: { state: string }) {
  return (
    <Badge tone={state === "healthy" ? "green" : state === "degraded" ? "amber" : "red"} dot>
      {state === "healthy" ? "Healthy" : state === "degraded" ? "Degraded" : "Down"}
    </Badge>
  );
}

export default function AdminHome() {
  const { data, isLoading } = useSWR<Health>("/api/admin/health", fetcher, { refreshInterval: 60_000 });

  if (isLoading || !data) return <div className="grid gap-3 md:grid-cols-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-[14px]" />)}</div>;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4 xl:grid-cols-8">
        <Stat label="Marchands" value={fmt.format(data.kpi.merchants)} icon={Store} />
        <Stat label="Actifs" value={fmt.format(data.kpi.active)} tone="green" />
        <Stat label="En essai" value={fmt.format(data.kpi.trial)} tone="blue" />
        <Stat label="Suspendus" value={fmt.format(data.kpi.suspended)} tone="red" />
        <Stat label="Commandes" value={fmt.format(data.kpi.orders)} />
        <Stat label="Messages" value={fmt.format(data.kpi.messages)} />
        <Stat label="Msg en échec" value={fmt.format(data.kpi.failedMessages)} tone={data.kpi.failedMessages ? "amber" : undefined} />
        <Stat label="Erreurs intégrations" value={fmt.format(data.kpi.integrationErrors)} tone={data.kpi.integrationErrors ? "red" : undefined} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Observabilité des services</CardTitle>
          <Link href="/admin/observability" className="text-[12.5px] font-medium text-brand-600 hover:underline">Détails</Link>
        </CardHeader>
        <div className="grid gap-px bg-ink-100 sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(data.services).map(([name, s]) => (
            <div key={name} className="flex items-center justify-between bg-white px-4 py-3">
              <div>
                <p className="text-[13px] font-medium capitalize text-ink-800">{name}</p>
                <p className="text-[11.5px] text-ink-400">
                  {"calls" in s ? `${fmt.format(s.calls ?? 0)} appels · ${fmt.format(s.failures ?? 0)} échecs` : `${s.pending ?? 0} en attente · ${s.failed ?? 0} en échec`}
                </p>
              </div>
              <StateBadge state={s.state} />
            </div>
          ))}
        </div>
      </Card>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Erreurs récentes</CardTitle></CardHeader>
          {!data.recentErrors.length ? (
            <EmptyState icon={Activity} title="Aucune erreur" />
          ) : (
            <div className="max-h-80 divide-y divide-ink-100 overflow-y-auto">
              {data.recentErrors.slice(0, 12).map((e, i) => (
                <div key={i} className="flex items-start gap-2.5 px-4 py-2.5">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-500" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12.5px] text-ink-800">{e.error ?? `${e.service} · ${e.operation}`}</p>
                    <p className="text-[11px] text-ink-400">{e.merchant_name ?? "—"} · {e.service} · {dt(e.created_at)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <CardHeader><CardTitle>Demandes de transporteurs</CardTitle></CardHeader>
          {!data.providerRequests.length ? (
            <EmptyState icon={Store} title="Aucune demande" description="Les marchands peuvent demander l'ajout d'un transporteur non listé." />
          ) : (
            <div className="divide-y divide-ink-100">
              {data.providerRequests.map((r) => (
                <div key={r.id} className="px-4 py-2.5">
                  <p className="text-[13px] font-medium text-ink-800">{r.provider_name}</p>
                  <p className="text-[11.5px] text-ink-500">{r.merchant_name ?? "—"} · {r.contact ?? "sans contact"} · {dt(r.created_at)}</p>
                  {r.details && <p className="mt-0.5 text-[12px] text-ink-600">{r.details}</p>}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
