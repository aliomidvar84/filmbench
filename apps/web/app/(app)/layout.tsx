"use client";

import { Suspense, type ReactNode } from "react";

import { AppShell } from "../../components/AppShell";
import { FactoryPeriodProvider } from "../../lib/factory-period-context";

function ShellFallback() {
  return (
    <div className="flex min-h-full items-center justify-center p-12 text-sm text-zinc-500">
      Loading…
    </div>
  );
}

export default function AppSegmentLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<ShellFallback />}>
      <FactoryPeriodProvider>
        <AppShell>{children}</AppShell>
      </FactoryPeriodProvider>
    </Suspense>
  );
}
