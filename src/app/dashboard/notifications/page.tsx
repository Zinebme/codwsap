"use client";

import * as React from "react";
import Link from "next/link";
import useSWR from "swr";
import { Bell, CheckCheck, AlertTriangle, Info, XCircle, Settings } from "lucide-react";
import { fetcher } from "@/components/dashboard/shell";
import { useDashLocale, useFormat } from "@/components/dashboard/locale";
import { PageHeader } from "@/components/dashboard/common";
import { Card, Button, Badge, EmptyState, Skeleton, cn } from "@/components/ui";

type Notif = { id: string; type: string; severity: string; title: string; body: string | null; link: string | null; read_at: string | null; created_at: string };

export default function NotificationsPage() {
  const { locale } = useDashLocale();
  const f = useFormat();
  const ar = locale === "ar";
  const [unreadOnly, setUnreadOnly] = React.useState(false);
  const { data, isLoading, mutate } = useSWR<{ rows: Notif[]; unread: number }>(`/api/notifications?limit=50${unreadOnly ? "&unread=1" : ""}`, fetcher, { refreshInterval: 30_000 });

  async function markAll() {
    await fetch("/api/notifications", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ all: true }) });
    mutate();
  }
  async function toggleRead(n: Notif) {
    await fetch("/api/notifications", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: [n.id], unread: !!n.read_at }) });
    mutate();
  }

  return (
    <div className="space-y-3">
      <PageHeader
        title={ar ? "الإشعارات" : "Notifications"}
        subtitle={data ? `${data.unread} ${ar ? "غير مقروءة" : "non lues"}` : undefined}
        actions={
          <>
            <Button size="sm" variant={unreadOnly ? "primary" : "secondary"} onClick={() => setUnreadOnly((v) => !v)}>{ar ? "غير المقروءة" : "Non lues"}</Button>
            <Button size="sm" onClick={markAll}><CheckCheck className="h-3.5 w-3.5" /> {ar ? "تعليم الكل كمقروء" : "Tout marquer comme lu"}</Button>
            <Link href="/dashboard/settings?section=notifications"><Button size="sm"><Settings className="h-3.5 w-3.5" /> {ar ? "التفضيلات" : "Préférences"}</Button></Link>
          </>
        }
      />

      <Card className="overflow-hidden">
        {isLoading && !data ? (
          <div className="space-y-2 p-3">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-14" />)}</div>
        ) : !data?.rows.length ? (
          <EmptyState icon={Bell} title={ar ? "لا توجد إشعارات" : "Aucune notification"} description={ar ? "ننبهك فقط لما يستحق انتباهك." : "Nous vous alertons uniquement sur ce qui mérite votre attention."} />
        ) : (
          <div className="divide-y divide-ink-100">
            {data.rows.map((n) => {
              const Icon = n.severity === "error" ? XCircle : n.severity === "warning" ? AlertTriangle : Info;
              const tone = n.severity === "error" ? "text-red-500" : n.severity === "warning" ? "text-amber-500" : "text-brand-600";
              const inner = (
                <div className={cn("flex items-start gap-3 px-4 py-3", !n.read_at && "bg-brand-50/40")}>
                  <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", tone)} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-[13px] font-medium text-ink-900">{n.title}</p>
                      {!n.read_at && <Badge tone="blue">{ar ? "جديد" : "Nouveau"}</Badge>}
                    </div>
                    {n.body && <p className="mt-0.5 text-[12.5px] text-ink-600">{n.body}</p>}
                    <p className="mt-0.5 text-[11px] text-ink-400">{f.dateTime(n.created_at)}</p>
                  </div>
                  <button onClick={(e) => { e.preventDefault(); toggleRead(n); }} className="shrink-0 text-[11.5px] text-ink-400 hover:text-ink-700">
                    {n.read_at ? (ar ? "تعليم كغير مقروء" : "Marquer non lu") : ar ? "تعليم كمقروء" : "Marquer lu"}
                  </button>
                </div>
              );
              return n.link ? <Link key={n.id} href={n.link} className="block hover:bg-ink-50/70">{inner}</Link> : <div key={n.id}>{inner}</div>;
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
