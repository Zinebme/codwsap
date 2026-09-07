"use client";

import * as React from "react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { X, ChevronLeft, ChevronRight, Loader2, Search } from "lucide-react";
import type { Tone } from "@/lib/domain";

export function cn(...inputs: unknown[]) {
  return twMerge(clsx(inputs as never));
}

/* ---------------------------------- Button -------------------------------- */
type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "success" | "outline";
  size?: "sm" | "md" | "lg" | "icon";
  loading?: boolean;
};

export function Button({ className, variant = "secondary", size = "md", loading, children, disabled, ...props }: ButtonProps) {
  const variants = {
    primary: "bg-brand-600 text-white hover:bg-brand-700 border-transparent shadow-sm",
    secondary: "bg-white text-ink-700 hover:bg-ink-50 border-ink-200",
    outline: "bg-transparent text-ink-700 hover:bg-ink-50 border-ink-200",
    ghost: "bg-transparent text-ink-600 hover:bg-ink-100 border-transparent",
    danger: "bg-red-600 text-white hover:bg-red-700 border-transparent",
    success: "bg-emerald-600 text-white hover:bg-emerald-700 border-transparent",
  };
  const sizes = {
    sm: "h-8 px-2.5 text-[13px] gap-1.5",
    md: "h-9 px-3.5 text-sm gap-2",
    lg: "h-11 px-5 text-[15px] gap-2",
    icon: "h-9 w-9 justify-center",
  };
  return (
    <button
      className={cn(
        "inline-flex items-center rounded-[10px] border font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap",
        variants[variant],
        sizes[size],
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
      {children}
    </button>
  );
}

/* ---------------------------------- Card ---------------------------------- */
export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("card", className)} {...props} />;
}
export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex items-center justify-between gap-3 px-4 py-3 border-b border-ink-100", className)} {...props} />;
}
export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("text-[15px] font-semibold text-ink-800", className)} {...props} />;
}
export function CardBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-4", className)} {...props} />;
}

/* ---------------------------------- Badge --------------------------------- */
const TONES: Record<Tone, string> = {
  green: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  red: "bg-red-50 text-red-700 ring-red-600/20",
  orange: "bg-orange-50 text-orange-700 ring-orange-600/20",
  amber: "bg-amber-50 text-amber-800 ring-amber-600/20",
  blue: "bg-blue-50 text-blue-700 ring-blue-600/20",
  gray: "bg-ink-100 text-ink-600 ring-ink-300/50",
  violet: "bg-violet-50 text-violet-700 ring-violet-600/20",
  teal: "bg-teal-50 text-teal-700 ring-teal-600/20",
};

export function Badge({ tone = "gray", className, children, dot }: { tone?: Tone; className?: string; children: React.ReactNode; dot?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11.5px] font-medium ring-1 ring-inset whitespace-nowrap", TONES[tone], className)}>
      {dot && <span className={cn("h-1.5 w-1.5 rounded-full", tone === "green" ? "bg-emerald-500" : tone === "red" ? "bg-red-500" : tone === "amber" ? "bg-amber-500" : "bg-current opacity-60")} />}
      {children}
    </span>
  );
}

/* ---------------------------------- Input --------------------------------- */
export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...props }, ref) {
  return <input ref={ref} className={cn("field", className)} {...props} />;
});

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...props }, ref) {
  return <textarea ref={ref} className={cn("field min-h-24", className)} {...props} />;
});

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, ...props }, ref) {
  return <select ref={ref} className={cn("field appearance-none bg-white pe-8", className)} {...props} />;
});

export function Field({ label, hint, children, error }: { label?: string; hint?: string; children: React.ReactNode; error?: string }) {
  return (
    <div>
      {label && <label className="label">{label}</label>}
      {children}
      {hint && !error && <p className="mt-1 text-[11.5px] text-ink-400">{hint}</p>}
      {error && <p className="mt-1 text-[11.5px] text-red-600">{error}</p>}
    </div>
  );
}

export function SearchInput({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className={cn("relative", className)}>
      <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
      <input className="field ps-9" {...props} />
    </div>
  );
}

