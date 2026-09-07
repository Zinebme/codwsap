"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/components/ui";
import { useDashLocale } from "@/components/dashboard/locale";

const TABS = [
  { href: "/dashboard/whatsapp", fr: "Aperçu", ar: "نظرة عامة", exact: true },
  { href: "/dashboard/whatsapp/conversations", fr: "Conversations", ar: "المحادثات" },
  { href: "/dashboard/whatsapp/templates", fr: "Templates", ar: "القوالب" },
  { href: "/dashboard/whatsapp/quality", fr: "Qualité WhatsApp", ar: "جودة واتساب" },
  { href: "/dashboard/whatsapp/logs", fr: "Journaux", ar: "سجل الرسائل" },
  { href: "/dashboard/whatsapp/settings", fr: "Paramètres", ar: "الإعدادات" },
];

export default function WhatsappLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { locale } = useDashLocale();
  return (
    <div className="space-y-3">
      <div className="flex gap-1 overflow-x-auto border-b border-ink-200">
        {TABS.map((tab) => {
          const active = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn("relative whitespace-nowrap px-3 py-2 text-[13px] font-medium", active ? "text-brand-700" : "text-ink-500 hover:text-ink-700")}
            >
              {locale === "ar" ? tab.ar : tab.fr}
              {active && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-brand-600" />}
            </Link>
          );
        })}
      </div>
      {children}
    </div>
  );
}
