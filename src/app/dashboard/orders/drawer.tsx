"use client";

import * as React from "react";
import useSWR from "swr";
import {
  Phone, MessageCircle, CheckCircle2, XCircle, Clock, StickyNote, UserPlus, Truck, RefreshCw,
  Copy, Send, AlertTriangle, Package, Zap, History,
} from "lucide-react";
import { fetcher } from "@/components/dashboard/shell";
import { useDashLocale, useFormat } from "@/components/dashboard/locale";
import { OrderStatusBadge, DeliveryStatusBadge, WaAvailabilityBadge, MessageStatusBadge } from "@/components/dashboard/common";
import { Drawer, Button, Badge, Tabs, Skeleton, Textarea, Select, useToast, cn, EmptyState } from "@/components/ui";
import { displayDzPhone, telHref, waHref } from "@/lib/phone";
import { ORDER_STATUSES, ORDER_STATUS_META } from "@/lib/domain";
import { SUPPRESSION_LABELS_CLIENT } from "./labels";

type Detail = {
  order: Record<string, string | number | null>;
  items: Record<string, string | number | null>[];
  events: Record<string, string | null>[];
  messages: Record<string, string | null>[];
  shipment: Record<string, string | null> | null;
  deliveryEvents: Record<string, string | null>[];
  automationRuns: Record<string, string | null>[];
};

