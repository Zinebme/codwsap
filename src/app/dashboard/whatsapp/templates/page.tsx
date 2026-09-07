"use client";

import * as React from "react";
import useSWR from "swr";
import { Plus, FileText, Trash2, Pencil } from "lucide-react";
import { fetcher } from "@/components/dashboard/shell";
import { useDashLocale, useFormat } from "@/components/dashboard/locale";
import { PageHeader } from "@/components/dashboard/common";
import { Card, Button, Badge, Modal, Field, Input, Select, Textarea, useToast, EmptyState, Skeleton, Dropdown, DropdownItem } from "@/components/ui";
import { AUTOMATION_TYPES, AUTOMATION_META, type AutomationType } from "@/lib/domain";

type Tpl = Record<string, string | null>;

const STATUS_TONE: Record<string, "green" | "amber" | "red" | "gray"> = { approved: "green", pending: "amber", rejected: "red", draft: "gray", paused: "amber" };

export default function TemplatesPage() {
  const { locale } = useDashLocale();
  const f = useFormat();
  const ar = locale === "ar";
  const { push } = useToast();
  const { data, isLoading, mutate } = useSWR<{ rows: Tpl[] }>("/api/whatsapp/templates", fetcher);
  const [editing, setEditing] = React.useState<Tpl | null>(null);
  const [creating, setCreating] = React.useState(false);

  async function save(body: Record<string, unknown>, id?: string) {
    const res = await fetch(id ? `/api/whatsapp/templates/${id}` : "/api/whatsapp/templates", {
      method: id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok) return push({ variant: "error", title: json.error ?? "Erreur" });
    push({ variant: "success", title: ar ? "تم الحفظ" : "Template enregistré" });
    setEditing(null);
    setCreating(false);
    mutate();
  }

  return (
    <div className="space-y-3">
      <PageHeader
        title={ar ? "قوالب الرسائل" : "Templates de messages"}
        subtitle={ar ? "يجب اعتماد القوالب من ميتا قبل الإرسال التلقائي." : "Les templates doivent être approuvés par Meta avant tout envoi automatisé."}
        actions={
          <Button size="sm" variant="primary" onClick={() => setCreating(true)}>
            <Plus className="h-3.5 w-3.5" /> {ar ? "قالب" : "Template"}
          </Button>
        }
      />

      {isLoading ? (
        <div className="grid gap-3 md:grid-cols-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-36 rounded-[14px]" />)}</div>
      ) : !data?.rows.length ? (
        <Card><EmptyState icon={FileText} title={ar ? "لا توجد قوالب" : "Aucun template"} /></Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {data.rows.map((t) => (
            <Card key={String(t.id)} className="flex flex-col p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-[13.5px] font-semibold text-ink-900" dir="ltr">{t.name}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <Badge tone={STATUS_TONE[String(t.status)] ?? "gray"} dot>{String(t.status)}</Badge>
                    <Badge tone={t.category === "marketing" ? "violet" : "blue"}>{String(t.category)}</Badge>
                    <Badge tone="gray">{String(t.language).toUpperCase()}</Badge>
                  </div>
                </div>
                <Dropdown trigger={<Button size="icon" variant="ghost"><Pencil className="h-3.5 w-3.5" /></Button>}>
                  <DropdownItem icon={Pencil} onClick={() => setEditing(t)}>{ar ? "تعديل" : "Modifier"}</DropdownItem>
                  <DropdownItem
                    icon={Trash2}
                    danger
                    onClick={async () => {
                      await fetch(`/api/whatsapp/templates/${t.id}`, { method: "DELETE" });
                      mutate();
                    }}
                  >
                    {ar ? "حذف" : "Supprimer"}
                  </DropdownItem>
                </Dropdown>
              </div>
              <p className="mt-3 flex-1 whitespace-pre-wrap rounded-lg bg-ink-50 p-2.5 text-[12.5px] leading-relaxed text-ink-700">{t.body}</p>
              <div className="mt-2.5 flex items-center justify-between text-[11px] text-ink-400">
                <span>{t.event_key ? AUTOMATION_META[t.event_key as AutomationType]?.fr ?? t.event_key : ar ? "بدون حدث" : "Aucun évènement"}</span>
                <span>{f.date(t.updated_at)}</span>
              </div>
            </Card>
          ))}
        </div>
      )}

      <TemplateModal
        open={creating || !!editing}
        template={editing}
        ar={ar}
        onClose={() => { setCreating(false); setEditing(null); }}
        onSave={save}
      />
    </div>
  );
}

