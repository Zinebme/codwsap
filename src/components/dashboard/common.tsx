"use client";

import * as React from "react";
import { Phone, MessageCircle } from "lucide-react";
import { Badge, cn, Card } from "@/components/ui";
import { useDashLocale } from "./locale";
import {
  ORDER_STATUS_META, DELIVERY_STATUS_META, WA_AVAILABILITY_META, MESSAGE_STATUS_META,
  type OrderStatus, type DeliveryStatus, type WhatsappAvailability,
} from "@/lib/domain";
import { displayDzPhone, telHref, waHref } from "@/lib/phone";

export function OrderStatusBadge({ status }: { status: string }) {
  const { locale } = useDashLocale();
  const meta = ORDER_STATUS_META[status as OrderStatus];
  if (!meta) return <Badge tone="gray">{status}</Badge>;
  return <Badge tone={meta.tone} dot>{locale === "ar" ? meta.ar : meta.fr}</Badge>;
}

export function DeliveryStatusBadge({ status }: { status: string }) {
  const { locale } = useDashLocale();
  const meta = DELIVERY_STATUS_META[status as DeliveryStatus];
  if (!meta) return <Badge tone="gray">{status}</Badge>;
  return <Badge tone={meta.tone}>{locale === "ar" ? meta.ar : meta.fr}</Badge>;
}

export function WaAvailabilityBadge({ status }: { status: string }) {
  const { locale } = useDashLocale();
  const meta = WA_AVAILABILITY_META[(status ?? "unknown") as WhatsappAvailability] ?? WA_AVAILABILITY_META.unknown;
  return <Badge tone={meta.tone}>{locale === "ar" ? meta.ar : meta.fr}</Badge>;
}

export function MessageStatusBadge({ status }: { status: string }) {
  const { locale } = useDashLocale();
  const meta = MESSAGE_STATUS_META[status] ?? MESSAGE_STATUS_META.none;
  return <Badge tone={meta.tone}>{locale === "ar" ? meta.ar : meta.fr}</Badge>;
}

/** Visible call button — opens the phone dialer on mobile. */
export function CallButton({ phone, size = "sm" }: { phone?: string | null; size?: "sm" | "md" }) {
  if (!phone) return null;
  return (
    <a
      href={telHref(phone)}
      onClick={(e) => e.stopPropagation()}
      title={`Appeler ${displayDzPhone(phone)}`}
      className={cn(
        "inline-grid place-items-center rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 transition-colors hover:bg-emerald-100",
        size === "sm" ? "h-7 w-7" : "h-9 w-9",
      )}
    >
      <Phone className={size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"} />
    </a>
  );
}

export function WhatsappLinkButton({ phone, size = "sm" }: { phone?: string | null; size?: "sm" | "md" }) {
  if (!phone) return null;
  return (
    <a
      href={waHref(phone)}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      title="Ouvrir WhatsApp"
      className={cn(
        "inline-grid place-items-center rounded-lg border border-ink-200 bg-white text-ink-600 transition-colors hover:bg-ink-50",
        size === "sm" ? "h-7 w-7" : "h-9 w-9",
      )}
    >
      <MessageCircle className={size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"} />
    </a>
  );
}

export function PhoneCell({ phone, original }: { phone?: string | null; original?: string | null }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[12.5px] text-ink-600 tabular" dir="ltr">
        {displayDzPhone(phone) === "—" ? original ?? "—" : displayDzPhone(phone)}
      </span>
      <CallButton phone={phone} />
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-lg font-semibold tracking-tight text-ink-900 sm:text-xl">{title}</h1>
        {subtitle && <p className="mt-0.5 text-[13px] text-ink-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function ErrorState({ error, retry }: { error: string; retry?: () => void }) {
  const [open, setOpen] = React.useState(false);
  return (
    <Card className="border-red-200 bg-red-50/50 p-4">
      <p className="text-[13.5px] font-medium text-red-800">{error}</p>
      <div className="mt-2 flex items-center gap-3">
        {retry && (
          <button onClick={retry} className="text-[12.5px] font-medium text-red-700 underline">
            Réessayer
          </button>
        )}
        <button onClick={() => setOpen((v) => !v)} className="text-[12.5px] text-red-600/80 underline">
          Détails techniques
        </button>
      </div>
      {open && <pre className="mt-2 overflow-x-auto rounded-lg bg-white p-2 text-[11px] text-ink-500">{error}</pre>}
    </Card>
  );
}

export function KpiCard({ label, value, hint, tone, onClick, active }: { label: string; value: React.ReactNode; hint?: string; tone?: "green" | "red" | "amber" | "blue"; onClick?: () => void; active?: boolean }) {
  const Comp = onClick ? "button" : "div";
  return (
    <Comp
      onClick={onClick}
      className={cn(
        "card p-3 text-start transition-colors",
        onClick && "hover:border-brand-300 hover:bg-brand-50/30",
        active && "border-brand-400 bg-brand-50/50",
      )}
    >
      <p className="text-[11.5px] font-medium text-ink-500">{label}</p>
      <p
        className={cn(
          "mt-1 text-[19px] font-semibold tabular",
          tone === "green" ? "text-emerald-600" : tone === "red" ? "text-red-600" : tone === "amber" ? "text-amber-600" : "text-ink-900",
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-0.5 text-[11px] text-ink-400">{hint}</p>}
    </Comp>
  );
}
