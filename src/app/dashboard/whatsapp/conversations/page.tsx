"use client";

import * as React from "react";
import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import useSWR from "swr";
import { Send, Inbox, Clock, AlertTriangle, ArrowLeft } from "lucide-react";
import { fetcher } from "@/components/dashboard/shell";
import { useDashLocale, useFormat } from "@/components/dashboard/locale";
import { MessageStatusBadge, CallButton, WhatsappLinkButton } from "@/components/dashboard/common";
import { Card, SearchInput, Button, Badge, Skeleton, EmptyState, Textarea, Select, useToast, cn } from "@/components/ui";
import { SUPPRESSION_LABELS_CLIENT } from "../../orders/labels";

type Conv = Record<string, string | number | null>;

export default function ConversationsPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <Inner />
    </Suspense>
  );
}

function Inner() {
  const { locale } = useDashLocale();
  const f = useFormat();
  const ar = locale === "ar";
  const router = useRouter();
  const sp = useSearchParams();
  const active = sp.get("c");
  const [q, setQ] = React.useState("");
  const [unreadOnly, setUnreadOnly] = React.useState(false);

  const { data, mutate } = useSWR<{ rows: Conv[] }>(
    `/api/whatsapp/conversations?${new URLSearchParams({ ...(q ? { q } : {}), ...(unreadOnly ? { unread: "1" } : {}) })}`,
    fetcher,
    { refreshInterval: 20_000 },
  );

  return (
    <Card className="overflow-hidden">
      <div className="grid h-[calc(100vh-13rem)] grid-cols-1 lg:grid-cols-[330px_1fr]">
        <div className={cn("flex flex-col border-e border-ink-200", active && "hidden lg:flex")}>
          <div className="space-y-2 border-b border-ink-100 p-3">
            <SearchInput value={q} onChange={(e) => setQ(e.target.value)} placeholder={ar ? "بحث…" : "Rechercher…"} />
            <Button size="sm" variant={unreadOnly ? "primary" : "secondary"} onClick={() => setUnreadOnly((v) => !v)}>
              {ar ? "غير المقروءة فقط" : "Non lues seulement"}
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {!data ? (
              <div className="space-y-2 p-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14" />)}</div>
            ) : !data.rows.length ? (
              <EmptyState icon={Inbox} title={ar ? "لا توجد محادثات" : "Aucune conversation"} description={ar ? "ستظهر عند تلقي أول رسالة." : "Elles apparaîtront dès le premier message reçu."} />
            ) : (
              data.rows.map((c) => (
                <button
                  key={String(c.id)}
                  onClick={() => router.push(`/dashboard/whatsapp/conversations?c=${c.id}`)}
                  className={cn("flex w-full gap-3 border-b border-ink-100 p-3 text-start hover:bg-ink-50", active === c.id && "bg-brand-50/60")}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-[13px] font-semibold text-ink-900">{String(c.customer_name || c.normalized_phone)}</p>
                      <span className="shrink-0 text-[10.5px] text-ink-400">{f.relative(c.last_message_at as string)}</span>
                    </div>
                    <p className="mt-0.5 truncate text-[12px] text-ink-500">{c.last_message_preview ?? "—"}</p>
                    <div className="mt-1 flex items-center gap-1.5">
                      {c.order_reference && <Badge tone="gray">{String(c.order_reference)}</Badge>}
                      {Number(c.unread_count) > 0 && <Badge tone="blue">{String(c.unread_count)}</Badge>}
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        <div className={cn("flex flex-col", !active && "hidden lg:flex")}>
          {active ? <Thread id={active} ar={ar} onBack={() => router.push("/dashboard/whatsapp/conversations")} onSent={() => mutate()} /> : <EmptyState icon={Inbox} title={ar ? "اختر محادثة" : "Sélectionnez une conversation"} />}
        </div>
      </div>
    </Card>
  );
}

function Thread({ id, ar, onBack, onSent }: { id: string; ar: boolean; onBack: () => void; onSent: () => void }) {
  const f = useFormat();
  const { push } = useToast();
  const { data, mutate } = useSWR<{ conversation: Conv; customer: Conv | null; windowOpen: boolean; messages: Conv[] }>(`/api/whatsapp/conversations/${id}`, fetcher, { refreshInterval: 15_000 });
  const { data: templates } = useSWR<{ rows: Record<string, string>[] }>("/api/whatsapp/templates", fetcher);
  const [text, setText] = React.useState("");
  const [templateId, setTemplateId] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const endRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [data?.messages.length]);

  async function send() {
    setBusy(true);
    try {
      const res = await fetch(`/api/whatsapp/conversations/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(templateId ? { templateId } : { text }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erreur");
      if (json.status === "suppressed") {
        push({ variant: "info", title: ar ? "تم منع الرسالة" : "Message bloqué", description: SUPPRESSION_LABELS_CLIENT[json.reason] ?? json.reason });
      } else {
        push({ variant: "success", title: ar ? "تم الإرسال" : "Message envoyé" });
      }
      setText("");
      mutate();
      onSent();
    } catch (e) {
      push({ variant: "error", title: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  if (!data) return <div className="space-y-2 p-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>;

  return (
    <>
      <div className="flex items-center gap-2 border-b border-ink-100 px-3 py-2.5">
        <button className="lg:hidden" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 text-ink-500 rtl:rotate-180" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13.5px] font-semibold text-ink-900">{String(data.customer?.full_name || data.conversation.normalized_phone)}</p>
          <p className="text-[11.5px] text-ink-400" dir="ltr">{String(data.conversation.normalized_phone)}</p>
        </div>
        <CallButton phone={data.conversation.normalized_phone as string} />
        <WhatsappLinkButton phone={data.conversation.normalized_phone as string} />
      </div>

      <div className={cn("flex items-center gap-2 px-3 py-2 text-[12px]", data.windowOpen ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800")}>
        {data.windowOpen ? <Clock className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
        {data.windowOpen
          ? ar ? "نافذة خدمة الزبائن مفتوحة — يمكنك الرد بحرية." : "Fenêtre de service ouverte — vous pouvez répondre librement."
          : ar ? "النافذة مغلقة — استخدم قالبا معتمدا." : "Fenêtre fermée — utilisez un template approuvé."}
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto p-3">
        {data.messages.map((m) => (
          <div key={String(m.id)} className={cn("max-w-[78%] rounded-2xl px-3 py-2", m.direction === "outbound" ? "ms-auto bg-brand-600 text-white" : "bg-ink-100 text-ink-800")}>
            <p className="whitespace-pre-wrap text-[13px]">{m.body}</p>
            <div className="mt-1 flex items-center gap-1.5">
              <span className={cn("text-[10px]", m.direction === "outbound" ? "text-white/70" : "text-ink-400")}>{f.dateTime(m.created_at as string)}</span>
              {m.direction === "outbound" && <MessageStatusBadge status={String(m.status)} />}
            </div>
            {m.error_message && <p className="mt-1 text-[10.5px] text-red-200">{String(m.error_message)}</p>}
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <div className="space-y-2 border-t border-ink-100 p-3">
        <Select value={templateId} onChange={(e) => setTemplateId(e.target.value)} className="h-8 py-0 text-[12.5px]">
          <option value="">{ar ? "رسالة نصية" : "Message libre"}</option>
          {templates?.rows.filter((t) => t.status === "approved").map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </Select>
        {!templateId && <Textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder={ar ? "اكتب رسالة…" : "Écrire un message…"} disabled={!data.windowOpen} />}
        <Button variant="primary" size="sm" loading={busy} disabled={!templateId && (!text.trim() || !data.windowOpen)} onClick={send}>
          <Send className="h-3.5 w-3.5" /> {ar ? "إرسال" : "Envoyer"}
        </Button>
      </div>
    </>
  );
}
