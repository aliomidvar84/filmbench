"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import {
  InsightImpactCalculator,
  type ImpactEstimateDto,
} from "../../../components/InsightImpactCalculator";
import { PageContainer } from "../../../components/PageContainer";
import { apiBase, getAccessToken } from "../../../lib/api";
import { useFactoryPeriod } from "../../../lib/factory-period-context";

interface InsightRow {
  id: string;
  line_id: string | null;
  line_code: string | null;
  rule_code: string;
  severity: string;
  priority_score: string;
  title: string;
  body: string;
  kpi_code: string | null;
  impact_estimate: ImpactEstimateDto;
  metadata: {
    gap_to_median_signed?: string;
    gap_to_target_signed?: string;
    definition_unit?: string;
  } | null;
  created_at: string;
}

function gapFromInsight(ins: InsightRow): number | null {
  const raw =
    ins.metadata?.gap_to_median_signed ?? ins.metadata?.gap_to_target_signed;
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

const SEVERITY_CLASS: Record<string, string> = {
  critical: "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200",
  warning: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  info: "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200",
};

export default function InsightsPage() {
  const { factoryId, periodId, selectedFactory } = useFactoryPeriod();
  const [insights, setInsights] = useState<InsightRow[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(() => {
    const token = getAccessToken();
    if (!token || !factoryId || !periodId) return;
    setLoading(true);
    const q = new URLSearchParams({ reporting_period_id: periodId });
    void fetch(`${apiBase}/v1/factories/${factoryId}/insights?${q}`, {
      headers: { authorization: `Bearer ${token}` },
    })
      .then((r) => r.json() as Promise<{ insights?: InsightRow[]; error?: string }>)
      .then((d) => {
        if (d.error) {
          setMessage(d.error);
          setInsights([]);
          return;
        }
        setInsights(d.insights ?? []);
        setMessage(
          d.insights?.length
            ? null
            : "No insights yet — run Refresh to evaluate rules.",
        );
      })
      .catch(() => setMessage("network_error"))
      .finally(() => setLoading(false));
  }, [factoryId, periodId]);

  useEffect(() => {
    void Promise.resolve().then(() => load());
  }, [load]);

  async function onRefresh() {
    const token = getAccessToken();
    if (!token || !factoryId || !periodId) {
      setMessage("Select factory and period in the top bar.");
      return;
    }
    setRefreshing(true);
    setMessage(null);
    try {
      const res = await fetch(
        `${apiBase}/v1/factories/${factoryId}/insights/refresh`,
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${token}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({ reporting_period_id: periodId }),
        },
      );
      const data = (await res.json()) as {
        error?: string;
        inserted?: number;
        critical_count?: number;
      };
      if (!res.ok) {
        setMessage(data.error ?? `refresh_failed_${res.status}`);
        return;
      }
      setMessage(
        `Generated ${data.inserted ?? 0} insight(s) (${data.critical_count ?? 0} critical).`,
      );
      load();
    } catch {
      setMessage("network_error");
    } finally {
      setRefreshing(false);
    }
  }

  const noDashboard = Boolean(
    selectedFactory && !selectedFactory.can_view_dashboard,
  );

  return (
    <PageContainer
      title="Insights"
      subtitle="Rule-based opportunities with what-if impact calculator (Sprint 19 + 28)."
    >
      <div className="mb-4 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={refreshing || noDashboard}
          onClick={() => void onRefresh()}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {refreshing ? "Evaluating rules…" : "Refresh insights"}
        </button>
        <Link
          href={`/benchmark?factory_id=${factoryId}&reporting_period_id=${periodId}`}
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600"
        >
          Benchmark
        </Link>
        <Link
          href={`/actions?factory_id=${factoryId}`}
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600"
        >
          Actions
        </Link>
        <Link
          href={`/targets?factory_id=${factoryId}&reporting_period_id=${periodId}`}
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600"
        >
          Targets
        </Link>
      </div>

      {message ? (
        <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">{message}</p>
      ) : null}
      {loading ? <p className="text-sm text-zinc-500">Loading…</p> : null}

      <ul className="space-y-3">
        {insights.map((ins) => (
          <li
            key={ins.id}
            className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <span
                  className={`rounded px-2 py-0.5 text-xs font-medium ${SEVERITY_CLASS[ins.severity] ?? SEVERITY_CLASS.info}`}
                >
                  {ins.severity}
                </span>
                <span className="ml-2 text-xs text-zinc-500">
                  {ins.rule_code} · priority {ins.priority_score}
                  {ins.line_code ? ` · ${ins.line_code}` : ""}
                </span>
                <h2 className="mt-2 font-medium text-zinc-900 dark:text-zinc-100">
                  {ins.title}
                </h2>
              </div>
              {ins.kpi_code && ins.line_id ? (
                <Link
                  href={`/actions?factory_id=${factoryId}&source_kind=below_peer_median&kpi_code=${ins.kpi_code}&line_id=${ins.line_id}&reporting_period_id=${periodId}&title=${encodeURIComponent(ins.title)}`}
                  className="text-sm font-medium text-sky-700 underline dark:text-sky-400"
                >
                  Track as action
                </Link>
              ) : null}
            </div>
            <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">{ins.body}</p>
            {ins.kpi_code ? (
              <InsightImpactCalculator
                factoryId={factoryId}
                kpiCode={ins.kpi_code}
                gapSigned={gapFromInsight(ins)}
                unit={ins.metadata?.definition_unit ?? "ratio"}
                storedEstimate={ins.impact_estimate}
              />
            ) : ins.impact_estimate?.narrative ? (
              <p className="mt-2 text-xs text-zinc-500">
                Impact: {ins.impact_estimate.narrative}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </PageContainer>
  );
}
