"use client";

import * as React from "react";
import useSWR from "swr";
import { Truck, Plus, Plug, Trash2, Star, AlertTriangle, CheckCircle2, HelpCircle } from "lucide-react";
import { fetcher } from "@/components/dashboard/shell";
import { useDashLocale, useFormat } from "@/components/dashboard/locale";
import { PageHeader } from "@/components/dashboard/common";
import { Card, CardHeader, CardTitle, CardBody, Button, Badge, Modal, Field, Input, Select, Textarea, Toggle, Skeleton, EmptyState, useToast } from "@/components/ui";

type Caps = Record<string, boolean>;
type Conn = {
  id: string; provider: string; label: string; status: string; is_default: number; is_active: number;
  last_sync_at: string | null; last_error: string | null; last_error_at: string | null; capabilities: Caps;
};
type CredField = { key: string; label: string; type: string; required: boolean; help?: string };
type Provider = { id: string; label: string; capabilities: Caps; fields: CredField[] };

const CAP_LABELS: Record<string, { fr: string; ar: string }> = {
  supportsCreateShipment: { fr: "Création d'expédition", ar: "إنشاء شحنة" },
  supportsUpdateShipment: { fr: "Modification", ar: "تعديل" },
  supportsCancelShipment: { fr: "Annulation", ar: "إلغاء" },
  supportsTracking: { fr: "Suivi colis", ar: "تتبع" },
  supportsWebhooks: { fr: "Webhooks", ar: "ويب هوك" },
  supportsStatusPolling: { fr: "Polling statut", ar: "استعلام دوري" },
};