export function OrderDrawer({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const { locale } = useDashLocale();
  const f = useFormat();
  const ar = locale === "ar";
  const { push } = useToast();
  const { data, isLoading, mutate } = useSWR<Detail>(`/api/orders/${id}`, fetcher);
  const { data: templates } = useSWR<{ rows: Record<string, string>[] }>("/api/whatsapp/templates", fetcher);
  const [tab, setTab] = React.useState("details");
  const [busy, setBusy] = React.useState<string | null>(null);
  const [note, setNote] = React.useState("");
  const [msg, setMsg] = React.useState("");
  const [templateId, setTemplateId] = React.useState("");

  const o = data?.order;

  async function act(body: Record<string, unknown>, okMsg: string, key: string) {
    setBusy(key);
    try {
      const res = await fetch(`/api/orders/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erreur");
      if (json.status === "suppressed") {
        push({
          variant: "info",
          title: ar ? "تم منع الرسالة" : "Message bloqué par les règles qualité",
          description: SUPPRESSION_LABELS_CLIENT[json.reason as string] ?? json.reason,
        });
      } else {
        push({ variant: "success", title: okMsg });
      }
      mutate();
      onChanged();
    } catch (e) {
      push({ variant: "error", title: (e as Error).message });
    } finally {
      setBusy(null);
    }
  }

  return (
    <Drawer
      open
      onClose={onClose}
      title={o ? `${o.reference}` : ar ? "تحميل…" : "Chargement…"}
      subtitle={o ? `${o.customer_name ?? "—"} · ${f.dateTime(String(o.created_at))}` : undefined}
      footer={
        o ? (
          <div className="flex flex-wrap gap-2">
            <a href={telHref(String(o.normalized_phone))}>
              <Button size="sm" variant="success">
                <Phone className="h-3.5 w-3.5" /> {ar ? "اتصال" : "Appeler"}
              </Button>
            </a>
            <a href={waHref(String(o.normalized_phone))} target="_blank" rel="noopener noreferrer">
              <Button size="sm">
                <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
              </Button>
            </a>
            <Button size="sm" loading={busy === "confirm"} onClick={() => act({ action: "set_status", status: "confirmed" }, ar ? "تم التأكيد" : "Commande confirmée", "confirm")}>
              <CheckCircle2 className="h-3.5 w-3.5" /> {ar ? "تأكيد" : "Confirmer"}
            </Button>
            <Button size="sm" loading={busy === "delivery"} onClick={() => act({ action: "send_to_delivery" }, ar ? "أرسلت للناقل" : "Envoyée au transporteur", "delivery")}>
              <Truck className="h-3.5 w-3.5" /> {ar ? "إرسال" : "Expédier"}
            </Button>
            <Button size="sm" variant="ghost" className="text-red-600 hover:bg-red-50" loading={busy === "cancel"} onClick={() => act({ action: "set_status", status: "cancelled_by_customer" }, ar ? "تم الإلغاء" : "Commande annulée", "cancel")}>
              <XCircle className="h-3.5 w-3.5" /> {ar ? "إلغاء" : "Annuler"}
            </Button>
          </div>
        ) : null
      }
    >
      {isLoading || !data || !o ? (
        <div className="space-y-3 p-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-12" />
          ))}
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 border-b border-ink-100 px-4 py-3">
            <OrderStatusBadge status={String(o.status)} />
            <DeliveryStatusBadge status={String(o.delivery_status)} />
            <MessageStatusBadge status={String(o.whatsapp_status)} />
            <WaAvailabilityBadge status={String(o.customer_wa_status ?? "unknown")} />
            {!!o.is_test && <Badge tone="gray">test</Badge>}
            {!!o.opt_out_status && <Badge tone="red">{ar ? "ألغى الاشتراك" : "Désinscrit"}</Badge>}
            <div className="ms-auto">
              <Select
                className="h-8 w-auto py-0 text-[12.5px]"
                value={String(o.status)}
                onChange={(e) => act({ action: "set_status", status: e.target.value }, ar ? "تم تحديث الحالة" : "Statut mis à jour", "status")}
              >
                {ORDER_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {ar ? ORDER_STATUS_META[s].ar : ORDER_STATUS_META[s].fr}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <Tabs
            className="px-4"
            value={tab}
            onChange={setTab}
            tabs={[
              { id: "details", label: ar ? "التفاصيل" : "Détails" },
              { id: "messages", label: "WhatsApp", count: data.messages.length },
              { id: "delivery", label: ar ? "التوصيل" : "Livraison", count: data.deliveryEvents.length },
              { id: "timeline", label: ar ? "السجل" : "Historique", count: data.events.length },
              { id: "automation", label: ar ? "الأتمتة" : "Automatisations", count: data.automationRuns.length },
            ]}
          />

          <div className="p-4">
            {tab === "details" && (
              <div className="space-y-3">
                <Section title={ar ? "الزبون" : "Client"}>
                  <div className="grid gap-2.5 sm:grid-cols-2">
                    <Info label={ar ? "الاسم" : "Nom"} value={String(o.customer_name ?? "—")} />
                    <div>
                      <p className="text-[11.5px] text-ink-400">{ar ? "الهاتف" : "Téléphone"}</p>
                      <div className="mt-0.5 flex items-center gap-2">
                        <span className="text-[13px] font-medium text-ink-800 tabular" dir="ltr">
                          {displayDzPhone(String(o.normalized_phone))}
                        </span>
                        <a href={telHref(String(o.normalized_phone))} className="grid h-6 w-6 place-items-center rounded-md border border-emerald-200 bg-emerald-50 text-emerald-700">
                          <Phone className="h-3 w-3" />
                        </a>
                      </div>
                      <p className="mt-0.5 text-[11px] text-ink-400" dir="ltr">
                        {ar ? "الأصلي" : "Original"} : {String(o.original_phone ?? "—")}
                      </p>
                    </div>
                    <Info label={ar ? "الطلبات" : "Commandes"} value={`${o.customer_total_orders ?? 0} · ${o.customer_delivered_orders ?? 0} ${ar ? "مسلمة" : "livrées"}`} />
                    <Info label={ar ? "الوكيل" : "Agent assigné"} value={String(o.assigned_name ?? "—")} />
                  </div>
                </Section>

                <Section title={ar ? "التوصيل" : "Livraison"}>
                  <div className="grid gap-2.5 sm:grid-cols-2">
                    <Info label="Wilaya" value={String(o.wilaya ?? "—")} />
                    <Info label={ar ? "البلدية" : "Commune"} value={String(o.commune ?? "—")} />
                    <Info label={ar ? "العنوان" : "Adresse"} value={String(o.address ?? "—")} />
                    <Info label={ar ? "النوع" : "Type"} value={o.delivery_type === "office" ? (ar ? "مكتب" : "Bureau") : ar ? "منزل" : "Domicile"} />
                    <Info label={ar ? "الناقل" : "Transporteur"} value={String(o.delivery_provider ?? "—")} />
                    <div>
                      <p className="text-[11.5px] text-ink-400">{ar ? "رقم التتبع" : "N° de suivi"}</p>
                      <div className="mt-0.5 flex items-center gap-1.5">
                        <span className="text-[13px] font-medium text-ink-800" dir="ltr">
                          {String(o.tracking_number ?? "—")}
                        </span>
                        {o.tracking_number && (
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(String(o.tracking_number));
                              push({ variant: "success", title: ar ? "تم النسخ" : "Copié" });
                            }}
                            className="text-ink-400 hover:text-ink-700"
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <Button size="sm" loading={busy === "refresh"} onClick={() => act({ action: "refresh_tracking" }, ar ? "تم التحديث" : "Suivi actualisé", "refresh")}>
                      <RefreshCw className="h-3.5 w-3.5" /> {ar ? "تحديث التتبع" : "Actualiser le suivi"}
                    </Button>
                  </div>
                </Section>

                <Section title={ar ? "المنتجات" : "Produits"}>
                  {!data.items.length ? (
                    <p className="text-[13px] text-ink-400">—</p>
                  ) : (
                    <div className="divide-y divide-ink-100">
                      {data.items.map((it) => (
                        <div key={String(it.id)} className="flex items-center justify-between gap-3 py-2 text-[13px]">
                          <div>
                            <p className="font-medium text-ink-800">{String(it.product_name)}</p>
                            {it.variant && <p className="text-[11.5px] text-ink-400">{String(it.variant)}</p>}
                          </div>
                          <span className="text-ink-500 tabular">
                            {it.quantity} × {f.money(Number(it.unit_price))}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="mt-3 space-y-1 border-t border-ink-100 pt-2.5 text-[13px]">
                    <Row label={ar ? "المنتجات" : "Produits"} value={f.money(Number(o.products_price))} />
                    <Row label={ar ? "التوصيل" : "Livraison"} value={f.money(Number(o.delivery_price))} />
                    <Row label={ar ? "المجموع" : "Total COD"} value={f.money(Number(o.total))} strong />
                  </div>
                </Section>

                <Section title={ar ? "ملاحظات وإجراءات" : "Notes et actions"}>
                  <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder={String(o.notes ?? (ar ? "أضف ملاحظة داخلية…" : "Ajouter une note interne…"))} />
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button size="sm" disabled={!note.trim()} loading={busy === "note"} onClick={() => act({ action: "note", note }, ar ? "تمت إضافة الملاحظة" : "Note ajoutée", "note").then(() => setNote(""))}>
                      <StickyNote className="h-3.5 w-3.5" /> {ar ? "حفظ الملاحظة" : "Enregistrer la note"}
                    </Button>
                    <Button size="sm" loading={busy === "postpone"} onClick={() => act({ action: "postpone", until: new Date(Date.now() + 864e5).toISOString().slice(0, 10) }, ar ? "تم التأجيل" : "Commande reportée", "postpone")}>
                      <Clock className="h-3.5 w-3.5" /> {ar ? "تأجيل ليوم" : "Reporter à demain"}
                    </Button>
                    <AssignControl orderId={id} onDone={() => { mutate(); onChanged(); }} ar={ar} />
                  </div>
                </Section>
              </div>
            )}

            {tab === "messages" && (
              <div className="space-y-3">
                <div className="space-y-2">
                  {!data.messages.length && <EmptyState icon={MessageCircle} title={ar ? "لا توجد رسائل" : "Aucun message"} />}
                  {data.messages.map((m) => (
                    <div key={String(m.id)} className={cn("max-w-[85%] rounded-xl px-3 py-2", m.direction === "outbound" ? "ms-auto bg-brand-50" : "bg-ink-100")}>
                      <p className="whitespace-pre-wrap text-[13px] text-ink-800">{m.body}</p>
                      <div className="mt-1 flex items-center gap-2">
                        <span className="text-[10.5px] text-ink-400">{f.dateTime(m.created_at)}</span>
                        {m.template_name && <Badge tone="gray">{m.template_name}</Badge>}
                        <MessageStatusBadge status={String(m.status)} />
                        {m.status === "failed" && (
                          <button className="text-[11px] text-brand-600 underline" onClick={() => act({ action: "resend_message", messageId: m.id }, ar ? "أعيد الإرسال" : "Message renvoyé", "resend")}>
                            {ar ? "إعادة الإرسال" : "Renvoyer"}
                          </button>
                        )}
                      </div>
                      {m.error_message && <p className="mt-1 text-[11px] text-red-600">{m.error_message}</p>}
                    </div>
                  ))}
                </div>
                <div className="rounded-xl border border-ink-200 p-3">
                  <p className="mb-2 text-[12px] font-semibold text-ink-700">{ar ? "إرسال رسالة" : "Envoyer un message"}</p>
                  <Select className="mb-2" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
                    <option value="">{ar ? "رسالة نصية (نافذة 24 ساعة)" : "Message libre (fenêtre 24 h)"}</option>
                    {templates?.rows.filter((t) => t.status === "approved").map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </Select>
                  {!templateId && <Textarea rows={2} value={msg} onChange={(e) => setMsg(e.target.value)} placeholder={ar ? "اكتب رسالتك…" : "Votre message…"} />}
                  <Button
                    size="sm"
                    variant="primary"
                    className="mt-2"
                    loading={busy === "send"}
                    disabled={!templateId && !msg.trim()}
                    onClick={() => act({ action: "send_message", templateId: templateId || undefined, text: templateId ? undefined : msg }, ar ? "تم الإرسال" : "Message envoyé", "send").then(() => setMsg(""))}
                  >
                    <Send className="h-3.5 w-3.5" /> {ar ? "إرسال" : "Envoyer"}
                  </Button>
                </div>
              </div>
            )}

            {tab === "delivery" && (
              <Timeline
                items={data.deliveryEvents.map((e) => ({
                  id: String(e.id),
                  title: String(e.raw_status ?? e.normalized_status),
                  desc: `${ar ? "موحد" : "Normalisé"} : ${e.normalized_status}`,
                  at: e.occurred_at,
                  icon: Truck,
                }))}
                emptyIcon={Package}
                emptyText={ar ? "لا توجد أحداث توصيل" : "Aucun évènement de livraison"}
                f={f}
              />
            )}

            {tab === "timeline" && (
              <Timeline
                items={data.events.map((e) => ({
                  id: String(e.id),
                  title: String(e.title),
                  desc: [e.description, e.actor_label].filter(Boolean).join(" · "),
                  at: e.created_at,
                  icon: e.type === "error" ? AlertTriangle : e.type === "automation" ? Zap : History,
                }))}
                emptyIcon={History}
                emptyText={ar ? "لا يوجد سجل" : "Aucun évènement"}
                f={f}
              />
            )}

            {tab === "automation" && (
              <Timeline
                items={data.automationRuns.map((r) => ({
                  id: String(r.id),
                  title: `${r.trigger} → ${r.result}`,
                  desc: r.reason ? SUPPRESSION_LABELS_CLIENT[r.reason] ?? r.reason : r.details ?? "",
                  at: r.created_at,
                  icon: Zap,
                  tone: r.result === "failed" ? "red" : r.result === "suppressed" ? "amber" : "green",
                }))}
                emptyIcon={Zap}
                emptyText={ar ? "لم تنفذ أي أتمتة" : "Aucune exécution d'automatisation"}
                f={f}
              />
            )}
          </div>
        </>
      )}
    </Drawer>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-ink-200 p-3.5">
      <p className="mb-2.5 text-[12px] font-semibold uppercase tracking-wide text-ink-400">{title}</p>
      {children}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11.5px] text-ink-400">{label}</p>
      <p className="mt-0.5 text-[13px] font-medium text-ink-800">{value}</p>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-ink-500">{label}</span>
      <span className={cn("tabular", strong ? "font-semibold text-ink-900" : "text-ink-700")}>{value}</span>
    </div>
  );
}

function Timeline({ items, emptyIcon, emptyText, f }: { items: { id: string; title: string; desc?: string | null; at: string | null; icon: React.ElementType; tone?: string }[]; emptyIcon: React.ElementType; emptyText: string; f: ReturnType<typeof useFormat> }) {
  if (!items.length) return <EmptyState icon={emptyIcon} title={emptyText} />;
  return (
    <div className="space-y-0">
      {items.map((i, idx) => (
        <div key={i.id} className="relative flex gap-3 ps-1">
          <div className="flex flex-col items-center">
            <span
              className={cn(
                "grid h-7 w-7 shrink-0 place-items-center rounded-full border",
                i.tone === "red" ? "border-red-200 bg-red-50 text-red-600" : i.tone === "amber" ? "border-amber-200 bg-amber-50 text-amber-600" : "border-ink-200 bg-white text-ink-500",
              )}
            >
              <i.icon className="h-3.5 w-3.5" />
            </span>
            {idx < items.length - 1 && <span className="w-px flex-1 bg-ink-200" />}
          </div>
          <div className="pb-4">
            <p className="text-[13px] font-medium text-ink-800">{i.title}</p>
            {i.desc && <p className="mt-0.5 text-[12px] text-ink-500">{i.desc}</p>}
            <p className="mt-0.5 text-[11px] text-ink-400">{f.dateTime(i.at)}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function AssignControl({ orderId, onDone, ar }: { orderId: string; onDone: () => void; ar: boolean }) {
  const { data } = useSWR<{ users: { user_id: string; full_name: string }[] }>("/api/settings", fetcher);
  const { push } = useToast();
  const [open, setOpen] = React.useState(false);
  if (!data?.users?.length) return null;
  return (
    <div className="relative">
      <Button size="sm" onClick={() => setOpen((v) => !v)}>
        <UserPlus className="h-3.5 w-3.5" /> {ar ? "تعيين وكيل" : "Assigner"}
      </Button>
      {open && (
        <div className="fade-in absolute bottom-10 z-30 min-w-44 rounded-xl border border-ink-200 bg-white py-1 shadow-lg">
          {data.users.map((u) => (
            <button
              key={u.user_id}
              className="block w-full px-3 py-2 text-start text-[13px] hover:bg-ink-50"
              onClick={async () => {
                await fetch(`/api/orders/${orderId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "assign", userId: u.user_id }) });
                push({ variant: "success", title: ar ? "تم التعيين" : "Agent assigné" });
                setOpen(false);
                onDone();
              }}
            >
              {u.full_name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
