"use client";

import type { FormEvent } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { formatRatioAsPercent } from "@filmbench/shared";

import { apiBase, getAccessToken } from "../../../lib/api";
import { useFactoryPeriod } from "../../../lib/factory-period-context";

interface LineRow {
  id: string;
  line_code: string;
}

interface PeriodRow {
  id: string;
  period_end: string;
  label: string | null;
}

interface CompareRow {
  kpi_code: string;
  kpi_name: string;
  definition_unit: string;
  direction: string;
  current_value: string | null;
  prior_value: string | null;
  delta_absolute: string | null;
  delta_percent: string | null;
  trend: string;
}

function formatMeasure(unit: string, raw: string | null): string {
  if (raw == null || raw === "") return "—";
  const n = Number(raw);
  if (Number.isNaN(n)) return raw;
  if (unit === "ratio") return formatRatioAsPercent(n);
  return n.toLocaleString(undefined, { maximumFractionDigits: 6 });
}

function formatDeltaPct(raw: string | null): string {
  if (raw == null || raw === "") return "—";
  const n = Number(raw);
  if (Number.isNaN(n)) return raw;
  return formatRatioAsPercent(n);
}

const TREND_CLASS: Record<string, string> = {
  improved: "text-emerald-700 dark:text-emerald-400",
  worsened: "text-red-700 dark:text-red-400",
  unchanged: "text-zinc-500",
  no_prior: "text-zinc-400",
  no_current: "text-zinc-400",
};

