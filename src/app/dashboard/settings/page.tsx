"use client";

import * as React from "react";
import { Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import useSWR from "swr";
import { Building2, Users, MessageCircle, Truck, Table2, Zap, Bell, FileText, Shield, CreditCard, Plus, LogOut } from "lucide-react";
import { fetcher } from "@/components/dashboard/shell";
import { useDashLocale, useFormat } from "@/components/dashboard/locale";
import { PageHeader } from "@/components/dashboard/common";
import { Card, CardHeader, CardTitle, CardBody, Button, Badge, Input, Select, Field, Modal, Toggle, Skeleton, useToast, cn, EmptyState } from "@/components/ui";
import { WILAYAS } from "@/lib/domain";

type Settings = {
  merchant: Record<string, string | number | null>;
  users: { id: string; role: string; status: string; user_id: string; full_name: string; email: string; last_login_at: string | null }[];
  prefs: { event_type: string; dashboard: number; telegram: number; email: number }[];
  subscription: Record<string, string | null> | null;
  usage: { metric: string; value: number }[];
  plan: Record<string, string | number | null> | null;
  audits: { id: string; action: string; actor_label: string | null; resource: string | null; created_at: string; ip: string | null }[];
  role: string;
  notificationTypes: { id: string; label: string }[];
};

const SECTIONS = [
  { id: "business", icon: Building2, fr: "Entreprise", ar: "المؤسسة" },
  { id: "users", icon: Users, fr: "Utilisateurs", ar: "المستخدمون" },
  { id: "whatsapp", icon: MessageCircle, fr: "WhatsApp", ar: "واتساب", href: "/dashboard/whatsapp/settings" },
  { id: "delivery", icon: Truck, fr: "Livraison", ar: "التوصيل", href: "/dashboard/delivery" },
  { id: "sources", icon: Table2, fr: "Sources de commandes", ar: "مصادر الطلبات", href: "/dashboard/integrations" },
  { id: "automations", icon: Zap, fr: "Automatisations", ar: "الأتمتة", href: "/dashboard/automations" },
  { id: "templates", icon: FileText, fr: "Templates", ar: "القوالب", href: "/dashboard/whatsapp/templates" },
  { id: "notifications", icon: Bell, fr: "Notifications", ar: "الإشعارات" },
  { id: "billing", icon: CreditCard, fr: "Abonnement", ar: "الاشتراك" },
  { id: "security", icon: Shield, fr: "Sécurité", ar: "الأمان" },
];

export default function SettingsPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96 rounded-[14px]" />}>
      <Inner />
    </Suspense>
  );
}

function Inner() {
  const { locale } = useDashLocale();
  const ar = locale === "ar";
  const router = useRouter();
  const sp = useSearchParams();
  const section = sp.get("section") ?? "business";
  const { data, isLoading, mutate } = useSWR<Settings>("/api/settings", fetcher);

  return (
    <div className="space-y-3">
      <PageHeader title={ar ? "الإعدادات" : "Paramètres"} />
      <div className="grid gap-3 lg:grid-cols-[220px_1fr]">
        <Card className="h-fit p-1.5">
          <nav className="flex gap-1 overflow-x-auto lg:flex-col">
            {SECTIONS.map((s) =>
              s.href ? (
                <Link key={s.id} href={s.href} className="flex shrink-0 items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] text-ink-600 hover:bg-ink-100">
                  <s.icon className="h-4 w-4" /> {ar ? s.ar : s.fr}
                </Link>
              ) : (
                <button
                  key={s.id}
                  onClick={() => router.push(`/dashboard/settings?section=${s.id}`)}
                  className={cn("flex shrink-0 items-center gap-2 rounded-lg px-2.5 py-2 text-[13px]", section === s.id ? "bg-brand-50 font-medium text-brand-700" : "text-ink-600 hover:bg-ink-100")}
                >
                  <s.icon className="h-4 w-4" /> {ar ? s.ar : s.fr}
                </button>
              ),
            )}
          </nav>
        </Card>

        <div className="min-w-0">
          {isLoading || !data ? (
            <Skeleton className="h-80 rounded-[14px]" />
          ) : section === "business" ? (
            <BusinessSection data={data} ar={ar} onSaved={mutate} />
          ) : section === "users" ? (
            <UsersSection data={data} ar={ar} onSaved={mutate} />
          ) : section === "notifications" ? (
            <NotificationsSection data={data} ar={ar} onSaved={mutate} />
          ) : section === "billing" ? (
            <BillingSection data={data} ar={ar} />
          ) : (
            <SecuritySection data={data} ar={ar} />
          )}
        </div>
      </div>
    </div>
  );
}

