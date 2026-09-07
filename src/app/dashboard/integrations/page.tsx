"use client";

import * as React from "react";
import Link from "next/link";
import useSWR from "swr";
import { MessageCircle, Truck, Table2, Send, Webhook, RefreshCw, Copy, AlertTriangle, Activity } from "lucide-react";
import { fetcher } from "@/components/dashboard/shell";
import { useDashLocale, useFormat } from "@/components/dashboard/locale";
import { PageHeader } from "@/components/dashboard/common";
import { Card, Button, Badge, Modal, Field, Input, Skeleton, useToast } from "@/components/ui";
import { MAPPABLE_FIELDS } from "@/server/connectors/orders/fields";

type Integration = { id: string; kind: string; label: string | null; status: string; settings: Record<string, unknown> | null; last_sync_at: string | null; last_error: string | null; secrets: Record<string, string> };
type Payload = {
  integrations: Integration[];
  whatsapp: { status: string; last_webhook_at: string | null; last_message_at: string | null; last_error: string | null } | null;
  delivery: Record<string, string | null>[];
  jobs: { pending: number; failed: number; stuck: number; checkedAt: string };
};

function StatusPill({ status, ar }: { status: string; ar: boolean }) {
  const tone = status === "connected" ? "green" : status === "error" ? "red" : "gray";
  const label = status === "connected" ? (ar ? "متصل" : "Connecté") : status === "error" ? (ar ? "خطأ" : "Erreur") : ar ? "غير مفعّل" : "Non connecté";
  return <Badge tone={tone} dot>{label}</Badge>;
}

