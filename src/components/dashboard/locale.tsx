"use client";

import * as React from "react";
import { makeT, type Locale } from "@/lib/i18n";

type Ctx = { locale: Locale; setLocale: (l: Locale) => void; t: (k: string) => string };

export const LocaleContext = React.createContext<Ctx>({ locale: "fr", setLocale: () => {}, t: makeT("fr") });

export function useDashLocale() {
  return React.useContext(LocaleContext);
}

/** Locale-aware helpers used across dashboard pages. */
export function useFormat() {
  const { locale } = useDashLocale();
  const intl = locale === "ar" ? "ar-DZ" : "fr-FR";
  return {
    locale,
    money: (v: number) => `${new Intl.NumberFormat(intl, { maximumFractionDigits: 0 }).format(v || 0)} DA`,
    num: (v: number) => new Intl.NumberFormat(intl).format(v || 0),
    date: (v?: string | null) => (v ? new Date(v.includes("T") ? v : `${v.replace(" ", "T")}Z`).toLocaleDateString(intl, { day: "2-digit", month: "short", year: "numeric" }) : "—"),
    dateTime: (v?: string | null) =>
      v ? new Date(v.includes("T") ? v : `${v.replace(" ", "T")}Z`).toLocaleString(intl, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—",
    relative: (v?: string | null) => {
      if (!v) return "—";
      const ts = Date.parse(v.includes("T") ? v : `${v.replace(" ", "T")}Z`);
      const diff = Math.round((ts - Date.now()) / 60000);
      const rtf = new Intl.RelativeTimeFormat(intl, { numeric: "auto" });
      const abs = Math.abs(diff);
      if (abs < 60) return rtf.format(diff, "minute");
      if (abs < 1440) return rtf.format(Math.round(diff / 60), "hour");
      return rtf.format(Math.round(diff / 1440), "day");
    },
  };
}

/** Standalone locale provider for shells that don't use DashboardShell (e.g. onboarding). */
export function DashLocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocale] = React.useState<Locale>("fr");
  React.useEffect(() => {
    const saved = window.localStorage.getItem("codwsap_locale") as Locale | null;
    if (saved === "ar" || saved === "fr") setLocale(saved);
  }, []);
  React.useEffect(() => {
    window.localStorage.setItem("codwsap_locale", locale);
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
  }, [locale]);
  const t = React.useMemo(() => makeT(locale), [locale]);
  return <LocaleContext.Provider value={{ locale, setLocale, t }}>{children}</LocaleContext.Provider>;
}
