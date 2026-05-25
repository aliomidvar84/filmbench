"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

import { PageContainer } from "../../../components/PageContainer";
import { OnboardingPanel } from "../../../components/OnboardingPanel";
import { useFactoryPeriod } from "../../../lib/factory-period-context";

export default function GettingStartedPage() {
  const pathname = usePathname();
  const { factoryId, periodId, selectedFactory, loading, periods, refreshPeriods } =
    useFactoryPeriod();

  useEffect(() => {
    if (factoryId && pathname === "/getting-started") {
      void refreshPeriods();
    }
  }, [factoryId, pathname, refreshPeriods]);

  const effectivePeriodId = periodId || periods[0]?.id || "";

  if (!selectedFactory?.can_view_dashboard) {
    return (
      <PageContainer
        title="Getting started"
        subtitle="First-time onboarding and monthly close checklist (Sprint 27)."
      >
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Dashboard access required.
        </p>
      </PageContainer>
    );
  }

  return (
    <PageContainer
      title="Getting started"
      subtitle="Upload → validate → overview → insights → report. Track progress per factory and period."
    >
      {loading ? (
        <p className="text-sm text-zinc-500">Loading factory context…</p>
      ) : factoryId ? (
        <OnboardingPanel
          factoryId={factoryId}
          periodId={effectivePeriodId || undefined}
        />
      ) : (
        <p className="text-sm text-zinc-500">
          Select a factory in the top bar to see your checklist with links to
          incomplete steps.
        </p>
      )}
    </PageContainer>
  );
}