export default function IntegrationsPage() {
  const { locale } = useDashLocale();
  const f = useFormat();
  const ar = locale === "ar";
  const { push } = useToast();
  const { data, isLoading, mutate } = useSWR<Payload>("/api/integrations", fetcher, { refreshInterval: 60_000 });
  const [sheetsOpen, setSheetsOpen] = React.useState(false);
  const [telegramOpen, setTelegramOpen] = React.useState(false);
  const [syncing, setSyncing] = React.useState(false);

  const sheets = data?.integrations.find((i) => i.kind === "google_sheets");
  const telegram = data?.integrations.find((i) => i.kind === "telegram");
  const apiInt = data?.integrations.find((i) => i.kind === "webhook");

  async function syncSheet() {
    setSyncing(true);
    const res = await fetch("/api/integrations/google", { method: "POST" });
    const json = await res.json();
    push({ variant: json.ok ? "success" : "error", title: json.ok ? `${json.created ?? 0} ${ar ? "طلب جديد" : "commandes importées"}` : json.error ?? "Erreur" });
    setSyncing(false);
    mutate();
  }

  async function enableApi() {
    await fetch("/api/integrations", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "webhook" }) });
    mutate();
  }

  if (isLoading || !data) return <div className="grid gap-3 md:grid-cols-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-44 rounded-[14px]" />)}</div>;

  const deliveryConnected = data.delivery.filter((d) => d.status === "connected").length;

  return (
    <div className="space-y-3">
      <PageHeader title={ar ? "التكاملات" : "Intégrations"} subtitle={ar ? "حالة كل الاتصالات في مكان واحد" : "L'état de toutes vos connexions au même endroit"} />

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {/* WhatsApp */}
        <IntegrationCard
          icon={MessageCircle}
          title="WhatsApp Business"
          desc={ar ? "الإرسال التلقائي والمحادثات" : "Envois automatiques et conversations"}
          status={data.whatsapp?.status ?? "disconnected"}
          ar={ar}
          rows={[
            { l: ar ? "آخر ويب هوك" : "Dernier webhook", v: f.dateTime(data.whatsapp?.last_webhook_at) },
            { l: ar ? "آخر إرسال" : "Dernier envoi", v: f.dateTime(data.whatsapp?.last_message_at) },
          ]}
          error={data.whatsapp?.last_error}
          actions={<Link href="/dashboard/whatsapp/settings"><Button size="sm">{ar ? "إعداد" : "Configurer"}</Button></Link>}
        />

        {/* Delivery */}
        <IntegrationCard
          icon={Truck}
          title={ar ? "شركات التوصيل" : "Transporteurs"}
          desc={ar ? "إرسال الطرود وتتبعها" : "Expéditions et suivi des colis"}
          status={deliveryConnected ? "connected" : data.delivery.length ? "error" : "disconnected"}
          ar={ar}
          rows={[
            { l: ar ? "متصلة" : "Connectés", v: `${deliveryConnected} / ${data.delivery.length}` },
            { l: ar ? "آخر مزامنة" : "Dernière synchro", v: f.dateTime(data.delivery[0]?.last_sync_at) },
          ]}
          error={data.delivery.find((d) => d.last_error)?.last_error ?? null}
          actions={<Link href="/dashboard/delivery"><Button size="sm">{ar ? "إدارة" : "Gérer"}</Button></Link>}
        />

        {/* Google Sheets */}
        <IntegrationCard
          icon={Table2}
          title="Google Sheets"
          desc={ar ? "استيراد الطلبات من جدول (اختياري)" : "Import de commandes depuis une feuille (optionnel)"}
          status={sheets?.status ?? "disconnected"}
          ar={ar}
          rows={[
            { l: ar ? "الجدول" : "Feuille", v: String((sheets?.settings as { sheet_name?: string })?.sheet_name || "—") },
            { l: ar ? "آخر مزامنة" : "Dernière synchro", v: f.dateTime(sheets?.last_sync_at) },
          ]}
          error={sheets?.last_error}
          actions={
            <>
              {sheets && <Button size="sm" loading={syncing} onClick={syncSheet}><RefreshCw className="h-3.5 w-3.5" /> {ar ? "مزامنة" : "Synchroniser"}</Button>}
              <Button size="sm" onClick={() => setSheetsOpen(true)}>{ar ? "إعداد" : "Configurer"}</Button>
            </>
          }
        />

        {/* Telegram */}
        <IntegrationCard
          icon={Send}
          title="Telegram"
          desc={ar ? "استقبال التنبيهات المهمة" : "Recevez vos alertes importantes"}
          status={telegram?.status ?? "disconnected"}
          ar={ar}
          rows={[{ l: ar ? "الرمز" : "Token", v: telegram?.secrets.bot_token ?? "—" }]}
          error={telegram?.last_error}
          actions={
            <>
              {telegram && (
                <Button size="sm" onClick={async () => { const r = await fetch("/api/integrations/telegram", { method: "POST" }); const j = await r.json(); push({ variant: j.ok ? "success" : "error", title: j.message }); mutate(); }}>
                  {ar ? "اختبار" : "Tester"}
                </Button>
              )}
              <Button size="sm" onClick={() => setTelegramOpen(true)}>{ar ? "إعداد" : "Configurer"}</Button>
            </>
          }
        />

        {/* API / Webhook */}
        <IntegrationCard
          icon={Webhook}
          title={ar ? "الواجهة والويب هوك" : "API & Webhook commandes"}
          desc={ar ? "أرسل طلباتك من موقعك مباشرة" : "Poussez vos commandes depuis votre site"}
          status={apiInt?.status ?? "disconnected"}
          ar={ar}
          rows={[{ l: "API key", v: apiInt?.secrets.api_key ?? "—" }]}
          actions={
            apiInt ? (
              <Button size="sm" onClick={() => { navigator.clipboard.writeText(`${window.location.origin}${(apiInt.settings as { endpoint?: string })?.endpoint ?? ""}`); push({ variant: "success", title: ar ? "تم نسخ الرابط" : "URL copiée" }); }}>
                <Copy className="h-3.5 w-3.5" /> {ar ? "نسخ الرابط" : "Copier l'URL"}
              </Button>
            ) : (
              <Button size="sm" variant="primary" onClick={enableApi}>{ar ? "تفعيل" : "Activer"}</Button>
            )
          }
        />

        {/* Jobs */}
        <IntegrationCard
          icon={Activity}
          title={ar ? "المهام الخلفية" : "Traitements en arrière-plan"}
          desc={ar ? "الإرسال، التتبع، التذكيرات" : "Envois, suivi colis, rappels"}
          status={data.jobs.failed > 20 || data.jobs.stuck > 5 ? "error" : "connected"}
          ar={ar}
          rows={[
            { l: ar ? "قيد الانتظار" : "En attente", v: String(data.jobs.pending) },
            { l: ar ? "فاشلة" : "En échec", v: String(data.jobs.failed) },
            { l: ar ? "معلّقة" : "Bloquées", v: String(data.jobs.stuck) },
          ]}
        />
      </div>

      <SheetsModal open={sheetsOpen} integration={sheets ?? null} ar={ar} onClose={() => setSheetsOpen(false)} onSaved={() => { setSheetsOpen(false); mutate(); }} />
      <TelegramModal open={telegramOpen} ar={ar} onClose={() => setTelegramOpen(false)} onSaved={() => { setTelegramOpen(false); mutate(); }} />
    </div>
  );
}

