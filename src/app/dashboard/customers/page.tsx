"use client";

import * as React from "react";
import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import useSWR from "swr";
import { Users, RefreshCw, Ban, CheckCircle2, StickyNote } from "lucide-react";
import { fetcher } from "@/components/dashboard/shell";
import { useDashLocale, useFormat } from "@/components/dashboard/locale";
import { PageHeader, WaAvailabilityBadge, PhoneCell, CallButton, WhatsappLinkButton, OrderStatusBadge, ErrorState } from "@/components/dashboard/common";
import { Card, SearchInput, Select, Pagination, TableSkeleton, EmptyState, Drawer, Button, Badge, Textarea, useToast, Skeleton, Tabs } from "@/components/ui";
import { WILAYAS } from "@/lib/domain";

type Row = Record<string, string | number | null>;

export default function CustomersPage() {
  return (
    <Suspense fallback={<TableSkeleton />}>
      <Inner />
    </Suspense>
  );
}

function Inner() {
  const { t, locale } = useDashLocale();
  const f = useFormat();
  const ar = locale === "ar";
  const router = useRouter();
  const sp = useSearchParams();
  const [q, setQ] = React.useState("");
  const [dq, setDq] = React.useState("");
  const [wilaya, setWilaya] = React.useState("");
  const [wa, setWa] = React.useState("");
  const [page, setPage] = React.useState(1);
  const open = sp.get("c");

  React.useEffect(() => {
    const id = setTimeout(() => { setDq(q); setPage(1); }, 250);
    return () => clearTimeout(id);
  }, [q]);

  const params = new URLSearchParams({ page: String(page) });
  if (dq) params.set("q", dq);
  if (wilaya) params.set("wilaya", wilaya);
  if (wa) params.set("wa", wa);

  const { data, error, isLoading, mutate } = useSWR<{ rows: Row[]; total: number; page: number; pages: number; pageSize: number }>(`/api/customers?${params}`, fetcher, { keepPreviousData: true });

  if (error) return <ErrorState error={error.message} retry={() => mutate()} />;

  return (
    <div className="space-y-3">
      <PageHeader title={t("d.customers")} subtitle={data ? `${f.num(data.total)} ${ar ? "زبون" : "clients"}` : undefined} />

      <Card className="flex flex-col gap-2.5 p-3 sm:flex-row">
        <SearchInput className="flex-1" value={q} onChange={(e) => setQ(e.target.value)} placeholder={ar ? "الاسم أو الهاتف…" : "Nom ou téléphone…"} />
        <Select className="sm:w-44" value={wilaya} onChange={(e) => { setWilaya(e.target.value); setPage(1); }}>
          <option value="">{ar ? "كل الولايات" : "Toutes les wilayas"}</option>
          {WILAYAS.map((w) => (
            <option key={w} value={w}>{w}</option>
          ))}
        </Select>
        <Select className="sm:w-44" value={wa} onChange={(e) => { setWa(e.target.value); setPage(1); }}>
          <option value="">{ar ? "كل حالات واتساب" : "Tous statuts WhatsApp"}</option>
          <option value="available">{ar ? "متاح" : "Disponible"}</option>
          <option value="unavailable">{ar ? "غير متاح" : "Indisponible"}</option>
          <option value="unknown">{ar ? "غير معروف" : "Inconnu"}</option>
        </Select>
      </Card>

      <Card className="overflow-hidden">
        {isLoading && !data ? (
          <TableSkeleton rows={8} cols={6} />
        ) : !data?.rows.length ? (
          <EmptyState icon={Users} title={ar ? "لا يوجد زبائن" : "Aucun client"} description={ar ? "سيظهر الزبائن تلقائيا مع الطلبات." : "Les clients apparaissent automatiquement avec les commandes."} />
        ) : (
          <>
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full min-w-[900px]">
                <thead>
                  <tr className="border-b border-ink-200 bg-ink-50/60 text-[11.5px] uppercase text-ink-500">
                    {[ar ? "الزبون" : "Client", ar ? "واتساب" : "WhatsApp", ar ? "الولاية" : "Wilaya", ar ? "الطلبات" : "Commandes", ar ? "مسلمة" : "Livrées", ar ? "مرتجعة" : "Retours", ar ? "قيمة COD" : "Valeur COD", ar ? "آخر طلب" : "Dernier", ""].map((h, i) => (
                      <th key={i} className="whitespace-nowrap px-3 py-2 text-start font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {data.rows.map((c) => (
                    <tr key={String(c.id)} className="cursor-pointer text-[13px] hover:bg-ink-50/70" onClick={() => router.push(`/dashboard/customers?c=${c.id}`)}>
                      <td className="px-3 py-2.5">
                        <p className="font-medium text-ink-800">{String(c.full_name || "—")}</p>
                        <PhoneCell phone={c.normalized_phone as string} />
                      </td>
                      <td className="px-3 py-2.5"><WaAvailabilityBadge status={String(c.whatsapp_status)} /></td>
                      <td className="px-3 py-2.5 text-ink-600">{c.wilaya ?? "—"}</td>
                      <td className="px-3 py-2.5 tabular text-ink-700">{c.total_orders}</td>
                      <td className="px-3 py-2.5 tabular text-emerald-600">{c.delivered_orders}</td>
                      <td className="px-3 py-2.5 tabular text-orange-600">{c.returned_orders}</td>
                      <td className="px-3 py-2.5 tabular font-medium text-ink-800">{f.money(Number(c.total_cod_value))}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-ink-500">{f.date(c.last_order_at as string)}</td>
                      <td className="px-3 py-2.5">{!!c.opt_out_status && <Badge tone="red">{ar ? "ملغى" : "Opt-out"}</Badge>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="divide-y divide-ink-100 lg:hidden">
              {data.rows.map((c) => (
                <div key={String(c.id)} className="p-3" onClick={() => router.push(`/dashboard/customers?c=${c.id}`)}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-[13.5px] font-semibold text-ink-900">{String(c.full_name || "—")}</p>
                      <p className="text-[12px] text-ink-500" dir="ltr">{String(c.normalized_phone)}</p>
                    </div>
                    <WaAvailabilityBadge status={String(c.whatsapp_status)} />
                  </div>
                  <div className="mt-2 flex items-center gap-3 text-[12px] text-ink-500">
                    <span>{c.total_orders} {ar ? "طلب" : "cmd"}</span>
                    <span className="text-emerald-600">{c.delivered_orders} {ar ? "مسلمة" : "livrées"}</span>
                    <span className="ms-auto font-medium text-ink-800">{f.money(Number(c.total_cod_value))}</span>
                  </div>
                  <div className="mt-2 flex gap-2" onClick={(e) => e.stopPropagation()}>
                    <CallButton phone={c.normalized_phone as string} size="md" />
                    <WhatsappLinkButton phone={c.normalized_phone as string} size="md" />
                  </div>
                </div>
              ))}
            </div>
            <Pagination page={data.page} pages={data.pages} total={data.total} pageSize={data.pageSize} onPage={setPage} />
          </>
        )}
      </Card>

      {open && <CustomerDrawer id={open} onClose={() => router.push("/dashboard/customers")} onChanged={() => mutate()} />}
    </div>
  );
}

function CustomerDrawer({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const { locale } = useDashLocale();
  const f = useFormat();
  const ar = locale === "ar";
  const { push } = useToast();
  const { data, isLoading, mutate } = useSWR<{ customer: Row; orders: Row[]; messages: Row[]; consents: Row[] }>(`/api/customers/${id}`, fetcher);
  const [tab, setTab] = React.useState("profile");
  const [notes, setNotes] = React.useState("");
  const [busy, setBusy] = React.useState<string | null>(null);
  const c = data?.customer;

  React.useEffect(() => {
    if (c?.notes) setNotes(String(c.notes));
  }, [c?.notes]);

  async function act(body: Record<string, unknown>, key: string) {
    setBusy(key);
    try {
      const res = await fetch(`/api/customers/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erreur");
      if (body.action === "recheck_wa") {
        push({
          variant: json.status === "unknown" ? "info" : "success",
          title: ar ? "نتيجة التحقق" : "Résultat de la vérification",
          description: json.detail ?? json.status,
        });
      } else push({ variant: "success", title: ar ? "تم الحفظ" : "Enregistré" });
      mutate();
      onChanged();
    } catch (e) {
      push({ variant: "error", title: (e as Error).message });
    } finally {
      setBusy(null);
    }
  }

  return (
    <Drawer open onClose={onClose} title={c ? String(c.full_name || c.normalized_phone) : "…"} subtitle={c ? String(c.normalized_phone) : undefined} width="max-w-2xl">
      {isLoading || !c ? (
        <div className="space-y-3 p-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 border-b border-ink-100 px-4 py-3">
            <WaAvailabilityBadge status={String(c.whatsapp_status)} />
            {!!c.opt_out_status ? <Badge tone="red">{ar ? "ألغى الاشتراك" : "Désinscrit"}</Badge> : <Badge tone="green">{ar ? "يستقبل الرسائل" : "Reçoit les messages"}</Badge>}
            <div className="ms-auto flex gap-1.5">
              <CallButton phone={c.normalized_phone as string} size="md" />
              <WhatsappLinkButton phone={c.normalized_phone as string} size="md" />
            </div>
          </div>
          <Tabs
            className="px-4"
            value={tab}
            onChange={setTab}
            tabs={[
              { id: "profile", label: ar ? "الملف" : "Profil" },
              { id: "orders", label: ar ? "الطلبات" : "Commandes", count: data.orders.length },
              { id: "messages", label: "WhatsApp", count: data.messages.length },
            ]}
          />
          <div className="space-y-3 p-4">
            {tab === "profile" && (
              <>
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                  {[
                    { l: ar ? "الطلبات" : "Commandes", v: c.total_orders },
                    { l: ar ? "مسلمة" : "Livrées", v: c.delivered_orders },
                    { l: ar ? "ملغاة" : "Annulées", v: c.cancelled_orders },
                    { l: ar ? "مرتجعة" : "Retournées", v: c.returned_orders },
                  ].map((k) => (
                    <div key={k.l} className="rounded-xl border border-ink-200 p-3">
                      <p className="text-[11.5px] text-ink-400">{k.l}</p>
                      <p className="mt-0.5 text-lg font-semibold text-ink-900 tabular">{String(k.v ?? 0)}</p>
                    </div>
                  ))}
                </div>
                <div className="rounded-xl border border-ink-200 p-3.5">
                  <div className="grid gap-2.5 sm:grid-cols-2">
                    <div><p className="text-[11.5px] text-ink-400">Wilaya</p><p className="text-[13px] font-medium">{c.wilaya ?? "—"}</p></div>
                    <div><p className="text-[11.5px] text-ink-400">{ar ? "البلدية" : "Commune"}</p><p className="text-[13px] font-medium">{c.commune ?? "—"}</p></div>
                    <div><p className="text-[11.5px] text-ink-400">{ar ? "قيمة COD" : "Valeur COD"}</p><p className="text-[13px] font-medium">{f.money(Number(c.total_cod_value))}</p></div>
                    <div><p className="text-[11.5px] text-ink-400">{ar ? "آخر تفاعل" : "Dernière interaction"}</p><p className="text-[13px] font-medium">{f.date(c.last_interaction_at as string)}</p></div>
                    <div><p className="text-[11.5px] text-ink-400">{ar ? "آخر تحقق واتساب" : "Dernière vérification WhatsApp"}</p><p className="text-[13px] font-medium">{f.dateTime(c.whatsapp_checked_at as string)}</p></div>
                    <div><p className="text-[11.5px] text-ink-400">{ar ? "مصدر التحقق" : "Source"}</p><p className="text-[13px] font-medium">{c.whatsapp_check_source ?? "—"}</p></div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button size="sm" loading={busy === "wa"} onClick={async () => await act({ action: "recheck_wa" }, "wa")}>
                      <RefreshCw className="h-3.5 w-3.5" /> {ar ? "إعادة التحقق من واتساب" : "Revérifier WhatsApp"}
                    </Button>
                    {c.opt_out_status ? (
                      <Button size="sm" loading={busy === "in"} onClick={async () => await act({ action: "opt_in" }, "in")}>
                        <CheckCircle2 className="h-3.5 w-3.5" /> {ar ? "إعادة الاشتراك" : "Réactiver"}
                      </Button>
                    ) : (
                      <Button size="sm" loading={busy === "out"} onClick={async () => await act({ action: "opt_out" }, "out")}>
                        <Ban className="h-3.5 w-3.5" /> {ar ? "إلغاء الاشتراك" : "Désinscrire"}
                      </Button>
                    )}
                  </div>
                </div>
                <div className="rounded-xl border border-ink-200 p-3.5">
                  <p className="mb-2 text-[12px] font-semibold uppercase text-ink-400">{ar ? "ملاحظات" : "Notes"}</p>
                  <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
                  <Button size="sm" className="mt-2" loading={busy === "note"} onClick={async () => await act({ action: "note", notes }, "note")}>
                    <StickyNote className="h-3.5 w-3.5" /> {ar ? "حفظ" : "Enregistrer"}
                  </Button>
                </div>
              </>
            )}
            {tab === "orders" && (
              <div className="divide-y divide-ink-100">
                {!data.orders.length && <EmptyState icon={Users} title={ar ? "لا توجد طلبات" : "Aucune commande"} />}
                {data.orders.map((o) => (
                  <div key={String(o.id)} className="flex items-center justify-between gap-3 py-2.5">
                    <div>
                      <p className="text-[13px] font-medium text-ink-800">{String(o.reference)}</p>
                      <p className="text-[11.5px] text-ink-400">{f.date(o.created_at as string)}</p>
                    </div>
                    <span className="text-[12.5px] tabular">{f.money(Number(o.total))}</span>
                    <OrderStatusBadge status={String(o.status)} />
                  </div>
                ))}
              </div>
            )}
            {tab === "messages" && (
              <div className="space-y-2">
                {!data.messages.length && <EmptyState icon={Users} title={ar ? "لا توجد رسائل" : "Aucun message"} />}
                {data.messages.map((m) => (
                  <div key={String(m.id)} className={`max-w-[85%] rounded-xl px-3 py-2 ${m.direction === "outbound" ? "ms-auto bg-brand-50" : "bg-ink-100"}`}>
                    <p className="text-[13px] text-ink-800">{m.body}</p>
                    <p className="mt-1 text-[10.5px] text-ink-400">{f.dateTime(m.created_at as string)} · {m.status}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </Drawer>
  );
}