export default function ComparePage() {
  const { factories, factoryId, setFactoryId, authMessage } =
    useFactoryPeriod();
  const [lines, setLines] = useState<LineRow[]>([]);
  const [periods, setPeriods] = useState<PeriodRow[]>([]);
  const [lineId, setLineId] = useState("");
  const [currentPeriodId, setCurrentPeriodId] = useState("");
  const [priorPeriodId, setPriorPeriodId] = useState("");
  const [priorLabel, setPriorLabel] = useState<string | null>(null);
  const [rows, setRows] = useState<CompareRow[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const dashboardFactories = useMemo(
    () => factories.filter((f) => f.can_view_dashboard),
    [factories],
  );

  const loadMeta = useCallback(() => {
    const token = getAccessToken();
    if (!token || !factoryId) return;
    void fetch(`${apiBase}/v1/factories/${factoryId}/lines`, {
      headers: { authorization: `Bearer ${token}` },
    })
      .then((r) => r.json() as Promise<{ lines?: LineRow[] }>)
      .then((d) => {
        const ls = d.lines ?? [];
        setLines(ls);
        setLineId(ls[0]?.id ?? "");
      })
      .catch(() => setLines([]));
    void fetch(`${apiBase}/v1/factories/${factoryId}/reporting-periods`, {
      headers: { authorization: `Bearer ${token}` },
    })
      .then((r) => r.json() as Promise<{ reporting_periods?: PeriodRow[] }>)
      .then((d) => {
        const pr = d.reporting_periods ?? [];
        setPeriods(pr);
        setCurrentPeriodId(pr[0]?.id ?? "");
      })
      .catch(() => {
        setPeriods([]);
        setCurrentPeriodId("");
      });
  }, [factoryId]);

  useEffect(() => {
    void Promise.resolve().then(() => {
      loadMeta();
    });
  }, [loadMeta]);

  async function onLoad(e: FormEvent) {
    e.preventDefault();
    const token = getAccessToken();
    if (!token || !factoryId || !lineId || !currentPeriodId) {
      setMessage("Pick factory, line, and current period.");
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      const qs = new URLSearchParams({
        line_id: lineId,
        current_period_id: currentPeriodId,
      });
      if (priorPeriodId) qs.set("prior_period_id", priorPeriodId);
      const res = await fetch(
        `${apiBase}/v1/factories/${factoryId}/kpi-period-comparison?${qs.toString()}`,
        { headers: { authorization: `Bearer ${token}` } },
      );
      const data = (await res.json()) as {
        error?: string;
        rows?: CompareRow[];
        prior_period?: PeriodRow | null;
        prior_period_auto_selected?: boolean;
      };
      if (!res.ok) {
        setMessage(data.error ?? `request_failed_${res.status}`);
        setRows([]);
        return;
      }
      setRows(data.rows ?? []);
      const pl = data.prior_period;
      setPriorLabel(
        pl
          ? `${pl.label ?? pl.period_end.slice(0, 10)}${data.prior_period_auto_selected ? " (auto)" : ""}`
          : "No prior period with data",
      );
      if (!(data.rows?.length ?? 0)) {
        setMessage("No KPI rows for the current period.");
      }
    } catch {
      setMessage("network_error");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  async function downloadCsv() {
    const token = getAccessToken();
    if (!token || !factoryId || !lineId || !currentPeriodId) return;
    const qs = new URLSearchParams({
      line_id: lineId,
      current_period_id: currentPeriodId,
    });
    if (priorPeriodId) qs.set("prior_period_id", priorPeriodId);
    const res = await fetch(
      `${apiBase}/v1/factories/${factoryId}/kpi-period-comparison/export?${qs.toString()}`,
      { headers: { authorization: `Bearer ${token}` } },
    );
    if (!res.ok) {
      setMessage("export_failed");
      return;
    }
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "period-compare.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="flex min-h-full flex-col items-center bg-zinc-50 px-4 py-12 dark:bg-black">
      <div className="w-full max-w-6xl rounded-xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <h1 className="text-xl font-semibold">Period-over-period comparison</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Sprint 14 — compare each KPI on a line between two monthly periods.
          Leave prior period empty to use the latest earlier month with data.
        </p>
        <div className="mt-4 flex flex-wrap gap-3 text-sm">
          <Link className="underline" href="/trends">
            Trends
          </Link>
          <Link className="underline" href="/overview">
            Overview
          </Link>
          <Link className="underline" href="/">
            Home
          </Link>
        </div>

        <form
          className="mt-6 flex flex-col gap-4 border-t border-zinc-200 pt-6 dark:border-zinc-800"
          onSubmit={onLoad}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Factory</span>
              <select
                className="rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-black"
                value={factoryId}
                onChange={(ev) => setFactoryId(ev.target.value)}
                required
              >
                <option value="" disabled>
                  Select…
                </option>
                {dashboardFactories.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.factory_name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Line</span>
              <select
                className="rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-black"
                value={lineId}
                onChange={(ev) => setLineId(ev.target.value)}
                required
              >
                <option value="" disabled>
                  Select line…
                </option>
                {lines.map((ln) => (
                  <option key={ln.id} value={ln.id}>
                    {ln.line_code}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Current period</span>
              <select
                className="rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-black"
                value={currentPeriodId}
                onChange={(ev) => setCurrentPeriodId(ev.target.value)}
                required
              >
                <option value="" disabled>
                  Select…
                </option>
                {periods.map((p) => (
                  <option key={p.id} value={p.id}>
                    {(p.label ?? p.period_end).slice(0, 10)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Prior period (optional)</span>
              <select
                className="rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-black"
                value={priorPeriodId}
                onChange={(ev) => setPriorPeriodId(ev.target.value)}
              >
                <option value="">Auto (previous month)</option>
                {periods
                  .filter((p) => p.id !== currentPeriodId)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {(p.label ?? p.period_end).slice(0, 10)}
                    </option>
                  ))}
              </select>
            </label>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={loading || !factoryId || !lineId || !currentPeriodId}
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
            >
              {loading ? "Loading…" : "Compare periods"}
            </button>
            <button
              type="button"
              disabled={!rows.length}
              className="rounded-md border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-600"
              onClick={() => void downloadCsv()}
            >
              Download CSV
            </button>
          </div>
        </form>

        {priorLabel ? (
          <p className="mt-4 text-xs text-zinc-500">Prior period: {priorLabel}</p>
        ) : null}

        {authMessage || message ? (
          <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
            {authMessage ?? message}
          </p>
        ) : null}

        {rows.length > 0 ? (
          <div className="mt-6 overflow-x-auto">
            <table className="min-w-full text-left text-xs">
              <thead>
                <tr className="border-b border-zinc-300 dark:border-zinc-600">
                  <th className="py-2 pr-3">KPI</th>
                  <th className="py-2 pr-3">Current</th>
                  <th className="py-2 pr-3">Prior</th>
                  <th className="py-2 pr-3">Δ</th>
                  <th className="py-2 pr-3">Δ %</th>
                  <th className="py-2">Trend</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.kpi_code}
                    className="border-b border-zinc-100 dark:border-zinc-800"
                  >
                    <td className="py-2 pr-3 font-mono">{row.kpi_code}</td>
                    <td className="py-2 pr-3">
                      {formatMeasure(row.definition_unit, row.current_value)}
                    </td>
                    <td className="py-2 pr-3">
                      {formatMeasure(row.definition_unit, row.prior_value)}
                    </td>
                    <td className="py-2 pr-3">
                      {formatMeasure(row.definition_unit, row.delta_absolute)}
                    </td>
                    <td className="py-2 pr-3">
                      {formatDeltaPct(row.delta_percent)}
                    </td>
                    <td
                      className={`py-2 font-mono ${TREND_CLASS[row.trend] ?? ""}`}
                    >
                      {row.trend}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </div>
  );
}
