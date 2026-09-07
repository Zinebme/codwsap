import { Suspense } from "react";
import { MarketingShell } from "./shell";

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="min-h-screen bg-white" />}>
      <MarketingShell>{children}</MarketingShell>
    </Suspense>
  );
}
