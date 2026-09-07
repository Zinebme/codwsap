"use client";

import * as React from "react";
import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import useSWR from "swr";
import { Store, AlertTriangle } from "lucide-react";
import { fetcher } from "@/components/dashboard/shell";
import { Card, SearchInput, Select, Badge, Button, Drawer, Tabs, Pagination, TableSkeleton, EmptyState, Skeleton, useToast, cn } from "@/components/ui";
import type { MerchantRow, Plan } from "../types";

const fmt = new Intl.NumberFormat("fr-FR");
const dt = (v?: string | null) => (v ? new Date(v.includes("T") ? v : `${v.replace(" ", "T")}Z`).toLocaleString("fr-FR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");

const STATUS_TONE: Record<string, "green" | "blue" | "red" | "gray"> = { active: "green", trial: "blue", suspended: "red", inactive: "gray" };

export default function MerchantsPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96 rounded-[14px]" />}>
      <Inner />
    </Suspense>
  );
}

function Inner() {
  const router = useRouter();
  const sp = useSearchParams();
  const selected = sp.get("m");
  const [q, setQ] = React.useState("");
  const [debounced, setDebounced] = React.useState("");
  const [status, setStatus] = React.useState("");
  const [page, setPage] = React.useState(1);

  React.useEffect(() => {
    const t = setTimeout(() => { setDebounced(q); setPage(1); }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const params = new URLSearchParams({ page: String(page) });
  if (debounced) params.set("q", debounced);
  if (status) params.set("status", status);
  const { data, isLoading, mutate } = useSWR<{ rows: MerchantRow[]; total: number; page: number; pages: number }>(`/api/admin/merchants?${params}`, fetcher, { keepPreviousData: true });

  return (
    <div className="space-y-3">
      <Card className="flex flex-wrap items-center gap-2.5 p-3">
        <SearchInput className="max-w-xs" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nom, email, téléphone…" />
        <Select className="w-auto" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          <option value="">Tous les statuts</option>
          <option value="trial">Essai</option>
          <option value="active">Actif</option>
          <option value="suspended">Suspendu</option>
        </Select>
        <span className="ms-auto text-[12.5px] text-ink-500">{data ? `${fmt.format(data.total)} marchands` : ""}</span>
      </Card>

      <Card className="overflow-hidden">
        {isLoading && !data ? (
          <TableSkeleton rows={10} cols={8} />
        ) : !data?.rows.length ? (
          <EmptyState icon={Store} title="Aucun marchand" />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-[12.5px]">
                <thead>
                  <tr className="border-b border-ink-200 bg-ink-50/60 text-[11px] uppercase text-ink-500">
                    {["Marchand", "Propriétaire", "Plan", "Statut", "Commandes", "Messages", "WhatsApp", "Transporteur", "Erreurs", "Inscription"].map((h) => (
                      <th key={h} className="whitespace-nowrap px-3 py-2 text-start font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {data.rows.map((m) => (
                    <tr key={m.id} className="cursor-pointer hover:bg-ink-50/70" onClick={() => router.push(`/admin/merchants?m=${m.id}`)}>
                      <td className="px-3 py-2">
                        <p className="font-medium text-ink-900">{m.name}</p>
                        <p className="text-[11px] text-ink-400">{m.email ?? "—"}</p>
                      </td>
                      <td className="px-3 py-2 text-ink-600">{m.owner_name ?? "—"}</td>
                      <td className="px-3 py-2"><Badge tone="gray">{m.plan_code}</Badge></td>
                      <td className="px-3 py-2"><Badge tone={STATUS_TONE[m.status] ?? "gray"} dot>{m.status}</Badge></td>
                      <td className="px-3 py-2 tabular">{fmt.format(m.orders_count)}</td>
                      <td className="px-3 py-2 tabular">{fmt.format(m.messages_count)}</td>
                      <td className="px-3 py-2"><Badge tone={m.whatsapp_status === "connected" ? "green" : "gray"} dot>{m.whatsapp_status ?? "—"}</Badge></td>
                      <td className="px-3 py-2 text-ink-600">{m.delivery_provider ?? "—"}</td>
                      <td className={cn("px-3 py-2 tabular", m.errors_count && "text-red-600")}>{fmt.format(m.errors_count)}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-ink-500">{dt(m.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={data.page} pages={data.pages} total={data.total} pageSize={25} onPage={setPage} />
          </>
        )}
      </Card>

      {selected && <MerchantDrawer id={selected} onClose={() => router.push("/admin/merchants")} onChanged={() => mutate()} />}
    </div>
  );
}

type Detail = {
  merchant: Record<string, string | number | null>;
  users: { role: string; status: string; full_name: string; email: string; last_login_at: string | null }[];
  integrations: { kind: string; status: string; last_sync_at: string | null; last_error: string | null }[];
  delivery: { provider: string; label: string; status: string; last_sync_at: string | null; last_error: string | null }[];
  whatsapp: Record<string, string | null> | null;
  usage: { period: string; metric: string; value: number }[];
  subscription: Record<string, string | null> | null;
  errors: { service: string; operation: string; error: string | null; created_at: string }[];
  audits: { id: string; action: string; actor_label: string | null; ip: string | null; created_at: string }[];
};

function MerchantDrawer({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const { push } = useToast();
  const { data, mutate } = useSWR<Detail>(`/api/admin/merchants/${id}`, fetcher);
  const { data: plansData } = useSWR<{ rows: Plan[] }>("/api/admin/plans", fetcher);
  const [tab, setTab] = React.useState("apercu");
  const [busy, setBusy] = React.useState(false);

  async function act(body: Record<string, unknown>) {
    setBusy(true);
    const res = await fetch(`/api/admin/merchants/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setBusy(false);
    const json = await res.json();
    if (!res.ok) return push({ variant: "error", title: json.error ?? "Erreur" });
    push({ variant: "success", title: "Action effectuée et journalisée" });
    mutate();
    onChanged();
  }

  const m = data?.merchant;

  return (
    <Drawer
      open
      onClose={onClose}
      title={String(m?.name ?? "Marchand")}
      subtitle={m ? `${m.plan_code} · ${m.status} · inscrit le ${dt(String(m.created_at))}` : undefined}
      footer={
        m && (
          <div className="flex flex-wrap gap-2">
            {m.status !== "active" ? (
              <Button variant="primary" loading={busy} onClick={() => act({ action: "activate" })}>Activer</Button>
            ) : (
              <Button variant="ghost" className="text-red-600 hover:bg-red-50" loading={busy} onClick={() => { const reason = prompt("Motif de la suspension ?") ?? undefined; act({ action: "suspend", reason }); }}>
                Suspendre
              </Button>
            )}
            <Select
              className="h-8 w-auto py-0 text-[12.5px]"
              value={String(m.plan_code)}
              onChange={(e) => act({ action: "change_plan", planCode: e.target.value })}
            >
              {plansData?.rows.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}
            </Select>
            <Button loading={busy} onClick={() => act({ action: "reset_usage" })}>Réinitialiser l&apos;usage du mois</Button>
          </div>
        )
      }
    >
      {!data ? (
        <div className="space-y-2 p-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
      ) : (
        <div className="space-y-3">
          <Tabs
            value={tab}
            onChange={setTab}
            tabs={[
              { id: "apercu", label: "Aperçu" },
              { id: "integrations", label: "Intégrations", count: data.integrations.length + data.delivery.length },
              { id: "erreurs", label: "Erreurs", count: data.errors.length },
              { id: "audit", label: "Audit", count: data.audits.length },
            ]}
          />

          {tab === "apercu" && (
            <div className="space-y-3">
              <Section title="Coordonnées">
                {[
                  ["Email", String(m?.email ?? "—")],
                  ["Téléphone", String(m?.phone ?? "—")],
                  ["Wilaya", String(m?.wilaya ?? "—")],
                  ["Onboarding", m?.onboarding_completed_at ? `terminé le ${dt(String(m.onboarding_completed_at))}` : `étape ${m?.onboarding_step ?? 1}`],
                ].map(([l, v]) => <Row key={l} l={l} v={v} />)}
              </Section>
              <Section title="Équipe">
                {data.users.map((u) => (
                  <div key={u.email} className="flex items-center justify-between border-b border-ink-100 py-2 last:border-0 text-[12.5px]">
                    <div>
                      <p className="font-medium text-ink-800">{u.full_name}</p>
                      <p className="text-[11px] text-ink-400">{u.email}</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Badge tone="gray">{u.role}</Badge>
                      <Badge tone={u.status === "active" ? "green" : "gray"} dot>{u.status}</Badge>
                    </div>
                  </div>
                ))}
              </Section>
              <Section title="Consommation">
                {data.usage.length ? data.usage.map((u, i) => <Row key={i} l={`${u.period} · ${u.metric}`} v={fmt.format(u.value)} />) : <p className="py-2 text-[12.5px] text-ink-500">Aucune donnée.</p>}
              </Section>
              <Section title="Abonnement">
                <Row l="Statut" v={String(data.subscription?.status ?? "—")} />
                <Row l="Plan" v={String(data.subscription?.plan_code ?? m?.plan_code ?? "—")} />
                <Row l="Échéance" v={dt(data.subscription?.current_period_end)} />
                <Row l="Activé par" v={String(data.subscription?.activated_by ?? "—")} />
              </Section>
            </div>
          )}

          {tab === "integrations" && (
            <div className="space-y-3">
              <Section title="WhatsApp">
                <Row l="Statut" v={String(data.whatsapp?.status ?? "non connecté")} />
                <Row l="Numéro" v={String(data.whatsapp?.display_phone ?? "—")} />
                <Row l="Qualité Meta" v={String(data.whatsapp?.quality_rating ?? "Inconnue")} />
                <Row l="Dernier webhook" v={dt(data.whatsapp?.last_webhook_at)} />
                <Row l="Dernière erreur" v={String(data.whatsapp?.last_error ?? "—")} />
              </Section>
              <Section title="Transporteurs">
                {data.delivery.length ? data.delivery.map((d, i) => (
                  <div key={i} className="flex items-center justify-between border-b border-ink-100 py-2 last:border-0 text-[12.5px]">
                    <div>
                      <p className="font-medium text-ink-800">{d.label}</p>
                      <p className="text-[11px] text-ink-400">{d.provider} · {dt(d.last_sync_at)}</p>
                    </div>
                    <Badge tone={d.status === "connected" ? "green" : d.status === "error" ? "red" : "gray"} dot>{d.status}</Badge>
                  </div>
                )) : <p className="py-2 text-[12.5px] text-ink-500">Aucun transporteur.</p>}
              </Section>
              <Section title="Autres intégrations">
                {data.integrations.length ? data.integrations.map((it, i) => (
                  <div key={i} className="flex items-center justify-between border-b border-ink-100 py-2 last:border-0 text-[12.5px]">
                    <div>
                      <p className="font-medium text-ink-800">{it.kind}</p>
                      <p className="text-[11px] text-ink-400">{dt(it.last_sync_at)}{it.last_error ? ` · ${it.last_error}` : ""}</p>
                    </div>
                    <Badge tone={it.status === "connected" ? "green" : "gray"} dot>{it.status}</Badge>
                  </div>
                )) : <p className="py-2 text-[12.5px] text-ink-500">Aucune intégration.</p>}
              </Section>
            </div>
          )}

          {tab === "erreurs" && (
            <Section title="Erreurs d'API récentes">
              {data.errors.length ? data.errors.map((e, i) => (
                <div key={i} className="flex items-start gap-2 border-b border-ink-100 py-2 last:border-0">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-500" />
                  <div className="min-w-0">
                    <p className="text-[12.5px] text-ink-800">{e.error ?? "—"}</p>
                    <p className="text-[11px] text-ink-400">{e.service} · {e.operation} · {dt(e.created_at)}</p>
                  </div>
                </div>
              )) : <p className="py-2 text-[12.5px] text-ink-500">Aucune erreur.</p>}
            </Section>
          )}

          {tab === "audit" && (
            <Section title="Journal d'audit">
              {data.audits.map((a) => (
                <div key={a.id} className="flex items-center justify-between border-b border-ink-100 py-2 last:border-0 text-[12.5px]">
                  <div className="min-w-0">
                    <p className="truncate text-ink-800">{a.action}</p>
                    <p className="text-[11px] text-ink-400">{a.actor_label ?? "—"} · {a.ip ?? "—"}</p>
                  </div>
                  <span className="shrink-0 text-[11px] text-ink-400">{dt(a.created_at)}</span>
                </div>
              ))}
            </Section>
          )}
        </div>
      )}
    </Drawer>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-ink-200 bg-white p-3.5">
      <p className="mb-2 text-[11.5px] font-semibold uppercase tracking-wide text-ink-400">{title}</p>
      {children}
    </div>
  );
}

function Row({ l, v }: { l: string; v: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-ink-100 py-1.5 text-[12.5px] last:border-0">
      <span className="text-ink-500">{l}</span>
      <span className="truncate font-medium text-ink-800">{v}</span>
    </div>
  );
}
