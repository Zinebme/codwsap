"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Menu, X, Globe, ArrowRight, Check } from "lucide-react";
import { cn, Button } from "@/components/ui";
import { makeT, type Locale, dir } from "@/lib/i18n";

export function useLocale(): Locale {
  const sp = useSearchParams();
  return sp.get("lang") === "ar" ? "ar" : "fr";
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-semibold text-ink-900", className)}>
      <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand-600 text-[13px] font-bold text-white">C</span>
      <span className="text-[15px] tracking-tight">CODWSAP</span>
    </span>
  );
}

export function LangSwitch({ locale }: { locale: Locale }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const other: Locale = locale === "fr" ? "ar" : "fr";
  return (
    <button
      onClick={() => {
        const params = new URLSearchParams(sp.toString());
        params.set("lang", other);
        router.push(`${pathname}?${params.toString()}`);
      }}
      className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 px-2.5 py-1.5 text-[12.5px] font-medium text-ink-600 hover:bg-ink-50"
    >
      <Globe className="h-3.5 w-3.5" />
      {other === "ar" ? "العربية" : "Français"}
    </button>
  );
}

const NAV = [
  { href: "/features", key: "nav.features" },
  { href: "/how-it-works", key: "nav.how" },
  { href: "/integrations", key: "nav.integrations" },
  { href: "/pricing", key: "nav.pricing" },
  { href: "/faq", key: "nav.faq" },
  { href: "/contact", key: "nav.contact" },
];

export function SiteShell({ children, locale }: { children: React.ReactNode; locale: Locale }) {
  const t = makeT(locale);
  const [open, setOpen] = React.useState(false);
  const pathname = usePathname();
  const withLang = (href: string) => (locale === "ar" ? `${href}?lang=ar` : href);

  React.useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = dir(locale);
  }, [locale]);

  return (
    <div className="min-h-screen bg-white" dir={dir(locale)}>
      <header className="sticky top-0 z-40 border-b border-ink-100 bg-white/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4">
          <Link href={withLang("/")}>
            <Logo />
          </Link>
          <nav className="hidden items-center gap-1 lg:flex">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={withLang(item.href)}
                className={cn(
                  "rounded-lg px-2.5 py-1.5 text-[13.5px] font-medium transition-colors",
                  pathname === item.href ? "text-brand-700" : "text-ink-600 hover:text-ink-900",
                )}
              >
                {t(item.key)}
              </Link>
            ))}
          </nav>
          <div className="ms-auto flex items-center gap-2">
            <div className="hidden sm:block">
              <LangSwitch locale={locale} />
            </div>
            <Link href={withLang("/login")} className="hidden sm:block">
              <Button size="sm">{t("nav.login")}</Button>
            </Link>
            <Link href={withLang("/signup")}>
              <Button size="sm" variant="primary">
                {t("nav.signup")}
              </Button>
            </Link>
            <button className="lg:hidden" onClick={() => setOpen((v) => !v)} aria-label="Menu">
              {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
        {open && (
          <div className="border-t border-ink-100 bg-white px-4 py-3 lg:hidden">
            <div className="flex flex-col gap-1">
              {NAV.map((item) => (
                <Link key={item.href} href={withLang(item.href)} onClick={() => setOpen(false)} className="rounded-lg px-2 py-2 text-sm text-ink-700 hover:bg-ink-50">
                  {t(item.key)}
                </Link>
              ))}
              <div className="mt-2 flex items-center gap-2">
                <LangSwitch locale={locale} />
                <Link href={withLang("/login")} className="flex-1">
                  <Button size="sm" className="w-full">
                    {t("nav.login")}
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        )}
      </header>

      <main>{children}</main>

      <footer className="mt-20 border-t border-ink-100 bg-ink-50/50">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Logo />
            <p className="mt-3 max-w-xs text-[13px] leading-relaxed text-ink-500">
              {locale === "ar"
                ? "منصة جزائرية لأتمتة طلبات الدفع عند الاستلام عبر واتساب."
                : "Plateforme algérienne d'automatisation des commandes COD sur WhatsApp."}
            </p>
          </div>
          <div>
            <p className="text-[12.5px] font-semibold text-ink-800">{locale === "ar" ? "المنتج" : "Produit"}</p>
            <ul className="mt-2.5 space-y-1.5 text-[13px] text-ink-500">
              {NAV.slice(0, 4).map((i) => (
                <li key={i.href}>
                  <Link href={withLang(i.href)} className="hover:text-ink-800">
                    {t(i.key)}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-[12.5px] font-semibold text-ink-800">{locale === "ar" ? "الدعم" : "Support"}</p>
            <ul className="mt-2.5 space-y-1.5 text-[13px] text-ink-500">
              <li>
                <Link href={withLang("/faq")} className="hover:text-ink-800">
                  {t("nav.faq")}
                </Link>
              </li>
              <li>
                <Link href={withLang("/contact")} className="hover:text-ink-800">
                  {t("nav.contact")}
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <p className="text-[12.5px] font-semibold text-ink-800">{locale === "ar" ? "ابدأ الآن" : "Commencer"}</p>
            <Link href={withLang("/signup")}>
              <Button variant="primary" size="sm" className="mt-2.5">
                {t("nav.signup")} <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" />
              </Button>
            </Link>
          </div>
        </div>
        <div className="border-t border-ink-100 px-4 py-4">
          <p className="mx-auto max-w-6xl text-[12px] text-ink-400">© {new Date().getFullYear()} CODWSAP. {locale === "ar" ? "كل الحقوق محفوظة." : "Tous droits réservés."}</p>
        </div>
      </footer>
    </div>
  );
}

export function Section({ children, className, id }: { children: React.ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} className={cn("mx-auto max-w-6xl px-4 py-14 sm:py-16", className)}>
      {children}
    </section>
  );
}

export function SectionHead({ eyebrow, title, subtitle, center = true }: { eyebrow?: string; title: string; subtitle?: string; center?: boolean }) {
  return (
    <div className={cn("mb-9", center && "text-center")}>
      {eyebrow && <p className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-brand-600">{eyebrow}</p>}
      <h2 className="text-2xl font-semibold tracking-tight text-ink-900 sm:text-[28px]">{title}</h2>
      {subtitle && <p className={cn("mt-2.5 text-[15px] leading-relaxed text-ink-500", center && "mx-auto max-w-2xl")}>{subtitle}</p>}
    </div>
  );
}

export function CheckItem({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5 text-[13.5px] text-ink-600">
      <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
      <span>{children}</span>
    </li>
  );
}
