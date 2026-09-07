"use client";

import useSWR from "swr";
import { Shield } from "lucide-react";
import { fetcher } from "@/components/dashboard/shell";
import { Card, CardHeader, CardTitle, Badge, Skeleton, EmptyState } from "@/components/ui";
import type { Health } from "../types";

const dt = (v?: string | null) => (v ? new Date(v.includes("T") ? v : `${v.replace(" ", "T")}Z`).toLocaleString("fr-FR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");

export default function LogsPage() {
  const { data, isLoading } = useSWR<Health>("/api/admin/health", fetcher, { refreshInterval: 60_000 });

  if (isLoading || !data) return <Skeleton className="h-96 rounded-[14px]" />;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Journal d&apos;audit global</CardTitle>
        <span className="text-[11.5px] text-ink-400">Toutes les actions sensibles sont horodatées et attribuées.</span>
      </CardHeader>
      {!data.audits.length ? (
        <EmptyState icon={Shield} title="Aucune entrée" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-[12.5px]">
            <thead>
              <tr className="border-b border-ink-100 bg-ink-50/60 text-[11px] uppercase text-ink-500">
                {["Date", "Marchand", "Acteur", "Action", "Ressource", "IP"].map((h) => <th key={h} className="px-3 py-2 text-start font-medium">{h}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {data.audits.map((a) => (
                <tr key={a.id} className="hover:bg-ink-50/60">
                  <td className="whitespace-nowrap px-3 py-2 text-ink-500">{dt(a.created_at)}</td>
                  <td className="px-3 py-2 text-ink-700">{a.merchant_name ?? "—"}</td>
                  <td className="px-3 py-2 text-ink-600">{a.actor_label ?? "—"}</td>
                  <td className="px-3 py-2"><Badge tone={a.action.startsWith("admin.") ? "violet" : "gray"}>{a.action}</Badge></td>
                  <td className="px-3 py-2 text-ink-600">{a.resource ?? "—"}</td>
                  <td className="px-3 py-2 text-ink-500" dir="ltr">{a.ip ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