function TemplateModal({ open, template, ar, onClose, onSave }: { open: boolean; template: Tpl | null; ar: boolean; onClose: () => void; onSave: (b: Record<string, unknown>, id?: string) => void }) {
  const [body, setBody] = React.useState("");
  React.useEffect(() => setBody(String(template?.body ?? "")), [template, open]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      width="max-w-xl"
      title={template ? (ar ? "تعديل القالب" : "Modifier le template") : ar ? "قالب جديد" : "Nouveau template"}
      footer={
        <>
          <Button onClick={onClose}>{ar ? "إلغاء" : "Annuler"}</Button>
          <Button variant="primary" type="submit" form="tpl-form">{ar ? "حفظ" : "Enregistrer"}</Button>
        </>
      }
    >
      <form
        id="tpl-form"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          const payload: Record<string, unknown> = {
            body,
            category: fd.get("category"),
            eventKey: fd.get("eventKey") || null,
            status: fd.get("status"),
          };
          if (!template) {
            payload.name = fd.get("name");
            payload.language = fd.get("language");
            delete payload.status;
          }
          onSave(payload, template ? String(template.id) : undefined);
        }}
        className="space-y-3.5"
      >
        {!template && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={ar ? "الاسم (بالإنجليزية، أحرف صغيرة)" : "Nom (minuscules, underscores)"}>
              <Input name="name" required pattern="[a-z0-9_]+" dir="ltr" placeholder="order_confirmation" />
            </Field>
            <Field label={ar ? "اللغة" : "Langue"}>
              <Select name="language" defaultValue="fr">
                <option value="fr">Français</option>
                <option value="ar">العربية</option>
                <option value="en">English</option>
              </Select>
            </Field>
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={ar ? "الفئة" : "Catégorie"}>
            <Select name="category" defaultValue={String(template?.category ?? "utility")}>
              <option value="utility">Utility</option>
              <option value="marketing">Marketing</option>
              <option value="authentication">Authentication</option>
            </Select>
          </Field>
          {template && (
            <Field label={ar ? "الحالة (كما في ميتا)" : "Statut (tel que chez Meta)"} hint={ar ? "المنصة لا تخترع حالة الاعتماد." : "La plateforme n'invente jamais le statut d'approbation."}>
              <Select name="status" defaultValue={String(template?.status ?? "draft")}>
                {["draft", "pending", "approved", "rejected", "paused"].map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </Select>
            </Field>
          )}
        </div>
        <Field label={ar ? "الحدث المرتبط" : "Évènement associé"}>
          <Select name="eventKey" defaultValue={String(template?.event_key ?? "")}>
            <option value="">{ar ? "بدون" : "Aucun"}</option>
            {AUTOMATION_TYPES.filter((a) => !["reply_yes_confirm", "reply_no_cancel", "failed_message_alert"].includes(a)).map((a) => (
              <option key={a} value={a}>{ar ? AUTOMATION_META[a].ar : AUTOMATION_META[a].fr}</option>
            ))}
          </Select>
        </Field>
        <Field label={ar ? "نص الرسالة" : "Corps du message"} hint={ar ? "استخدم {{1}} أو {{customer_name}} للمتغيرات." : "Utilisez {{1}} ou {{customer_name}} pour les variables."}>
          <Textarea rows={5} value={body} onChange={(e) => setBody(e.target.value)} required minLength={5} maxLength={1024} />
        </Field>
        <div className="rounded-lg border border-ink-200 bg-ink-50 p-3">
          <p className="text-[11.5px] font-semibold uppercase text-ink-400">{ar ? "معاينة" : "Aperçu"}</p>
          <p className="mt-1.5 whitespace-pre-wrap text-[13px] text-ink-800">
            {body.replace(/\{\{\s*1\s*\}\}/g, "Amine").replace(/\{\{\s*2\s*\}\}/g, "CMD-01042").replace(/\{\{\s*3\s*\}\}/g, "5 400 DA").replace(/\{\{\s*(\w+)\s*\}\}/g, "…")}
          </p>
        </div>
      </form>
    </Modal>
  );
}