/* ---------------------------------- Drawer -------------------------------- */
export function Drawer({ open, onClose, title, subtitle, children, footer, width = "max-w-3xl" }: {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: string;
}) {
  React.useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", handler);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handler);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-ink-900/30" onClick={onClose} />
      <div className={cn("drawer-in relative flex h-full w-full flex-col bg-white shadow-2xl", width)}>
        <div className="flex items-start justify-between gap-4 border-b border-ink-100 px-4 py-3 sm:px-5">
          <div className="min-w-0">
            {title && <div className="truncate text-[15px] font-semibold text-ink-900">{title}</div>}
            {subtitle && <div className="mt-0.5 truncate text-xs text-ink-500">{subtitle}</div>}
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Fermer">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto">{children}</div>
        {footer && <div className="border-t border-ink-100 bg-ink-50/60 px-4 py-3 sm:px-5">{footer}</div>}
      </div>
    </div>
  );
}

/* ---------------------------------- Modal --------------------------------- */
export function Modal({ open, onClose, title, children, footer, width = "max-w-lg" }: {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: string;
}) {
  React.useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-ink-900/30" onClick={onClose} />
      <div className={cn("fade-in relative w-full rounded-t-2xl bg-white shadow-2xl sm:rounded-xl", width)}>
        <div className="flex items-center justify-between border-b border-ink-100 px-4 py-3">
          <h3 className="text-[15px] font-semibold text-ink-900">{title}</h3>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Fermer">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto p-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-ink-100 px-4 py-3">{footer}</div>}
      </div>
    </div>
  );
}

/* --------------------------------- Dropdown -------------------------------- */
export function Dropdown({ trigger, children, align = "end", className }: { trigger: React.ReactNode; children: React.ReactNode; align?: "start" | "end"; className?: string }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      <div onClick={() => setOpen((v) => !v)}>{trigger}</div>
      {open && (
        <div
          onClick={() => setOpen(false)}
          className={cn(
            "fade-in absolute z-40 mt-1.5 min-w-52 overflow-hidden rounded-xl border border-ink-200 bg-white py-1 shadow-lg",
            align === "end" ? "end-0" : "start-0",
            className,
          )}
        >
          {children}
        </div>
      )}
    </div>
  );
}

export function DropdownItem({ className, icon: Icon, danger, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { icon?: React.ElementType; danger?: boolean }) {
  return (
    <button
      className={cn(
        "flex w-full items-center gap-2.5 px-3 py-2 text-start text-[13px] text-ink-700 hover:bg-ink-50 disabled:opacity-40",
        danger && "text-red-600 hover:bg-red-50",
        className,
      )}
      {...props}
    >
      {Icon && <Icon className="h-4 w-4 shrink-0 opacity-70" />}
      {props.children}
    </button>
  );
}

export function DropdownSeparator() {
  return <div className="my-1 h-px bg-ink-100" />;
}

/* ---------------------------------- Tabs ---------------------------------- */
export function Tabs({ tabs, value, onChange, className }: { tabs: { id: string; label: string; count?: number }[]; value: string; onChange: (id: string) => void; className?: string }) {
  return (
    <div className={cn("flex gap-1 overflow-x-auto border-b border-ink-200", className)}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={cn(
            "relative whitespace-nowrap px-3 py-2 text-[13px] font-medium transition-colors",
            value === tab.id ? "text-brand-700" : "text-ink-500 hover:text-ink-700",
          )}
        >
          {tab.label}
          {typeof tab.count === "number" && <span className="ms-1.5 rounded-full bg-ink-100 px-1.5 py-0.5 text-[11px] text-ink-600 tabular">{tab.count}</span>}
          {value === tab.id && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-brand-600" />}
        </button>
      ))}
    </div>
  );
}

/* -------------------------------- Empty state ------------------------------ */
export function EmptyState({ icon: Icon, title, description, action }: { icon?: React.ElementType; title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      {Icon && (
        <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-ink-100">
          <Icon className="h-5 w-5 text-ink-400" />
        </div>
      )}
      <p className="text-sm font-semibold text-ink-800">{title}</p>
      {description && <p className="mt-1 max-w-sm text-[13px] text-ink-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/* --------------------------------- Skeleton -------------------------------- */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton h-4 w-full", className)} />;
}

