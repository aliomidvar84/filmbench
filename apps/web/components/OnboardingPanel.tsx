"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { apiBase, getAccessToken } from "../lib/api";

export interface ChecklistStep {
  id: string;
  label: string;
  done: boolean;
  href: string;
}

export interface OnboardingStatus {
  phase: "new" | "ingested" | "active";
  first_time_complete: boolean;
  monthly_close_complete: boolean;
  first_time_steps: ChecklistStep[];
  monthly_close_steps: ChecklistStep[];
  suggested_next_href: string;
}

function Checklist({
  title,
  steps,
}: {
  title: string;
  steps: ChecklistStep[];
}) {
  const done = steps.filter((s) => s.done).length;
  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          {title}
        </h2>
        <span className="text-xs text-zinc-500">
          {done}/{steps.length}
        </span>
      </div>
      <ul className="space-y-2">
        {steps.map((step) => (
          <li key={step.id} className="flex items-start gap-2 text-sm">
            <span
              className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-medium ${
                step.done
                  ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
                  : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800"
              }`}
              aria-hidden
            >
              {step.done ? "✓" : "·"}
            </span>
            <div>
              <Link
                href={step.href}
                className={
                  step.done
                    ? "text-zinc-500 line-through dark:text-zinc-400"
                    : "font-medium text-sky-700 underline dark:text-sky-400"
                }
              >
                {step.label}
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

const DISMISS_KEY = "filmbench_onboarding_dismissed";

export function OnboardingPanel({
  factoryId,
  periodId,
  compact = false,
}: {
  factoryId: string;
  periodId?: string;
  compact?: boolean;
}) {
  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void Promise.resolve().then(() => {
      if (typeof window !== "undefined") {
        setDismissed(localStorage.getItem(DISMISS_KEY) === "1");
      }
    });
  }, []);

  const load = useCallback(() => {
    const token = getAccessToken();
    if (!token || !factoryId) return;
    setLoading(true);
    setLoadError(null);
    const qs = periodId
      ? `?reporting_period_id=${encodeURIComponent(periodId)}`
      : "";
    void fetch(
      `${apiBase}/v1/factories/${factoryId}/onboarding-status${qs}`,
      { headers: { authorization: `Bearer ${token}` } },
    )
      .then((r) => r.json() as Promise<OnboardingStatus & { error?: string }>)
      .then((d) => {
        if (d.error) {
          setStatus(null);
          setLoadError(d.error);
          return;
        }
        if (d.phase) {
          setStatus(d);
          setLoadError(null);
        }
      })
      .catch(() => {
        setStatus(null);
        setLoadError("Could not load checklist.");
      })
      .finally(() => setLoading(false));
  }, [factoryId, periodId]);

  useEffect(() => {
    void Promise.resolve().then(() => load());
  }, [load]);

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, "1");
    setDismissed(true);
  }

  if (dismissed && compact) return null;
  if (loading && !status) {
    return (
      <p className="text-sm text-zinc-500">Loading getting-started checklist…</p>
    );
  }
  if (!status) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-amber-800 dark:text-amber-200">
          {loadError
            ? `Checklist unavailable (${loadError}).`
            : "Checklist unavailable."}
        </p>
        <button
          type="button"
          onClick={() => load()}
          className="text-sm text-zinc-600 underline dark:text-zinc-400"
        >
          Retry
        </button>
      </div>
    );
  }

  const showBanner =
    !dismissed &&
    (status.phase === "new" || !status.monthly_close_complete);

  if (compact && !showBanner) return null;

  if (compact && showBanner) {
    return (
      <div className="mb-6 rounded-xl border border-sky-200 bg-sky-50 p-4 dark:border-sky-900 dark:bg-sky-950/40">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-sky-900 dark:text-sky-100">
              {status.phase === "new"
                ? "Welcome — start by uploading your first month of data."
                : "Monthly close in progress — finish the checklist."}
            </p>
            <Link
              href={status.suggested_next_href}
              className="mt-1 inline-block text-sm font-medium text-sky-700 underline dark:text-sky-300"
            >
              Continue →
            </Link>
            <Link
              href={`/getting-started?factory_id=${factoryId}&reporting_period_id=${periodId}`}
              className="ml-3 text-sm text-zinc-600 underline dark:text-zinc-400"
            >
              Full checklist
            </Link>
          </div>
          <button
            type="button"
            onClick={dismiss}
            className="text-xs text-zinc-500 underline"
          >
            Dismiss
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {showBanner ? (
        <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 dark:border-sky-900 dark:bg-sky-950/40">
          <p className="text-sm text-sky-900 dark:text-sky-100">
            {status.phase === "new"
              ? "No production data yet. Follow the first-time path below."
              : status.monthly_close_complete
                ? "This period is fully closed. You can still review benchmarks and trends."
                : "Use the monthly close checklist before sharing results with leadership."}
          </p>
          <Link
            href={status.suggested_next_href}
            className="mt-2 inline-block rounded-md bg-sky-800 px-3 py-1.5 text-sm font-medium text-white dark:bg-sky-200 dark:text-sky-900"
          >
            Suggested next step
          </Link>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Checklist title="First-time setup" steps={status.first_time_steps} />
        <Checklist title="Monthly close" steps={status.monthly_close_steps} />
      </div>

      <button
        type="button"
        onClick={() => load()}
        className="text-sm text-zinc-600 underline dark:text-zinc-400"
      >
        Refresh status
      </button>
    </div>
  );
}
