"use client";

import type { FormEvent } from "react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { formatRatioAsPercent } from "@filmbench/shared";

import { PageContainer } from "../../../components/PageContainer";
import { apiBase, getAccessToken } from "../../../lib/api";
import { useFactoryPeriod } from "../../../lib/factory-period-context";

interface LineRow {
  id: string;
  line_code: string;
}

interface FilterOptions {
  line_types: string[];
  width_bands: string[];
  cohort_keys: string[];
}

interface BenchRow {
  line_code: string;
  line_type: string;
  width_band: string;
  kpi_code: string;
  direction: string;
  definition_unit: string;
  current_value: string | null;
  cohort_key: string;
  cohort_key_used: string | null;
  cohort_fallback_used: boolean;
  peer_sample_size: number | null;
  peer_min: string | null;
  peer_p25: string | null;
  peer_p50: string | null;
  peer_p75: string | null;
  peer_p90: string | null;
  best_practice_peer_value: string | null;
  gap_to_median_signed: string | null;
  gap_to_best_practice_signed: string | null;
  comparison_status: string;
  estimated_percentile: number | null;
  percentile_narrative: string;
  performance_band: string;
  confidence_score: number;
}

const BAND_STYLE: Record<string, string> = {
  leader: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
  average: "bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200",
  laggard: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  unknown: "bg-zinc-50 text-zinc-500 dark:bg-zinc-900 dark:text-zinc-500",
};

function formatMeasure(unit: string, raw: string | null): string {
  if (raw == null || raw === "") return "—";
  const n = Number(raw);
  if (Number.isNaN(n)) return raw;
  if (unit === "ratio") return formatRatioAsPercent(n);
  return n.toLocaleString(undefined, { maximumFractionDigits: 6 });
}

const WIDTH_LABELS: Record<string, string> = {
  WIDTH_UNKNOWN: "Width unknown",
  WIDTH_0_3999: "0–3999 mm",
  WIDTH_4000_7999: "4000–7999 mm",
  WIDTH_8000_10499: "8000–10499 mm",
  WIDTH_10500_PLUS: "10500+ mm",
};

