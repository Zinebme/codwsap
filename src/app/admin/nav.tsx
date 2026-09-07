"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/components/ui";

const LINKS = [
  { href: "/admin", label: "Vue d'ensemble", exact: true },
  { href: "/admin/merchants", label: "Marchands" },
  { href: "/admin/plans", label: "Plans" },
  { href: "/admin/observability", label: "Observabilité" },
  { href: "/admin/logs", label: "Journaux" },
];

export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav className="hidden gap-1 md:flex">
      {LINKS.map((l) => {
        const active = l.exact ? pathname === l.href : pathname.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            className={cn("rounded-lg px-2.5 py-1.5 text-[13px]", active ? "bg-ink-900 font-medium text-white" : "text-ink-600 hover:bg-ink-100")}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