function BusinessSection({ data, ar, onSaved }: { data: Settings; ar: boolean; onSaved: () => void }) {
  const { push } = useToast();
  const [busy, setBusy] = React.useState(false);
  const m = data.merchant;
  const readOnly = data.role === "agent";
  return (
    <Card>
      <CardHeader><CardTitle>{ar ? "معلومات المؤسسة" : "Informations de l'entreprise"}</CardTitle></CardHeader>
      <CardBody>
        <form
          className="space-y-3.5"
          onSubmit={async (e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            setBusy(true);
            const res = await fetch("/api/settings", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                section: "business",
                name: fd.get("name"),
                phone: fd.get("phone") || undefined,
                email: fd.get("email") || undefined,
                wilaya: fd.get("wilaya") || undefined,
                address: fd.get("address") || undefined,
                locale: fd.get("locale"),
              }),
            });
            setBusy(false);
            const json = await res.json();
            if (!res.ok) return push({ variant: "error", title: json.error ?? "Erreur" });
            push({ variant: "success", title: ar ? "تم الحفظ" : "Modifications enregistrées" });
            onSaved();
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={ar ? "اسم المتجر" : "Nom de la boutique"}><Input name="name" required defaultValue={String(m.name ?? "")} disabled={readOnly} /></Field>
            <Field label={ar ? "الهاتف" : "Téléphone"}><Input name="phone" dir="ltr" defaultValue={String(m.phone ?? "")} disabled={readOnly} /></Field>
            <Field label={ar ? "البريد الإلكتروني" : "Email"}><Input name="email" type="email" dir="ltr" defaultValue={String(m.email ?? "")} disabled={readOnly} /></Field>
            <Field label={ar ? "الولاية" : "Wilaya"}>
              <Select name="wilaya" defaultValue={String(m.wilaya ?? "")} disabled={readOnly}>
                <option value="">—</option>
                {WILAYAS.map((w, i) => <option key={w} value={w}>{String(i + 1).padStart(2, "0")} — {w}</option>)}
              </Select>
            </Field>
            <Field label={ar ? "العنوان" : "Adresse"}><Input name="address" defaultValue={String(m.address ?? "")} disabled={readOnly} /></Field>
            <Field label={ar ? "لغة الواجهة الافتراضية" : "Langue par défaut"}>
              <Select name="locale" defaultValue={String(m.locale ?? "fr")} disabled={readOnly}>
                <option value="fr">Français</option>
                <option value="ar">العربية</option>
              </Select>
            </Field>
          </div>
          {!readOnly && <Button type="submit" variant="primary" loading={busy}>{ar ? "حفظ" : "Enregistrer"}</Button>}
        </form>
      </CardBody>
    </Card>
  );
}