export default function BenchmarkPage() {
  const { factoryId, periodId, selectedFactory } = useFactoryPeriod();
  const [lines, setLines] = useState<LineRow[]>([]);
  const [filterOpts, setFilterOpts] = useState<FilterOptions | null>(null);
  const [lineId, setLineId] = useState("");
  const [lineType, setLineType] = useState("");
  const [widthBand, setWidthBand] = useState("");
  const [cohortKey, setCohortKey] = useState("");
  const [comparisonStatus, setComparisonStatus] = useState("");
  const [rows, setRows] = useState<BenchRow[]>([]);
  const [selected, setSelected] = useState<BenchRow | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [lastExec, setLastExec] = useState<{
    entity_rows_written: number;
    cohort_fallback_count: number;
    duration_ms: number | null;
  } | null>(null);

  const querySuffix = useMemo(() => {
    const q = new URLSearchParams({
      reporting_period_id: periodId,
    });
    if (lineId) q.set("line_id", lineId);
    if (lineType) q.set("line_type", lineType);
    if (widthBand) q.set("width_band", widthBand);
    if (cohortKey) q.set("cohort_key", cohortKey);
    if (comparisonStatus) q.set("comparison_status", comparisonStatus);
    return q.toString();
  }, [periodId, lineId, lineType, widthBand, cohortKey, comparisonStatus]);

  const loadMeta = useCallback(() => {
    const token = getAccessToken();
    if (!token || !factoryId || !periodId) return;
    void fetch(`${apiBase}/v1/factories/${factoryId}/lines`, {
      headers: { authorization: `Bearer ${token}` },
    })
      .then((r) => r.json() as Promise<{ lines?: LineRow[] }>)
      .then((d) => setLines(d.lines ?? []))
      .catch(() => setLines([]));
    void fetch(
      `${apiBase}/v1/factories/${factoryId}/benchmark-comparison/filter-options?reporting_period_id=${periodId}`,
      { headers: { authorization: `Bearer ${token}` } },
    )
      .then((r) => r.json() as Promise<FilterOptions & { error?: string }>)
      .then((d) => {
        if (d.error) return;
        setFilterOpts({
          line_types: d.line_types ?? [],
          width_bands: d.width_bands ?? [],
          cohort_keys: d.cohort_keys ?? [],
        });
      })
      .catch(() => setFilterOpts(null));
  }, [factoryId, periodId]);

  useEffect(() => {
    void Promise.resolve().then(() => loadMeta());
  }, [loadMeta]);

  async function onLoad(e: FormEvent) {
    e.preventDefault();
    const token = getAccessToken();
    if (!token || !factoryId || !periodId) {
      setMessage("Select factory and period in the top bar.");
      return;
    }
    setLoading(true);
    setMessage(null);
    setSelected(null);
    try {
      const res = await fetch(
        `${apiBase}/v1/factories/${factoryId}/benchmark-comparison?${querySuffix}`,
        { headers: { authorization: `Bearer ${token}` } },
      );
      const data = (await res.json()) as {
        benchmark_rows?: BenchRow[];
        error?: string;
      };
      if (!res.ok) {
        setMessage(data.error ?? `request_failed_${res.status}`);
        setRows([]);
        return;
      }
      setRows(data.benchmark_rows ?? []);
      if (!data.benchmark_rows?.length) {
        setMessage("No rows for these filters.");
      }
    } catch {
      setMessage("network_error");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  async function onRefreshBenchmarks() {
    const token = getAccessToken();
    if (!token || !factoryId || !periodId) {
      setMessage("Select factory and period in the top bar.");
      return;
    }
    setRefreshing(true);
    setMessage(null);
    try {
      const res = await fetch(
        `${apiBase}/v1/factories/${factoryId}/benchmark/refresh`,
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${token}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            reporting_period_id: periodId,
            line_id: lineId || null,
          }),
        },
      );
      const data = (await res.json()) as {
        error?: string;
        execution?: {
          entity_rows_written: number;
          cohort_fallback_count: number;
          duration_ms: number | null;
        };
      };
      if (!res.ok) {
        setMessage(data.error ?? `refresh_failed_${res.status}`);
        return;
      }
      if (data.execution) setLastExec(data.execution);
      setMessage(
        `Benchmark refreshed: ${data.execution?.entity_rows_written ?? 0} entity rows, ${data.execution?.cohort_fallback_count ?? 0} cohort fallbacks.`,
      );
    } catch {
      setMessage("network_error");
    } finally {
      setRefreshing(false);
    }
  }

  async function downloadCsv() {
    const token = getAccessToken();
    if (!token || !factoryId) return;
    const res = await fetch(
      `${apiBase}/v1/factories/${factoryId}/benchmark-comparison/export?${querySuffix}`,
      { headers: { authorization: `Bearer ${token}` } },
    );
    if (!res.ok) {
      setMessage(`export_failed_${res.status}`);
      return;
    }
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "benchmark.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const noDashboard = Boolean(
    selectedFactory && !selectedFactory.can_view_dashboard,
  );

  return (
    <PageContainer
      title="Benchmark explorer"
      subtitle="Peer comparison with performance bands, confidence scores, and cohort fallback (Sprint 23)."
    >
      {noDashboard ? (
        <p className="mb-4 text-sm text-amber-800 dark:text-amber-200">
          Dashboard access required for benchmark data.
        </p>
      ) : null}

      <form
        onSubmit={(e) => void onLoad(e)}
        className="mb-6 grid gap-3 rounded-xl border border-zinc-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-3 dark:border-zinc-800 dark:bg-zinc-900"
      >
        <label className="flex flex-col gap-1 text-sm">
          Line
          <select
            className="rounded-md border border-zinc-300 px-2 py-1.5 dark:border-zinc-600 dark:bg-black"
            value={lineId}
            onChange={(e) => setLineId(e.target.value)}
          >
            <option value="">All lines</option>
            {lines.map((l) => (
              <option key={l.id} value={l.id}>
                {l.line_code}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Line type
          <select
            className="rounded-md border border-zinc-300 px-2 py-1.5 dark:border-zinc-600 dark:bg-black"
            value={lineType}
            onChange={(e) => setLineType(e.target.value)}
          >
            <option value="">Any</option>
            {filterOpts?.line_types.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Width band
          <select
            className="rounded-md border border-zinc-300 px-2 py-1.5 dark:border-zinc-600 dark:bg-black"
            value={widthBand}
            onChange={(e) => setWidthBand(e.target.value)}
          >
            <option value="">Any</option>
            {filterOpts?.width_bands.map((b) => (
              <option key={b} value={b}>
                {WIDTH_LABELS[b] ?? b}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm sm:col-span-2">
          Cohort key
          <select
            className="rounded-md border border-zinc-300 px-2 py-1.5 dark:border-zinc-600 dark:bg-black"
            value={cohortKey}
            onChange={(e) => setCohortKey(e.target.value)}
          >
            <option value="">Any</option>
            {filterOpts?.cohort_keys.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Comparison status
          <select
            className="rounded-md border border-zinc-300 px-2 py-1.5 dark:border-zinc-600 dark:bg-black"
            value={comparisonStatus}
            onChange={(e) => setComparisonStatus(e.target.value)}
          >
            <option value="">Any</option>
            <option value="ok">OK (peer sample ≥ 5)</option>
            <option value="insufficient_peer_sample">Insufficient sample</option>
          </select>
        </label>
        <div className="flex flex-wrap items-end gap-2 sm:col-span-2 lg:col-span-3">
          <button
            type="submit"
            disabled={loading || noDashboard}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
          >
            {loading ? "Loading…" : "Load comparison"}
          </button>
          <button
            type="button"
            disabled={refreshing || noDashboard}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm disabled:opacity-50 dark:border-zinc-600"
            onClick={() => void onRefreshBenchmarks()}
          >
            {refreshing ? "Refreshing…" : "Refresh benchmarks"}
          </button>
          <button
            type="button"
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600"
            onClick={() => void downloadCsv()}
          >
            Export CSV
          </button>
          <Link
            className="text-sm font-medium text-sky-700 underline dark:text-sky-400"
            href={
              lineId
                ? `/trends?factory_id=${factoryId}&line_id=${lineId}`
                : `/trends?factory_id=${factoryId}`
            }
          >
            Trends
          </Link>
          <Link
            className="text-sm font-medium text-sky-700 underline dark:text-sky-400"
            href={`/compare?factory_id=${factoryId}&reporting_period_id=${periodId}`}
          >
            Period compare
          </Link>
        </div>
      </form>

      {message ? (
        <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">{message}</p>
      ) : null}
      {lastExec ? (
        <p className="mb-4 text-xs text-zinc-500">
          Last run: {lastExec.entity_rows_written} rows · {lastExec.cohort_fallback_count}{" "}
          fallbacks
          {lastExec.duration_ms != null ? ` · ${lastExec.duration_ms} ms` : ""}
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white lg:col-span-2 dark:border-zinc-800 dark:bg-zinc-900">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 dark:border-zinc-700">
                <th className="px-3 py-2">Line</th>
                <th className="px-3 py-2">KPI</th>
                <th className="px-3 py-2">Yours</th>
                <th className="px-3 py-2">p50</th>
                <th className="px-3 py-2">Gap</th>
                <th className="px-3 py-2">~Pct</th>
                <th className="px-3 py-2">Band</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={`${row.line_code}-${row.kpi_code}`}
                  className={`cursor-pointer border-b border-zinc-100 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800/50 ${
                    selected?.kpi_code === row.kpi_code &&
                    selected?.line_code === row.line_code
                      ? "bg-zinc-100 dark:bg-zinc-800"
                      : ""
                  }`}
                  onClick={() => setSelected(row)}
                >
                  <td className="px-3 py-2">{row.line_code}</td>
                  <td className="px-3 py-2 font-mono text-xs">{row.kpi_code}</td>
                  <td className="px-3 py-2">
                    {formatMeasure(row.definition_unit, row.current_value)}
                  </td>
                  <td className="px-3 py-2">
                    {formatMeasure(row.definition_unit, row.peer_p50)}
                  </td>
                  <td className="px-3 py-2">
                    {formatMeasure(
                      row.definition_unit,
                      row.gap_to_median_signed,
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {row.estimated_percentile != null
                      ? `${row.estimated_percentile}%`
                      : "—"}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`rounded px-1.5 py-0.5 text-xs font-medium ${BAND_STYLE[row.performance_band] ?? BAND_STYLE.unknown}`}
                    >
                      {row.performance_band}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <aside className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Distribution & narrative
          </h2>
          {selected ? (
            <div className="mt-3 space-y-3 text-sm text-zinc-700 dark:text-zinc-300">
              <p>
                <span className="font-medium">{selected.kpi_code}</span> on{" "}
                {selected.line_code} ({selected.line_type},{" "}
                {WIDTH_LABELS[selected.width_band] ?? selected.width_band})
              </p>
              <p className="text-zinc-600 dark:text-zinc-400">
                {selected.percentile_narrative}
              </p>
              <dl className="grid grid-cols-2 gap-2 font-mono text-xs">
                <dt>min</dt>
                <dd>{formatMeasure(selected.definition_unit, selected.peer_min)}</dd>
                <dt>p25</dt>
                <dd>{formatMeasure(selected.definition_unit, selected.peer_p25)}</dd>
                <dt>p50</dt>
                <dd>{formatMeasure(selected.definition_unit, selected.peer_p50)}</dd>
                <dt>p75</dt>
                <dd>{formatMeasure(selected.definition_unit, selected.peer_p75)}</dd>
                <dt>p90</dt>
                <dd>{formatMeasure(selected.definition_unit, selected.peer_p90)}</dd>
                <dt>best practice</dt>
                <dd>
                  {formatMeasure(
                    selected.definition_unit,
                    selected.best_practice_peer_value,
                  )}
                </dd>
                <dt>gap vs BP</dt>
                <dd>
                  {formatMeasure(
                    selected.definition_unit,
                    selected.gap_to_best_practice_signed,
                  )}
                </dd>
                <dt>peers (n)</dt>
                <dd>{selected.peer_sample_size ?? "—"}</dd>
                <dt>confidence</dt>
                <dd>{(selected.confidence_score * 100).toFixed(0)}%</dd>
                <dt>band</dt>
                <dd>{selected.performance_band}</dd>
              </dl>
              <p className="text-xs text-zinc-500">
                Cohort used: {selected.cohort_key_used ?? selected.cohort_key}
                {selected.cohort_fallback_used ? " (fallback)" : ""}
              </p>
            </div>
          ) : (
            <p className="mt-3 text-sm text-zinc-500">
              Select a row to see peer distribution and percentile copy.
            </p>
          )}
        </aside>
      </div>
    </PageContainer>
  );
}
