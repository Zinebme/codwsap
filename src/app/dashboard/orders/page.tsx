"use client";

import * as React from "react";
import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import useSWR from "swr";
import {
  Filter, Download, Plus, MoreHorizontal, Truck, CheckCircle2, XCircle, Clock, UserPlus,
  Package, RefreshCw, X, Beaker,
} from "lucide-react";
import { fetcher } from "@/components/dashboard/shell";
import { useDashLocale, useFormat } from "@/components/dashboard/locale";
import { PageHeader, OrderStatusBadge, DeliveryStatusBadge, WaAvailabilityBadge, MessageStatusBadge, PhoneCell, CallButton, WhatsappLinkButton, ErrorState } from "@/components/dashboard/common";
import {
  Card, Button, Input, Select, SearchInput, Badge, Pagination, TableSkeleton, EmptyState, Dropdown,
  DropdownItem, DropdownSeparator, Modal, Field, Textarea, useToast, cn,
} from "@/components/ui";
import { ORDER_STATUSES, ORDER_STATUS_META, WILAYAS } from "@/lib/domain";
import { OrderDrawer } from "./drawer";

type OrderRow = Record<string, string | number | null>;
type Result = { rows: OrderRow[]; total: number; page: number; pageSize: number; pages: number };

export default function OrdersPage() {
  return (
    <Suspense fallback={<TableSkeleton />}>
      <OrdersInner />
    </Suspense>
  );
}

