import Link from "next/link";
import { redirect } from "next/navigation";
import { requireSuperAdmin } from "@/server/auth/session";
import { ToastProvider } from "@/components/ui";
import { AdminNav } from "./nav";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  let admin;
  try {
    admin = await requireSuperAdmin();
  } catch {
    redirect("/login?next=/admin");
  }

  return (
    <ToastProvider>
      <div className="min-h-dvh bg-ink-50" dir="ltr">
        <header className="sticky top-0 z-30 border-b border-ink-200 bg-white">
          <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-4 px-4">
            <Link href="/admin" className="flex items-center gap-2">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-ink-900 text-[12px] font-bold text-white">CW</span>
              <div className="leading-tight">
                <p className="text-[13px] font-semibold text-ink-900">Console d&apos;administration</p>
                <p className="text-[10.5px] text-ink-400">CODWSAP · super admin</p>
              </div>
            </Link>
            <AdminNav />
            <div className="ms-auto flex items-center gap-3">
              <span className="hidden text-[12px] text-ink-500 sm:block">{admin.email}</span>
              <Link href="/dashboard" className="text-[12.5px] font-medium text-brand-600 hover:underline">Espace marchand</Link>
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-[1400px] p-4">{children}</main>
      </div>
    </ToastProvider>
  );
}
