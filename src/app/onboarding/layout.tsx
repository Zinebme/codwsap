import { redirect } from "next/navigation";
import { requireTenant } from "@/server/auth/session";
import { ToastProvider } from "@/components/ui";
import { DashLocaleProvider } from "@/components/dashboard/locale";

export const dynamic = "force-dynamic";

export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  try {
    await requireTenant();
  } catch {
    redirect("/login");
  }
  return (
    <ToastProvider>
      <DashLocaleProvider>
        <div className="min-h-dvh bg-ink-50">{children}</div>
      </DashLocaleProvider>
    </ToastProvider>
  );
}
