"use client";

import { SiteShell, useLocale } from "@/components/marketing/site";
import { ToastProvider } from "@/components/ui";

export function MarketingShell({ children }: { children: React.ReactNode }) {
  const locale = useLocale();
  return (
    <ToastProvider>
      <SiteShell locale={locale}>{children}</SiteShell>
    </ToastProvider>
  );
}