function UsersSection({ data, ar, onSaved }: { data: Settings; ar: boolean; onSaved: () => void }) {
  const f = useFormat();
  const { push } = useToast();
  const [open, setOpen] = React.useState(false);
  const canManage = data.role === "owner" || data.role === "admin";

  return (
    <Card>
      <CardHeader>
        <CardTitle>{ar ? "فريق العمل" : "Équipe"}</CardTitle>
        {canManage && <Button size="sm" variant="primary" onClick={() => setOpen(true)}><Plus className="h-3.5 w-3.5" /> {ar ? "دعوة" : "Inviter"}</Button>}
      </CardHeader>
      <div className="overflow-x-auto">
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="border-b border-ink-100 bg-ink-50/60 text-[11px] uppercase text-ink-500">
              {[ar ? "الاسم" : "Nom", "Email", ar ? "الدور" : "Rôle", ar ? "الحالة" : "Statut", ar ? "آخر دخول" : "Dernière connexion", ""].map((h, i) => (
                <th key={i} className="px-3 py-2 text-start font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {data.users.map((u) => (
              <tr key={u.id}>
                <td className="px-3 py-2 font-medium text-ink-800">{u.full_name}</td>
                <td className="px-3 py-2 text-ink-600" dir="ltr">{u.email}</td>
                <td className="px-3 py-2">
                  {u.role === "owner" || !canManage ? (
                    <Badge tone={u.role === "owner" ? "violet" : "gray"}>{u.role}</Badge>
                  ) : (
                    <Select
                      className="h-7 w-auto py-0 text-[12px]"
                      defaultValue={u.role}
                      onChange={async (e) => {
                        await fetch("/api/settings/users", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ membershipId: u.id, role: e.target.value }) });
                        onSaved();
                      }}
                    >
                      <option value="admin">admin</option>
                      <option value="agent">agent</option>
                    </Select>
                  )}
                </td>
                <td className="px-3 py-2"><Badge tone={u.status === "active" ? "green" : "gray"} dot>{u.status === "active" ? (ar ? "نشط" : "Actif") : ar ? "معطّل" : "Désactivé"}</Badge></td>
                <td className="px-3 py-2 text-ink-500">{f.dateTime(u.last_login_at)}</td>
                <td className="px-3 py-2 text-end">
                  {canManage && u.role !== "owner" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={async () => {
                        await fetch("/api/settings/users", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ membershipId: u.id, status: u.status === "active" ? "disabled" : "active" }) });
                        onSaved();
                      }}
                    >
                      {u.status === "active" ? (ar ? "تعطيل" : "Désactiver") : ar ? "تفعيل" : "Réactiver"}
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="border-t border-ink-100 p-3 text-[11.5px] text-ink-500">
        {ar ? "الوكيل لا يمكنه الوصول إلى التكاملات أو الفوترة." : "Le rôle Agent n'a pas accès aux intégrations ni à la facturation."}
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={ar ? "دعوة عضو" : "Inviter un membre"}
        footer={<><Button onClick={() => setOpen(false)}>{ar ? "إلغاء" : "Annuler"}</Button><Button variant="primary" type="submit" form="inv-form">{ar ? "إضافة" : "Ajouter"}</Button></>}
      >
        <form
          id="inv-form"
          className="space-y-3.5"
          onSubmit={async (e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const res = await fetch("/api/settings/users", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ fullName: fd.get("fullName"), email: fd.get("email"), role: fd.get("role"), password: (fd.get("password") as string) || undefined }),
            });
            const json = await res.json();
            if (!res.ok) return push({ variant: "error", title: json.error ?? "Erreur" });
            push({
              variant: "success",
              title: ar ? "تمت الإضافة" : "Membre ajouté",
              description: json.temporaryPassword ? `${ar ? "كلمة مرور مؤقتة" : "Mot de passe temporaire"} : ${json.temporaryPassword}` : undefined,
            });
            setOpen(false);
            onSaved();
          }}
        >
          <Field label={ar ? "الاسم الكامل" : "Nom complet"}><Input name="fullName" required /></Field>
          <Field label="Email"><Input name="email" type="email" required dir="ltr" /></Field>
          <Field label={ar ? "الدور" : "Rôle"}>
            <Select name="role" defaultValue="agent"><option value="agent">Agent</option><option value="admin">Admin</option></Select>
          </Field>
          <Field label={ar ? "كلمة مرور (اختياري)" : "Mot de passe (optionnel)"} hint={ar ? "إذا تُرك فارغا سنولّد كلمة مؤقتة." : "Laissé vide, un mot de passe temporaire est généré."}>
            <Input name="password" type="password" minLength={8} />
          </Field>
        </form>
      </Modal>
    </Card>
  );
}

