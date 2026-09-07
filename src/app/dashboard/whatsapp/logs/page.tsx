"use client";

import * as React from "react";
import useSWR from "swr";
import { ScrollText } from "lucide-react";
import { fetcher } from "@/components/dashboard/shell";
import { useDashLocale, useFormat } from "@/components/dashboard/locale";
import { PageHeader, MessageStatusBadge } from "@/components/dashboard/common";
import { Card, Select, Pagination, TableSkeleton, EmptyState, Badge } from "@/components/ui";

export default function LogsPage() {
  const { locale } = useDashLocale();
  const f = useFormat();
  const ar = locale === "ar";
  const [status, setStatus] = React.useState("");
  const [direction, setDirection] = React.useState("");
  const [page, setPage] = React.useState(1);
  const params = new URLSearchParams({ page: String(page) });
  if (status) params.set("status", status);
  if (direction) params.set("direction", direction);
  const { data, isLoading } = useSWR<{ rows: Record<string, string | null>[]; total: number; page: number; pages: number; pageSize: number }>(`/api/whatsapp/logs?${params}`, fetcher, { keepPreviousData: true });

  return (
    <div className="space-y-3">
      <PageHeader title={ar ? "سجل الرسائل" : "Journal des messages"} subtitle={data ? `${f.num(data.total)} ${ar ? "رسالة" : "messages"}` : undefined} />
      <Card className="flex gap-2.5 p-3">
        <Select className="w-auto" value={direction} onChange={(e) => { setDirection(e.target.value); setPage(1); }}>
          <option value="">{ar ? "كل الاتجاهات" : "Toutes directions"}</option>
          <option value="outbound">{ar ? "صادرة" : "Sortants"}</option>
          <option value="inbound">{ar ? "واردة" : "Entrants"}</option>
        </Select>
        <Select className="w-auto" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          <option value="">{ar ? "كل الحالات" : "Tous statuts"}</option>
          {["queued", "sent", "delivered", "read", "failed", "rejected", "received"].map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </Select>
      </Card>
      <Card className="overflow-hidden">
        {isLoading && !data ? (
          <TableSkeleton rows={10} cols={6} />
        ) : !data?.rows.length ? (
          <EmptyState icon={ScrollText} title={ar ? "لا توجد رسائل" : "Aucun message"} />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-[12.5px]">
                <thead>
                  <tr className="border-b border-ink-200 bg-ink-50/60 text-[11px] uppercase text-ink-500">
                    {[ar ? "التاريخ" : "Date", ar ? "الاتجاه" : "Sens", ar ? "الزبون" : "Client", ar ? "الطلب" : "Commande", ar ? "القالب" : "Template", ar ? "المحتوى" : "Contenu", ar ? "الحالة" : "Statut"].map((h) => (
                      <th key={h} className="whitespace-nowrap px-3 py-2 text-start font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {data.rows.map((m) => (
                    <tr key={String(m.id)} className="hover:bg-ink-50/60">
                      <td className="whitespace-nowrap px-3 py-2 text-ink-500">{f.dateTime(m.created_at)}</td>
                      <td className="px-3 py-2"><Badge tone={m.direction === "inbound" ? "violet" : "blue"}>{m.direction === "inbound" ? (ar ? "وارد" : "Entrant") : ar ? "صادر" : "Sortant"}</Badge></td>
                      <td className="px-3 py-2 text-ink-700">{m.customer_name || m.normalized_phone || "—"}</td>
                      <td className="px-3 py-2 text-ink-600">{m.order_reference ?? "—"}</td>
                      <td className="px-3 py-2 text-ink-600" dir="ltr">{m.template_name ?? "—"}</td>
                      <td className="max-w-72 truncate px-3 py-2 text-ink-600">{m.body}</td>
                      <td className="px-3 py-2">
                        <MessageStatusBadge status={String(m.status)} />
                        {m.error_message && <p className="mt-0.5 max-w-52 truncate text-[10.5px] text-red-600">{m.error_message}</p>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={data.page} pages={data.pages} total={data.total} pageSize={data.pageSize} onPage={setPage} />
          </>
        )}
      </Card>
    </div>
  );
}