export default function DeliveryPage() {
  const { locale } = useDashLocale();
  const f = useFormat();
  const ar = locale === "ar";
  const { push } = useToast();
  const { data, isLoading, mutate } = useSWR<{ rows: Conn[]; providers: Provider[] }>("/api/delivery/connections", fetcher);
  const [adding, setAdding] = React.useState(false);
  const [editing, setEditing] = React.useState<Conn | null>(null);
  const [requesting, setRequesting] = React.useState(false);
  const [testingId, setTestingId] = React.useState<string | null>(null);

  async function test(id: string) {
    setTestingId(id);
    const res = await fetch(`/api/delivery/connections/${id}`, { method: "POST" });
    const json = await res.json();
    push({ variant: json.ok ? "success" : "error", title: json.message ?? (ar ? "تم الاختبار" : "Test effectué") });
    setTestingId(null);
    mutate();
  }

  async function remove(id: string) {
    if (!confirm(ar ? "حذف هذا الاتصال؟" : "Supprimer cette connexion transporteur ?")) return;
    await fetch(`/api/delivery/connections/${id}`, { method: "DELETE" });
    mutate();
  }

  return (
    <div className="space-y-3">
      <PageHeader
        title={ar ? "الشحن والتوصيل" : "Livraison"}
        subtitle={ar ? "اربط شركات التوصيل. الحالات تُوحَّد داخليا مع الاحتفاظ بالحالة الأصلية." : "Connectez vos transporteurs. Les statuts sont normalisés en interne, le statut brut est conservé."}
        actions={
          <>
            <Button size="sm" onClick={() => setRequesting(true)}>
              <HelpCircle className="h-3.5 w-3.5" /> {ar ? "شركتي غير مدرجة" : "Transporteur non listé"}
            </Button>
            <Button size="sm" variant="primary" onClick={() => setAdding(true)}>
              <Plus className="h-3.5 w-3.5" /> {ar ? "إضافة" : "Ajouter"}
            </Button>
          </>
        }
      />

      {isLoading || !data ? (
        <div className="grid gap-3 lg:grid-cols-2">{Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-48 rounded-[14px]" />)}</div>
      ) : !data.rows.length ? (
        <Card>
          <EmptyState
            icon={Truck}
            title={ar ? "لا يوجد ناقل مرتبط" : "Aucun transporteur connecté"}
            description={ar ? "اربط شركة توصيل لإرسال الطرود وتتبعها تلقائيا." : "Connectez un transporteur pour expédier et suivre vos colis automatiquement."}
            action={<Button variant="primary" onClick={() => setAdding(true)}><Plus className="h-3.5 w-3.5" /> {ar ? "إضافة ناقل" : "Ajouter un transporteur"}</Button>}
          />
        </Card>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {data.rows.map((c) => (
            <Card key={c.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[13.5px] font-semibold text-ink-900">{c.label}</p>
                    {!!c.is_default && <Badge tone="blue"><Star className="me-1 inline h-2.5 w-2.5" />{ar ? "افتراضي" : "Par défaut"}</Badge>}
                    <Badge tone={c.status === "connected" ? "green" : c.status === "error" ? "red" : "gray"} dot>
                      {c.status === "connected" ? (ar ? "متصل" : "Connecté") : c.status === "error" ? (ar ? "خطأ" : "Erreur") : ar ? "غير متصل" : "Déconnecté"}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-[12px] text-ink-500">{data.providers.find((p) => p.id === c.provider)?.label ?? c.provider}</p>
                </div>
                <Toggle checked={!!c.is_active} onChange={async (v) => { await fetch(`/api/delivery/connections/${c.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isActive: v }) }); mutate(); }} />
              </div>

              <div className="mt-3 flex flex-wrap gap-1.5">
                {Object.entries(c.capabilities).map(([k, v]) => (
                  <span key={k} className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] ${v ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-ink-200 bg-ink-50 text-ink-400"}`}>
                    {v ? <CheckCircle2 className="h-2.5 w-2.5" /> : null}
                    {ar ? CAP_LABELS[k]?.ar ?? k : CAP_LABELS[k]?.fr ?? k}
                  </span>
                ))}
              </div>

              {c.last_error && (
                <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-100 bg-red-50/70 p-2.5 text-[12px] text-red-800">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>{c.last_error} <span className="text-red-400">· {f.dateTime(c.last_error_at)}</span></span>
                </div>
              )}

              <div className="mt-3 flex items-center justify-between border-t border-ink-100 pt-2.5">
                <span className="text-[11.5px] text-ink-500">{ar ? "آخر مزامنة" : "Dernière synchro"} : {f.dateTime(c.last_sync_at)}</span>
                <div className="flex gap-1.5">
                  <Button size="sm" loading={testingId === c.id} onClick={async () => await test(c.id)}><Plug className="h-3.5 w-3.5" /> {ar ? "اختبار" : "Tester"}</Button>
                  <Button size="sm" onClick={() => setEditing(c)}>{ar ? "إعداد" : "Configurer"}</Button>
                  <Button size="sm" variant="ghost" className="text-red-600 hover:bg-red-50" onClick={async () => await remove(c.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <CardHeader><CardTitle>{ar ? "الويب هوك والتتبع" : "Webhooks & suivi"}</CardTitle></CardHeader>
        <CardBody className="space-y-2 text-[12.5px] text-ink-600">
          <p>
            {ar
              ? "لكل اتصال رابط ويب هوك خاص مع توقيع HMAC-SHA256 عبر ترويسة x-signature. إذا لم يدعم الناقل الويب هوك، تعتمد المنصة على استعلام دوري في الخلفية."
              : "Chaque connexion dispose d'une URL webhook dédiée signée en HMAC-SHA256 (en-tête x-signature). Si le transporteur ne gère pas les webhooks, un polling de secours tourne en arrière-plan."}
          </p>
          {data?.rows.map((c) => (
            <code key={c.id} className="block truncate rounded-lg bg-ink-100 px-2 py-1.5 text-[11.5px]" dir="ltr">
              {typeof window !== "undefined" ? window.location.origin : ""}/api/webhooks/delivery/{c.id}
            </code>
          ))}
        </CardBody>
      </Card>

      <ConnectionModal
        open={adding || !!editing}
        conn={editing}
        providers={data?.providers ?? []}
        ar={ar}
        onClose={() => { setAdding(false); setEditing(null); }}
        onSaved={() => { setAdding(false); setEditing(null); mutate(); }}
      />
      <RequestModal open={requesting} ar={ar} onClose={() => setRequesting(false)} />
    </div>
  );
}

function ConnectionModal({ open, conn, providers, ar, onClose, onSaved }: { open: boolean; conn: Conn | null; providers: Provider[]; ar: boolean; onClose: () => void; onSaved: () => void }) {
  const { push } = useToast();
  const [provider, setProvider] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => setProvider(conn?.provider ?? providers[0]?.id ?? ""), [conn, providers, open]);
  const p = providers.find((x) => x.id === provider);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const credentials: Record<string, string> = {};
    for (const field of p?.fields ?? []) credentials[field.key] = String(fd.get(field.key) ?? "");
    setBusy(true);
    try {
      const res = await fetch(conn ? `/api/delivery/connections/${conn.id}` : "/api/delivery/connections", {
        method: conn ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, label: fd.get("label"), credentials, isDefault: fd.get("isDefault") === "on" }),
      });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error ?? "Erreur");
      push({ variant: "success", title: ar ? "تم الحفظ" : "Transporteur enregistré" });
      onSaved();
    } catch (err) {
      push({ variant: "error", title: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      width="max-w-lg"
      title={conn ? (ar ? "إعداد الناقل" : "Configurer le transporteur") : ar ? "ناقل جديد" : "Nouveau transporteur"}
      footer={
        <>
          <Button onClick={onClose}>{ar ? "إلغاء" : "Annuler"}</Button>
          <Button variant="primary" type="submit" form="dlc-form" loading={busy}>{ar ? "حفظ" : "Enregistrer"}</Button>
        </>
      }
    >
      <form id="dlc-form" onSubmit={submit} className="space-y-3.5">
        <Field label={ar ? "الناقل" : "Transporteur"}>
          <Select value={provider} onChange={(e) => setProvider(e.target.value)} disabled={!!conn}>
            {providers.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
          </Select>
        </Field>
        <Field label={ar ? "التسمية" : "Libellé"}>
          <Input name="label" required defaultValue={conn?.label ?? p?.label ?? ""} />
        </Field>
        {p?.fields.map((field) => (
          <Field key={field.key} label={field.label} hint={conn ? (ar ? "اتركه فارغا للاحتفاظ بالقيمة الحالية." : "Laissez vide pour conserver la valeur actuelle.") : field.help}>
            <Input name={field.key} type={field.type === "password" ? "password" : "text"} dir="ltr" required={field.required && !conn} />
          </Field>
        ))}
        <label className="flex items-center gap-2 text-[13px] text-ink-700">
          <input type="checkbox" name="isDefault" defaultChecked={!!conn?.is_default} className="h-4 w-4 rounded border-ink-300" />
          {ar ? "استخدمه كناقل افتراضي" : "Utiliser comme transporteur par défaut"}
        </label>
        <p className="rounded-lg bg-ink-50 p-2.5 text-[11.5px] text-ink-500">
          {ar ? "تُخزَّن المفاتيح مشفرة على الخادم ولا تُرسل أبدا إلى المتصفح." : "Les clés API sont chiffrées côté serveur et ne sont jamais renvoyées au navigateur."}
        </p>
      </form>
    </Modal>
  );
}

function RequestModal({ open, ar, onClose }: { open: boolean; ar: boolean; onClose: () => void }) {
  const { push } = useToast();
  const [busy, setBusy] = React.useState(false);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={ar ? "اطلب إضافة ناقل" : "Demander un transporteur"}
      footer={
        <>
          <Button onClick={onClose}>{ar ? "إلغاء" : "Annuler"}</Button>
          <Button variant="primary" type="submit" form="prq-form" loading={busy}>{ar ? "إرسال الطلب" : "Envoyer la demande"}</Button>
        </>
      }
    >
      <form
        id="prq-form"
        className="space-y-3.5"
        onSubmit={async (e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          setBusy(true);
          const res = await fetch("/api/delivery/requests", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ providerName: fd.get("providerName"), contact: fd.get("contact"), details: fd.get("details") }),
          });
          setBusy(false);
          if (res.ok) { push({ variant: "success", title: ar ? "تم إرسال طلبك" : "Demande transmise à notre équipe" }); onClose(); }
        }}
      >
        <Field label={ar ? "اسم شركة التوصيل" : "Nom du transporteur"}><Input name="providerName" required /></Field>
        <Field label={ar ? "جهة الاتصال (اختياري)" : "Contact (optionnel)"}><Input name="contact" /></Field>
        <Field label={ar ? "تفاصيل / رابط الواجهة" : "Détails / lien vers leur API"}><Textarea name="details" rows={3} /></Field>
      </form>
    </Modal>
  );
}