function NotificationsSection({ data, ar, onSaved }: { data: Settings; ar: boolean; onSaved: () => void }) {
  const { push } = useToast();
  const byType = new Map(data.prefs.map((p) => [p.event_type, p]));
  const [state, setState] = React.useState(() =>
    data.notificationTypes.map((t) => {
      const p = byType.get(t.id);
      return { event_type: t.id, label: t.label, dashboard: p ? !!p.dashboard : t.id !== "delivery_status", telegram: !!p?.telegram, email: !!p?.email };
    }),
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>{ar ? "تفضيلات الإشعارات" : "Préférences de notification"}</CardTitle>
        <Button
          size="sm"
          variant="primary"
          onClick={async () => {
            const res = await fetch("/api/settings", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ section: "notifications", prefs: state.map(({ event_type, dashboard, telegram, email }) => ({ event_type, dashboard, telegram, email })) }),
            });
            if (!res.ok) return push({ variant: "error", title: "Erreur" });
            push({ variant: "success", title: ar ? "تم الحفظ" : "Préférences enregistrées" });
            onSaved();
          }}
        >
          {ar ? "حفظ" : "Enregistrer"}
        </Button>
      </CardHeader>
      <div className="overflow-x-auto">
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="border-b border-ink-100 bg-ink-50/60 text-[11px] uppercase text-ink-500">
              <th className="px-3 py-2 text-start font-medium">{ar ? "الحدث" : "Évènement"}</th>
              <th className="px-3 py-2 font-medium">{ar ? "اللوحة" : "Dashboard"}</th>
              <th className="px-3 py-2 font-medium">Telegram</th>
              <th className="px-3 py-2 font-medium">Email</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {state.map((p, i) => (
              <tr key={p.event_type}>
                <td className="px-3 py-2 text-ink-700">{p.label}</td>
                {(["dashboard", "telegram", "email"] as const).map((ch) => (
                  <td key={ch} className="px-3 py-2 text-center">
                    <div className="flex justify-center">
                      <Toggle checked={p[ch]} onChange={(v) => setState((s) => s.map((x, j) => (j === i ? { ...x, [ch]: v } : x)))} />
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="border-t border-ink-100 p-3 text-[11.5px] text-ink-500">
        {ar ? "لا نرسل إشعارا لكل حدث صغير — فقط ما يتطلب تدخلك." : "Nous n'envoyons pas de notification pour chaque évènement mineur — uniquement ce qui demande votre attention."}
      </div>
    </Card>
  );
}

function BillingSection({ data, ar }: { data: Settings; ar: boolean }) {
  const f = useFormat();
  const plan = data.plan;
  const usage = new Map(data.usage.map((u) => [u.metric, u.value]));
  const limits = [
    { metric: "orders", label: ar ? "الطلبات هذا الشهر" : "Commandes ce mois", max: Number(plan?.max_orders_month ?? 0) },
    { metric: "messages", label: ar ? "رسائل واتساب" : "Messages WhatsApp", max: Number(plan?.max_messages_month ?? 0) },
  ];
  return (
    <div className="space-y-3">
      <Card>
        <CardHeader>
          <CardTitle>{ar ? "اشتراكك" : "Votre abonnement"}</CardTitle>
          <Badge tone={data.subscription?.status === "active" ? "green" : "amber"} dot>{String(data.subscription?.status ?? "trial")}</Badge>
        </CardHeader>
        <CardBody className="space-y-3">
          <div className="flex items-baseline gap-2">
            <span className="text-[20px] font-semibold text-ink-900">{String(plan?.name ?? "—")}</span>
            <span className="text-[13px] text-ink-500">{f.money(Number(plan?.price_dzd ?? 0))} / {ar ? "شهر" : "mois"}</span>
          </div>
          {data.subscription?.current_period_end && (
            <p className="text-[12.5px] text-ink-500">{ar ? "ينتهي في" : "Échéance"} : {f.date(data.subscription.current_period_end)}</p>
          )}
          <div className="space-y-2.5">
            {limits.map((l) => {
              const used = usage.get(l.metric) ?? 0;
              const pct = l.max ? Math.min(100, Math.round((used / l.max) * 100)) : 0;
              return (
                <div key={l.metric}>
                  <div className="flex justify-between text-[12px]">
                    <span className="text-ink-600">{l.label}</span>
                    <span className="font-medium text-ink-800">{f.num(used)} / {f.num(l.max)}</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ink-100">
                    <div className={cn("h-full rounded-full", pct > 90 ? "bg-red-500" : pct > 70 ? "bg-amber-500" : "bg-brand-600")} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
          <p className="rounded-lg bg-ink-50 p-2.5 text-[12px] text-ink-600">
            {ar
              ? "تتم ترقية الاشتراك حاليا يدويا عبر فريقنا. تواصل معنا لتغيير خطتك."
              : "Les changements de plan sont activés manuellement par notre équipe. Contactez-nous pour évoluer."}
          </p>
        </CardBody>
      </Card>
    </div>
  );
}

function SecuritySection({ data, ar }: { data: Settings; ar: boolean }) {
  const f = useFormat();
  return (
    <div className="space-y-3">
      <Card>
        <CardHeader><CardTitle>{ar ? "الجلسة" : "Session"}</CardTitle></CardHeader>
        <CardBody className="space-y-3">
          <p className="text-[12.5px] text-ink-600">
            {ar ? "الجلسات مؤمّنة بملف تعريف ارتباط HttpOnly موقّع. يمكنك إنهاء جلستك الآن." : "Les sessions utilisent un cookie HttpOnly signé. Vous pouvez fermer votre session immédiatement."}
          </p>
          <form action="/api/auth/logout" method="post">
            <Button type="submit" variant="ghost" className="text-red-600 hover:bg-red-50"><LogOut className="h-3.5 w-3.5" /> {ar ? "تسجيل الخروج" : "Se déconnecter"}</Button>
          </form>
        </CardBody>
      </Card>
      <Card>
        <CardHeader><CardTitle>{ar ? "سجل النشاط" : "Journal d'activité"}</CardTitle></CardHeader>
        {!data.audits.length ? (
          <EmptyState icon={Shield} title={ar ? "لا يوجد نشاط" : "Aucune activité"} />
        ) : (
          <div className="divide-y divide-ink-100">
            {data.audits.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-[12.5px]">
                <div className="min-w-0">
                  <p className="truncate text-ink-800">{a.action}</p>
                  <p className="text-[11px] text-ink-400">{a.actor_label ?? "—"} · {a.ip ?? "—"}</p>
                </div>
                <span className="shrink-0 text-[11px] text-ink-400">{f.dateTime(a.created_at)}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