function OrdersInner() {
  const { t, locale } = useDashLocale();
  const f = useFormat();
  const ar = locale === "ar";
  const router = useRouter();
  const sp = useSearchParams();
  const { push } = useToast();

  const [q, setQ] = React.useState(sp.get("q") ?? "");
  const [debouncedQ, setDebouncedQ] = React.useState(q);
  const [status, setStatus] = React.useState<string[]>(sp.get("status")?.split(",").filter(Boolean) ?? []);
  const [wa, setWa] = React.useState(sp.get("wa") ?? "");
  const [provider, setProvider] = React.useState("");
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const [attention, setAttention] = React.useState(sp.get("attention") === "1");
  const [includeTest, setIncludeTest] = React.useState(false);
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(25);
  const [sort, setSort] = React.useState("created_at");
  const [dir, setDir] = React.useState<"asc" | "desc">("desc");
  const [selected, setSelected] = React.useState<string[]>([]);
  const [showFilters, setShowFilters] = React.useState(false);
  const [newOpen, setNewOpen] = React.useState(sp.get("new") === "1");
  const openOrder = sp.get("order");

  React.useEffect(() => {
    const id = setTimeout(() => {
      setDebouncedQ(q);
      setPage(1);
    }, 250);
    return () => clearTimeout(id);
  }, [q]);

  const params = new URLSearchParams();
  if (debouncedQ) params.set("q", debouncedQ);
  if (status.length) params.set("status", status.join(","));
  if (wa) params.set("wa", wa);
  if (provider) params.set("provider", provider);
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  if (attention) params.set("attention", "1");
  if (includeTest) params.set("test", "1");
  params.set("page", String(page));
  params.set("pageSize", String(pageSize));
  params.set("sort", sort);
  params.set("dir", dir);

  const { data, error, isLoading, mutate } = useSWR<Result>(`/api/orders?${params.toString()}`, fetcher, { keepPreviousData: true, refreshInterval: 45_000 });

  const allSelected = !!data?.rows.length && selected.length === data.rows.length;

  async function bulk(action: string, extra: Record<string, unknown> = {}) {
    const res = await fetch("/api/orders/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: selected, action, ...extra }),
    });
    const json = await res.json();
    if (!res.ok) {
      push({ variant: "error", title: json.error ?? "Erreur" });
      return;
    }
    push({ variant: "success", title: `${json.updated} ${ar ? "طلبا تم تحديثه" : "commande(s) mise(s) à jour"}` });
    setSelected([]);
    mutate();
  }

  return (
    <div className="space-y-3">
      <PageHeader
        title={t("d.orders")}
        subtitle={data ? `${f.num(data.total)} ${ar ? "طلب" : "commandes"}` : undefined}
        actions={
          <>
            <Button size="sm" onClick={() => setShowFilters((v) => !v)}>
              <Filter className="h-3.5 w-3.5" /> {ar ? "فلاتر" : "Filtres"}
              {(status.length > 0 || wa || from || attention) && <span className="ms-1 h-1.5 w-1.5 rounded-full bg-brand-500" />}
            </Button>
            <a href={`/api/orders/export?${params.toString()}`}>
              <Button size="sm">
                <Download className="h-3.5 w-3.5" /> {ar ? "تصدير" : "Export"}
              </Button>
            </a>
            <Button size="sm" variant="primary" onClick={() => setNewOpen(true)}>
              <Plus className="h-3.5 w-3.5" /> {ar ? "طلب" : "Commande"}
            </Button>
          </>
        }
      />

      <Card className="p-3">
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
          <SearchInput className="flex-1" value={q} onChange={(e) => setQ(e.target.value)} placeholder={ar ? "بحث برقم الطلب، الاسم، الهاتف، التتبع…" : "Référence, client, téléphone, suivi…"} />
          <div className="flex gap-2">
            <Select className="w-auto" value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="created_at">{ar ? "الأحدث" : "Date"}</option>
              <option value="total">{ar ? "المبلغ" : "Montant"}</option>
              <option value="reference">{ar ? "المرجع" : "Référence"}</option>
              <option value="wilaya">{ar ? "الولاية" : "Wilaya"}</option>
            </Select>
            <Button size="sm" onClick={() => setDir(dir === "desc" ? "asc" : "desc")}>
              {dir === "desc" ? "↓" : "↑"}
            </Button>
          </div>
        </div>

        {showFilters && (
          <div className="fade-in mt-3 space-y-3 border-t border-ink-100 pt-3">
            <div>
              <p className="mb-1.5 text-[11.5px] font-semibold uppercase tracking-wide text-ink-400">{ar ? "الحالة" : "Statut"}</p>
              <div className="flex flex-wrap gap-1.5">
                {ORDER_STATUSES.map((s) => {
                  const active = status.includes(s);
                  return (
                    <button
                      key={s}
                      onClick={() => {
                        setStatus(active ? status.filter((x) => x !== s) : [...status, s]);
                        setPage(1);
                      }}
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-[11.5px] font-medium transition-colors",
                        active ? "border-brand-300 bg-brand-50 text-brand-700" : "border-ink-200 text-ink-600 hover:bg-ink-50",
                      )}
                    >
                      {ar ? ORDER_STATUS_META[s].ar : ORDER_STATUS_META[s].fr}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-5">
              <Field label={ar ? "واتساب" : "WhatsApp"}>
                <Select value={wa} onChange={(e) => setWa(e.target.value)}>
                  <option value="">{ar ? "الكل" : "Tous"}</option>
                  {["none", "queued", "sent", "delivered", "read", "failed", "replied"].map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={ar ? "الناقل" : "Transporteur"}>
                <Select value={provider} onChange={(e) => setProvider(e.target.value)}>
                  <option value="">{ar ? "الكل" : "Tous"}</option>
                  {["ecotrack", "yalidine", "zrexpress", "navex", "sandbox"].map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={ar ? "من" : "Du"}>
                <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              </Field>
              <Field label={ar ? "إلى" : "Au"}>
                <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
              </Field>
              <div className="flex items-end gap-2">
                <Button size="sm" variant={attention ? "primary" : "secondary"} onClick={() => setAttention((v) => !v)}>
                  {ar ? "تتطلب انتباها" : "À traiter"}
                </Button>
                <Button size="sm" variant={includeTest ? "primary" : "secondary"} onClick={() => setIncludeTest((v) => !v)}>
                  <Beaker className="h-3.5 w-3.5" /> {ar ? "تجريبية" : "Test"}
                </Button>
              </div>
            </div>
            <button
              onClick={() => {
                setStatus([]);
                setWa("");
                setProvider("");
                setFrom("");
                setTo("");
                setAttention(false);
                setIncludeTest(false);
              }}
              className="text-[12.5px] text-brand-600 hover:underline"
            >
              {ar ? "إعادة تعيين الفلاتر" : "Réinitialiser les filtres"}
            </button>
          </div>
        )}
      </Card>

      {selected.length > 0 && (
        <Card className="fade-in flex flex-wrap items-center gap-2 border-brand-200 bg-brand-50/60 p-2.5">
          <span className="text-[12.5px] font-medium text-brand-800">
            {selected.length} {ar ? "محدد" : "sélectionnée(s)"}
          </span>
          <Button size="sm" onClick={async () => await bulk("set_status", { status: "confirmed" })}>
            <CheckCircle2 className="h-3.5 w-3.5" /> {ar ? "تأكيد" : "Confirmer"}
          </Button>
          <Button size="sm" onClick={async () => await bulk("set_status", { status: "cancelled_by_customer" })}>
            <XCircle className="h-3.5 w-3.5" /> {ar ? "إلغاء" : "Annuler"}
          </Button>
          <Button size="sm" onClick={async () => await bulk("send_to_delivery")}>
            <Truck className="h-3.5 w-3.5" /> {ar ? "إرسال للناقل" : "Envoyer au transporteur"}
          </Button>
          <button onClick={() => setSelected([])} className="ms-auto text-ink-500 hover:text-ink-700">
            <X className="h-4 w-4" />
          </button>
        </Card>
      )}

      {error ? (
        <ErrorState error={error.message} retry={() => mutate()} />
      ) : (
        <Card className="overflow-hidden">
          {isLoading && !data ? (
            <TableSkeleton rows={8} cols={7} />
          ) : !data?.rows.length ? (
            <EmptyState
              icon={Package}
              title={ar ? "لا توجد طلبات" : "Aucune commande"}
              description={ar ? "غيّر الفلاتر أو أنشئ طلبا جديدا." : "Modifiez vos filtres ou créez une nouvelle commande."}
              action={
                <Button variant="primary" size="sm" onClick={() => setNewOpen(true)}>
                  <Plus className="h-3.5 w-3.5" /> {ar ? "طلب جديد" : "Nouvelle commande"}
                </Button>
              }
            />
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden overflow-x-auto lg:block">
                <table className="w-full min-w-[1100px] text-start">
                  <thead>
                    <tr className="border-b border-ink-200 bg-ink-50/60 text-[11.5px] uppercase tracking-wide text-ink-500">
                      <th className="w-9 px-3 py-2">
                        <input
                          type="checkbox"
                          checked={allSelected}
                          onChange={(e) => setSelected(e.target.checked ? data.rows.map((r) => String(r.id)) : [])}
                          className="h-3.5 w-3.5 rounded border-ink-300"
                        />
                      </th>
                      {[
                        ar ? "المرجع" : "Réf.",
                        ar ? "التاريخ" : "Date",
                        ar ? "الزبون" : "Client",
                        ar ? "واتساب" : "WA",
                        ar ? "الولاية" : "Wilaya",
                        ar ? "الكمية" : "Qté",
                        ar ? "المجموع" : "Total",
                        ar ? "الناقل" : "Transporteur",
                        ar ? "الحالة" : "Statut",
                        ar ? "التوصيل" : "Livraison",
                        ar ? "الرسالة" : "Message",
                        "",
                      ].map((h, i) => (
                        <th key={i} className="whitespace-nowrap px-3 py-2 text-start font-medium">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-100">
                    {data.rows.map((o) => (
                      <tr
                        key={String(o.id)}
                        className={cn("cursor-pointer text-[13px] transition-colors hover:bg-ink-50/70", o.attention ? "bg-amber-50/40" : "")}
                        onClick={() => router.push(`/dashboard/orders?order=${o.id}`)}
                      >
                        <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selected.includes(String(o.id))}
                            onChange={(e) => setSelected(e.target.checked ? [...selected, String(o.id)] : selected.filter((x) => x !== String(o.id)))}
                            className="h-3.5 w-3.5 rounded border-ink-300"
                          />
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 font-medium text-ink-800">
                          {String(o.reference)}
                          {!!o.is_test && (
                            <Badge tone="gray" className="ms-1.5">
                              test
                            </Badge>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-ink-500">{f.date(String(o.created_at))}</td>
                        <td className="px-3 py-2.5">
                          <p className="max-w-40 truncate text-ink-800">{String(o.customer_name ?? "—")}</p>
                          <PhoneCell phone={o.normalized_phone as string} original={o.original_phone as string} />
                        </td>
                        <td className="px-3 py-2.5">
                          <WaAvailabilityBadge status={String(o.customer_wa_status ?? "unknown")} />
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-ink-600">
                          {o.wilaya ?? "—"}
                          <span className="block text-[11px] text-ink-400">{o.commune ?? ""}</span>
                        </td>
                        <td className="px-3 py-2.5 text-ink-600 tabular">{o.quantity}</td>
                        <td className="whitespace-nowrap px-3 py-2.5 font-medium text-ink-800 tabular">{f.money(Number(o.total))}</td>
                        <td className="px-3 py-2.5 text-ink-600">
                          {o.delivery_provider ?? "—"}
                          {o.tracking_number && <span className="block text-[11px] text-ink-400" dir="ltr">{String(o.tracking_number)}</span>}
                        </td>
                        <td className="px-3 py-2.5">
                          <OrderStatusBadge status={String(o.status)} />
                        </td>
                        <td className="px-3 py-2.5">
                          <DeliveryStatusBadge status={String(o.delivery_status)} />
                        </td>
                        <td className="px-3 py-2.5">
                          <MessageStatusBadge status={String(o.whatsapp_status)} />
                        </td>
                        <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                          <RowActions id={String(o.id)} phone={o.normalized_phone as string} onDone={() => mutate()} ar={ar} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="divide-y divide-ink-100 lg:hidden">
                {data.rows.map((o) => (
                  <div key={String(o.id)} className="p-3" onClick={() => router.push(`/dashboard/orders?order=${o.id}`)}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-[13.5px] font-semibold text-ink-900">{String(o.reference)}</p>
                        <p className="truncate text-[12.5px] text-ink-600">{String(o.customer_name ?? "—")}</p>
                      </div>
                      <OrderStatusBadge status={String(o.status)} />
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ink-500">
                      <span>{o.wilaya ?? "—"}</span>
                      <span className="font-medium text-ink-800 tabular">{f.money(Number(o.total))}</span>
                      <span>{f.date(String(o.created_at))}</span>
                    </div>
                    <div className="mt-2.5 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      <CallButton phone={o.normalized_phone as string} size="md" />
                      <WhatsappLinkButton phone={o.normalized_phone as string} size="md" />
                      <div className="ms-auto flex items-center gap-1.5">
                        <DeliveryStatusBadge status={String(o.delivery_status)} />
                        <RowActions id={String(o.id)} phone={o.normalized_phone as string} onDone={() => mutate()} ar={ar} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <Pagination page={data.page} pages={data.pages} total={data.total} pageSize={data.pageSize} onPage={setPage} onPageSize={(n) => { setPageSize(n); setPage(1); }} />
            </>
          )}
        </Card>
      )}

      {openOrder && <OrderDrawer id={openOrder} onClose={() => router.push("/dashboard/orders")} onChanged={() => mutate()} />}
      <NewOrderModal open={newOpen} onClose={() => setNewOpen(false)} onCreated={() => mutate()} ar={ar} />
    </div>
  );
}

function RowActions({ id, phone, onDone, ar }: { id: string; phone?: string | null; onDone: () => void; ar: boolean }) {
  const { push } = useToast();
  async function act(body: Record<string, unknown>, okMsg: string) {
    const res = await fetch(`/api/orders/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = await res.json();
    if (!res.ok) return push({ variant: "error", title: json.error ?? "Erreur" });
    push({ variant: "success", title: okMsg });
    onDone();
  }
  return (
    <Dropdown
      trigger={
        <button className="rounded-lg border border-ink-200 p-1.5 text-ink-500 hover:bg-ink-50">
          <MoreHorizontal className="h-3.5 w-3.5" />
        </button>
      }
    >
      <DropdownItem icon={CheckCircle2} onClick={async () => await act({ action: "set_status", status: "confirmed" }, ar ? "تم التأكيد" : "Commande confirmée")}>
        {ar ? "تأكيد" : "Confirmer"}
      </DropdownItem>
      <DropdownItem icon={Clock} onClick={async () => await act({ action: "set_status", status: "postponed" }, ar ? "تم التأجيل" : "Commande reportée")}>
        {ar ? "تأجيل" : "Reporter"}
      </DropdownItem>
      <DropdownItem icon={XCircle} danger onClick={async () => await act({ action: "set_status", status: "cancelled_by_customer" }, ar ? "تم الإلغاء" : "Commande annulée")}>
        {ar ? "إلغاء" : "Annuler"}
      </DropdownItem>
      <DropdownSeparator />
      <DropdownItem icon={Truck} onClick={async () => await act({ action: "send_to_delivery" }, ar ? "أرسلت للناقل" : "Envoyée au transporteur")}>
        {ar ? "إرسال للناقل" : "Envoyer au transporteur"}
      </DropdownItem>
      <DropdownItem icon={RefreshCw} onClick={async () => await act({ action: "refresh_tracking" }, ar ? "تم تحديث التتبع" : "Suivi actualisé")}>
        {ar ? "تحديث التتبع" : "Actualiser le suivi"}
      </DropdownItem>
      {phone && (
        <>
          <DropdownSeparator />
          <a href={`tel:${phone}`}>
            <DropdownItem icon={UserPlus}>{ar ? "اتصال" : "Appeler"}</DropdownItem>
          </a>
        </>
      )}
    </Dropdown>
  );
}

function NewOrderModal({ open, onClose, onCreated, ar }: { open: boolean; onClose: () => void; onCreated: () => void; ar: boolean }) {
  const { push } = useToast();
  const [loading, setLoading] = React.useState(false);
  const [items, setItems] = React.useState([{ product_name: "", variant: "", quantity: 1, unit_price: 0 }]);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setLoading(true);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName: fd.get("customerName"),
          phone: fd.get("phone"),
          wilaya: fd.get("wilaya"),
          commune: fd.get("commune"),
          address: fd.get("address"),
          deliveryType: fd.get("deliveryType"),
          deliveryPrice: Number(fd.get("deliveryPrice") ?? 0),
          notes: fd.get("notes"),
          isTest: fd.get("isTest") === "on",
          items: items.filter((i) => i.product_name).map((i) => ({ ...i, variant: i.variant || null, quantity: Number(i.quantity), unit_price: Number(i.unit_price) })),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erreur");
      push({ variant: "success", title: ar ? "تم إنشاء الطلب" : "Commande créée", description: json.reference });
      onCreated();
      onClose();
      setItems([{ product_name: "", variant: "", quantity: 1, unit_price: 0 }]);
    } catch (err) {
      push({ variant: "error", title: (err as Error).message });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={ar ? "طلب جديد" : "Nouvelle commande"}
      width="max-w-2xl"
      footer={
        <>
          <Button onClick={onClose}>{ar ? "إلغاء" : "Annuler"}</Button>
          <Button variant="primary" form="new-order" type="submit" loading={loading}>
            {ar ? "إنشاء" : "Créer"}
          </Button>
        </>
      }
    >
      <form id="new-order" onSubmit={submit} className="space-y-3.5">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={ar ? "اسم الزبون" : "Nom du client"}>
            <Input name="customerName" required minLength={2} />
          </Field>
          <Field label={ar ? "الهاتف" : "Téléphone"}>
            <Input name="phone" required dir="ltr" placeholder="0550 12 34 56" />
          </Field>
          <Field label={ar ? "الولاية" : "Wilaya"}>
            <Select name="wilaya" defaultValue="Alger">
              {WILAYAS.map((w) => (
                <option key={w} value={w}>
                  {w}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={ar ? "البلدية" : "Commune"}>
            <Input name="commune" />
          </Field>
          <Field label={ar ? "نوع التوصيل" : "Type de livraison"}>
            <Select name="deliveryType" defaultValue="home">
              <option value="home">{ar ? "للمنزل" : "À domicile"}</option>
              <option value="office">{ar ? "مكتب الاستلام" : "Bureau (stop desk)"}</option>
            </Select>
          </Field>
          <Field label={ar ? "سعر التوصيل" : "Frais de livraison"}>
            <Input name="deliveryPrice" type="number" min={0} defaultValue={500} />
          </Field>
        </div>
        <Field label={ar ? "العنوان" : "Adresse"}>
          <Input name="address" />
        </Field>

        <div>
          <p className="label">{ar ? "المنتجات" : "Produits"}</p>
          <div className="space-y-2">
            {items.map((it, idx) => (
              <div key={idx} className="grid grid-cols-2 gap-2 sm:grid-cols-[2fr_1fr_70px_100px_auto]">
                <Input placeholder={ar ? "المنتج" : "Produit"} value={it.product_name} onChange={(e) => setItems(items.map((x, i) => (i === idx ? { ...x, product_name: e.target.value } : x)))} />
                <Input placeholder={ar ? "المتغير" : "Variante"} value={it.variant} onChange={(e) => setItems(items.map((x, i) => (i === idx ? { ...x, variant: e.target.value } : x)))} />
                <Input type="number" min={1} value={it.quantity} onChange={(e) => setItems(items.map((x, i) => (i === idx ? { ...x, quantity: Number(e.target.value) } : x)))} />
                <Input type="number" min={0} placeholder="DA" value={it.unit_price} onChange={(e) => setItems(items.map((x, i) => (i === idx ? { ...x, unit_price: Number(e.target.value) } : x)))} />
                {items.length > 1 && (
                  <Button type="button" size="icon" onClick={() => setItems(items.filter((_, i) => i !== idx))}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            ))}
          </div>
          <Button type="button" size="sm" className="mt-2" onClick={() => setItems([...items, { product_name: "", variant: "", quantity: 1, unit_price: 0 }])}>
            <Plus className="h-3.5 w-3.5" /> {ar ? "إضافة منتج" : "Ajouter un produit"}
          </Button>
        </div>

        <Field label={ar ? "ملاحظة" : "Note interne"}>
          <Textarea name="notes" rows={2} />
        </Field>
        <label className="flex items-center gap-2 text-[13px] text-ink-600">
          <input type="checkbox" name="isTest" className="h-3.5 w-3.5 rounded border-ink-300" />
          {ar ? "وضع علامة كطلب تجريبي" : "Marquer comme commande de test"}
        </label>
      </form>
    </Modal>
  );
}