function IntegrationCard({ icon: Icon, title, desc, status, rows, error, actions, ar }: {
  icon: React.ElementType; title: string; desc: string; status: string; rows?: { l: string; v: string }[]; error?: string | null; actions?: React.ReactNode; ar: boolean;
}) {
  return (
    <Card className="flex flex-col p-4">
      <div className="flex items-start gap-3">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-50">
          <Icon className="h-[18px] w-[18px] text-brand-600" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-[13.5px] font-semibold text-ink-900">{title}</p>
            <StatusPill status={status} ar={ar} />
          </div>
          <p className="mt-0.5 text-[12px] leading-snug text-ink-500">{desc}</p>
        </div>
      </div>
      {rows && (
        <div className="mt-3 space-y-1.5 text-[12px]">
          {rows.map((r) => (
            <div key={r.l} className="flex items-center justify-between gap-3">
              <span className="text-ink-500">{r.l}</span>
              <span className="truncate font-medium text-ink-800">{r.v}</span>
            </div>
          ))}
        </div>
      )}
      {error && (
        <div className="mt-2.5 flex items-start gap-2 rounded-lg border border-red-100 bg-red-50/70 p-2 text-[11.5px] text-red-800">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" /> <span className="line-clamp-2">{error}</span>
        </div>
      )}
      {actions && <div className="mt-auto flex gap-1.5 pt-3">{actions}</div>}
    </Card>
  );
}

