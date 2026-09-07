import { redirect } from "next/navigation";
import { requireTenant, membershipsFor } from "@/server/auth/session";
import { get } from "@/server/db";
import { DashboardShell, type Me } from "@/components/dashboard/shell";
import { ToastProvider } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  let ctx;
  try {
    ctx = await requireTenant();
  } catch {
    redirect("/login");
  }

  const wa = await get<{ status: string }>("SELECT status FROM whatsapp_connections WHERE merchant_id = ?", [ctx.merchantId]);
  const dlv = await get<{ status: string }>("SELECT status FROM delivery_connections WHERE merchant_id = ? ORDER BY is_default DESC LIMIT 1", [ctx.merchantId]);
  const src = await get<{ status: string }>("SELECT status FROM integrations WHERE merchant_id = ? AND kind IN ('google_sheets','webhook') LIMIT 1", [ctx.merchantId]);

  const me: Me = {
    user: { id: ctx.user.id, full_name: ctx.user.full_name, email: ctx.user.email },
    merchant: {
      id: ctx.merchant.id,
      name: ctx.merchant.name,
      status: ctx.merchant.status,
      plan_code: ctx.merchant.plan_code,
      locale: ctx.merchant.locale,
      onboarding_completed_at: ctx.merchant.onboarding_completed_at,
    },
    role: ctx.role,
    memberships: (await membershipsFor(ctx.user.id)).map((m) => ({ merchant_id: m.merchant_id, merchant_name: m.merchant_name })),
    health: { whatsapp: wa?.status ?? "disconnected", delivery: dlv?.status ?? "disconnected", sources: src?.status ?? "disconnected" },
  };

  return (
    <ToastProvider>
      <DashboardShell me={me}>{children}</DashboardShell>
    </ToastProvider>
  );
}