export function TableSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="divide-y divide-ink-100">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-4 px-4 py-3">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className={c === 0 ? "w-24" : c === cols - 1 ? "w-16" : "flex-1"} />
          ))}
        </div>
      ))}
    </div>
  );
}

/* -------------------------------- Pagination ------------------------------- */
export function Pagination({ page, pages, total, pageSize, onPage, onPageSize }: {
  page: number;
  pages: number;
  total: number;
  pageSize: number;
  onPage: (p: number) => void;
  onPageSize?: (n: number) => void;
}) {
  return (
    <div className="flex flex-col items-center justify-between gap-3 border-t border-ink-100 px-4 py-3 sm:flex-row">
      <p className="text-[12.5px] text-ink-500 tabular">
        {total.toLocaleString("fr-FR")} résultat{total > 1 ? "s" : ""} · page {page}/{pages}
      </p>
      <div className="flex items-center gap-2">
        {onPageSize && (
          <select className="field h-8 w-auto py-0 text-[12.5px]" value={pageSize} onChange={(e) => onPageSize(Number(e.target.value))}>
            {[25, 50, 100].map((n) => (
              <option key={n} value={n}>
                {n} / page
              </option>
            ))}
          </select>
        )}
        <Button size="icon" onClick={() => onPage(Math.max(1, page - 1))} disabled={page <= 1} aria-label="Précédent">
          <ChevronLeft className="h-4 w-4 rtl:rotate-180" />
        </Button>
        <Button size="icon" onClick={() => onPage(Math.min(pages, page + 1))} disabled={page >= pages} aria-label="Suivant">
          <ChevronRight className="h-4 w-4 rtl:rotate-180" />
        </Button>
      </div>
    </div>
  );
}

/* ---------------------------------- Toast ---------------------------------- */
type Toast = { id: number; title: string; description?: string; variant: "success" | "error" | "info" };
const ToastCtx = React.createContext<{ push: (t: Omit<Toast, "id">) => void }>({ push: () => {} });

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([]);
  const push = React.useCallback((t: Omit<Toast, "id">) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { ...t, id }]);
    setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), 4200);
  }, []);
  return (
    <ToastCtx.Provider value={{ push }}>
      {children}
      <div className="pointer-events-none fixed bottom-4 end-4 z-[100] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              "fade-in pointer-events-auto rounded-xl border bg-white px-3.5 py-3 shadow-lg",
              t.variant === "success" && "border-emerald-200",
              t.variant === "error" && "border-red-200",
              t.variant === "info" && "border-ink-200",
            )}
          >
            <div className="flex items-start gap-2.5">
              <span
                className={cn(
                  "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                  t.variant === "success" ? "bg-emerald-500" : t.variant === "error" ? "bg-red-500" : "bg-brand-500",
                )}
              />
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-ink-800">{t.title}</p>
                {t.description && <p className="mt-0.5 text-[12.5px] leading-snug text-ink-500">{t.description}</p>}
              </div>
              <button className="ms-auto text-ink-400 hover:text-ink-600" onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}>
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  return React.useContext(ToastCtx);
}

/* ------------------------------- Misc helpers ------------------------------ */
export function Stat({ label, value, hint, tone, icon: Icon }: { label: string; value: React.ReactNode; hint?: string; tone?: Tone; icon?: React.ElementType }) {
  return (
    <div className="card p-3.5">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[12px] font-medium text-ink-500">{label}</p>
        {Icon && <Icon className="h-4 w-4 text-ink-300" />}
      </div>
      <p className="mt-1.5 text-xl font-semibold text-ink-900 tabular">{value}</p>
      {hint && (
        <p className={cn("mt-0.5 text-[11.5px]", tone === "red" ? "text-red-600" : tone === "green" ? "text-emerald-600" : "text-ink-400")}>{hint}</p>
      )}
    </div>
  );
}

export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label?: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn("inline-flex items-center gap-2.5 disabled:opacity-50", label && "text-[13px] text-ink-700")}
    >
      <span className={cn("relative h-5 w-9 shrink-0 rounded-full transition-colors", checked ? "bg-brand-600" : "bg-ink-300")}>
        <span className={cn("absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all", checked ? "start-[1.125rem]" : "start-0.5")} />
      </span>
      {label}
    </button>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn("h-4 w-4 animate-spin text-ink-400", className)} />;
}