function SheetsModal({ open, integration, ar, onClose, onSaved }: { open: boolean; integration: Integration | null; ar: boolean; onClose: () => void; onSaved: () => void }) {
  const { push } = useToast();
  const settings = (integration?.settings ?? {}) as { spreadsheet_id?: string; sheet_name?: string; gid?: string; mapping?: Record<string, string>; auto_sync?: boolean };
  const [busy, setBusy] = React.useState(false);

  return (
    <Modal
      open={open}
      onClose={onClose}
      width="max-w-2xl"
      title={ar ? "ربط Google Sheets" : "Connecter Google Sheets"}
      footer={
        <>
          <Button onClick={onClose}>{ar ? "إلغاء" : "Annuler"}</Button>
          <Button variant="primary" type="submit" form="gs-form" loading={busy}>{ar ? "حفظ" : "Enregistrer"}</Button>
        </>
      }
    >
      <form
        id="gs-form"
        className="space-y-3.5"
        onSubmit={async (e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          const mapping: Record<string, string> = {};
          for (const field of MAPPABLE_FIELDS) {
            const v = String(fd.get(`m_${field.key}`) ?? "").trim();
            if (v) mapping[field.key] = v;
          }
          setBusy(true);
          const res = await fetch("/api/integrations", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              kind: "google_sheets",
              spreadsheetId: fd.get("spreadsheetId"),
              sheetName: fd.get("sheetName"),
              gid: fd.get("gid"),
              apiKey: (fd.get("apiKey") as string) || undefined,
              mapping,
              autoSync: fd.get("autoSync") === "on",
            }),
          });
          setBusy(false);
          const json = await res.json();
          if (!res.ok) return push({ variant: "error", title: json.error ?? "Erreur" });
          push({ variant: "success", title: ar ? "تم الحفظ" : "Feuille connectée" });
          onSaved();
        }}
      >
        <p className="rounded-lg bg-ink-50 p-2.5 text-[12px] text-ink-600">
          {ar
            ? "الربط بجداول جوجل اختياري تماما. حدد أسماء الأعمدة كما هي في جدولك — لا يوجد هيكل مفروض."
            : "Google Sheets est totalement optionnel. Indiquez les en-têtes de colonnes tels qu'ils apparaissent dans votre feuille — aucune structure n'est imposée."}
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Spreadsheet ID"><Input name="spreadsheetId" required dir="ltr" defaultValue={settings.spreadsheet_id ?? ""} /></Field>
          <Field label={ar ? "اسم الورقة" : "Nom de l'onglet"}><Input name="sheetName" dir="ltr" defaultValue={settings.sheet_name ?? ""} /></Field>
          <Field label="GID"><Input name="gid" dir="ltr" defaultValue={settings.gid ?? "0"} /></Field>
        </div>
        <Field label={ar ? "مفتاح Google API" : "Clé API Google"} hint={integration ? (ar ? "اتركه فارغا للاحتفاظ بالمفتاح الحالي." : "Laissez vide pour conserver la clé actuelle.") : ar ? "يخزن مشفرا على الخادم." : "Stockée chiffrée côté serveur."}>
          <Input name="apiKey" type="password" dir="ltr" />
        </Field>
        <div>
          <p className="mb-2 text-[12px] font-semibold text-ink-700">{ar ? "ربط الأعمدة" : "Correspondance des colonnes"}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {MAPPABLE_FIELDS.map((field) => (
              <label key={field.key} className="flex items-center gap-2">
                <span className="w-40 shrink-0 text-[12px] text-ink-600">{field.label}{field.required ? " *" : ""}</span>
                <Input name={`m_${field.key}`} className="h-8 text-[12.5px]" required={field.required} defaultValue={settings.mapping?.[field.key] ?? ""} placeholder={ar ? "اسم العمود" : "En-tête de colonne"} />
              </label>
            ))}
          </div>
        </div>
        <label className="flex items-center gap-2 text-[13px] text-ink-700">
          <input type="checkbox" name="autoSync" defaultChecked={settings.auto_sync !== false} className="h-4 w-4 rounded border-ink-300" />
          {ar ? "مزامنة تلقائية في الخلفية" : "Synchronisation automatique en arrière-plan"}
        </label>
      </form>
    </Modal>
  );
}

function TelegramModal({ open, ar, onClose, onSaved }: { open: boolean; ar: boolean; onClose: () => void; onSaved: () => void }) {
  const { push } = useToast();
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={ar ? "ربط Telegram" : "Connecter Telegram"}
      footer={
        <>
          <Button onClick={onClose}>{ar ? "إلغاء" : "Annuler"}</Button>
          <Button variant="primary" type="submit" form="tg-form">{ar ? "حفظ" : "Enregistrer"}</Button>
        </>
      }
    >
      <form
        id="tg-form"
        className="space-y-3.5"
        onSubmit={async (e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          const res = await fetch("/api/integrations", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ kind: "telegram", botToken: fd.get("botToken"), chatId: fd.get("chatId") }),
          });
          const json = await res.json();
          if (!res.ok) return push({ variant: "error", title: json.error ?? "Erreur" });
          push({ variant: "success", title: ar ? "تم الحفظ" : "Telegram connecté" });
          onSaved();
        }}
      >
        <Field label="Bot token" hint={ar ? "أنشئه عبر BotFather. يخزن مشفرا." : "Créé via BotFather. Stocké chiffré côté serveur."}><Input name="botToken" required type="password" dir="ltr" /></Field>
        <Field label="Chat ID"><Input name="chatId" required dir="ltr" /></Field>
      </form>
    </Modal>
  );
}
