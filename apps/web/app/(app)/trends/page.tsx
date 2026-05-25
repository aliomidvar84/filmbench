"use client";

import type { FormEvent } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { formatRatioAsPercent } from "@filmbench/shared";

import { apiBase, getAccessToken } from "../../../lib/api";
import { useFactoryPeriod } from "../../../lib/factory-period-context";

const KPI_OPTIONS = [
  "OEE",
  "SCRAP_RATE",
  "YIELD_RATE",
  "THROUGHPUT_KG_H",
  "DOWNTIME_RATIO",
  "AVAILABILITY",
  "PERFORMANCE",
  "QUALITY",
  "ENERGY_PER_KG",
  "ENERGY_COST_PER_KG",
  "COST_PER_KG",
  "MATERIAL_COST_RATIO",
  "CONVERSION_COST_PER_KG",
  "REWORK_RATE",
  "STARTUP_WASTE_RATIO",
  "BREAK_RATE_PER_H",
] as const;

interface LineRow {
  id: string;
  line_code: string;
}

interface TrendPoint {
  reporting_period_id: string;
  period_end: string;
  label: string | null;
  kpi_value: string | null;
  calculation_status: string;
}

interface TrendSeries {
  kpi_code: string;
  kpi_name: string;
  definition_unit: string;
  points: TrendPoint[];
}

function formatMeasure(unit: string, raw: string | null): string {
  if (raw == null || raw === "") return "—";
  const n = Number(raw);
  if (Number.isNaN(n)) return raw;
  if (unit === "ratio") return formatRatioAsPercent(n);
  return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

function collectPeriodColumns(series: TrendSeries[]) {
  const map = new Map<
    string,
    { id: string; period_end: string; label: string | null }
  >();
  for (const s of series) {
    for (const p of s.points) {
      if (!map.has(p.reporting_period_id)) {
        map.set(p.reporting_period_id, {
          id: p.reporting_period_id,
          period_end: p.period_end,
          label: p.label,
        });
      }
    }
  }
  return [...map.values()].sort((a, b) => a.period_end.localeCompare(b.period_end));
}

function pointFor(series: TrendSeries, periodId: string): TrendPoint | undefined {
  return series.points.find((p) => p.reporting_period_id === periodId);
}

export default function TrendsPage() {
  const { factories, factoryId, setFactoryId, authMessage } =
    useFactoryPeriod();
  const [lines, setLines] = useState<LineRow[]>([]);
  const [lineId, setLineId] = useState("");
  const [selectedKpis, setSelectedKpis] = useState<Set<string>>(() => new Set());
  const [maxPeriods, setMaxPeriods] = useState(24);
  const [series, setSeries] = useState<TrendSeries[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const dashboardFactories = useMemo(
    () => factories.filter((f) => f.can_view_dashboard),
    [factories],
  );

  const periodColumns = useMemo(() => collectPeriodColumns(series), [series]);

  const loadLines = useCallback(() => {
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
  }, [factoryId]);

  useEffect(() => {
    void Promise.resolve().then(() => {
      loadLines();
    });
  }, [loadLines]);

  function toggleKpi(code: string) {
    setSelectedKpis((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  async function downloadTrendsCsv(): Promise<void> {
    const token = getAccessToken();
    if (!token || !factoryId || !lineId) {
      setMessage("Pick a factory and production line.");
      return;
    }
    const qs = new URLSearchParams({
      line_id: lineId,
      max_periods: String(maxPeriods),
    });
    if (selectedKpis.size > 0) {
      qs.set("kpi_codes", [...selectedKpis].join(","));
    }
    try {
      const res = await fetch(
        `${apiBase}/v1/factories/${factoryId}/kpi-trends/export?${qs.toString()}`,
        { headers: { authorization: `Bearer ${token}` } },
      );
      const ct = res.headers.get("content-type") ?? "";
      if (!res.ok) {
        if (ct.includes("application/json")) {
          const j = (await res.json()) as { error?: string };
          setMessage(j.error ?? `download_failed_${res.status}`);
        } else {
          setMessage(`download_failed_${res.status}`);
        }
        return;
      }
      const blob = await res.blob();
      const cd = res.headers.get("content-disposition");
      const m = cd?.match(/filename="([^"]+)"/);
      const name = m?.[1] ?? "trends.csv";
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = name;
      a.click();
      URL.revokeObjectURL(a.href);
      setMessage(null);
    } catch {
      setMessage("network_error");
    }
  }

  async function onLoad(e: FormEvent) {
    e.preventDefault();
    const token = getAccessToken();
    if (!token || !factoryId || !lineId) {
      setMessage("Pick a factory and production line.");
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      const qs = new URLSearchParams({
        line_id: lineId,
        max_periods: String(maxPeriods),
      });
      if (selectedKpis.size > 0) {
        qs.set("kpi_codes", [...selectedKpis].join(","));
      }
      const res = await fetch(
        `${apiBase}/v1/factories/${factoryId}/kpi-trends?${qs.toString()}`,
        { headers: { authorization: `Bearer ${token}` } },
      );
      const data = (await res.json()) as {
        error?: string;
        series?: TrendSeries[];
      };
      if (!res.ok) {
        setMessage(data.error ?? `request_failed_${res.status}`);
        setSeries([]);
        return;
      }
      setSeries(data.series ?? []);
      if (!(data.series?.length ?? 0)) {
        setMessage(
          "No trend data for this line yet. Upload monthly facts first.",
        );
      } else {
        setMessage(null);
      }
    } catch {
      setMessage("network_error");
      setSeries([]);
    } finally {
      setLoading(false);
    }
  }

  const noAccess =
    factories.length > 0 && dashboardFactories.length === 0;

  return (
    <div className="flex min-h-full flex-col items-center bg-zinc-50 px-4 py-12 dark:bg-black">
      <div className="w-full max-w-[95vw] rounded-xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 xl:max-w-6xl">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
          KPI trends over time
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Sprint 14 — month-on-month deltas on{" "}
          <Link className="underline" href="/compare">
            Period compare
          </Link>
          . Monthly series
          from{" "}
          <code className="rounded bg-zinc-100 px-1 text-xs dark:bg-zinc-900">
            kpi_results
          </code>{" "}
          (managers and admins). Optional KPI filter; empty selection loads all
          KPIs in the catalog for the line.
        </p>
        <div className="mt-4 flex flex-wrap gap-3 text-sm">
          <Link className="font-medium underline" href="/">
            Home
          </Link>
          <Link className="font-medium underline" href="/dashboard">
            Dashboard
          </Link>
          <Link className="font-medium underline" href="/compare">
            Period compare
          </Link>
          <Link className="font-medium underline" href="/data-quality">
            Data quality
          </Link>
          <Link className="font-medium underline" href="/login">
            Sign in
          </Link>
        </div>

        {noAccess ? (
          <p className="mt-6 text-sm text-amber-800 dark:text-amber-200">
            Need manager or admin on a factory to view trends.
          </p>
        ) : null}

        <form
          className="mt-6 flex flex-col gap-4 border-t border-zinc-200 pt-6 dark:border-zinc-800"
          onSubmit={onLoad}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Factory</span>
              <select
                className="rounded-md border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-black dark:text-zinc-50"
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
                className="rounded-md border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-black dark:text-zinc-50"
                value={lineId}
                onChange={(ev) => setLineId(ev.target.value)}
                required
              >
                <option value="" disabled>
                  {lines.length ? "Select line…" : "No lines"}
                </option>
                {lines.map((ln) => (
                  <option key={ln.id} value={ln.id}>
                    {ln.line_code}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="flex max-w-xs flex-col gap-1 text-sm">
            <span className="font-medium">Max monthly periods</span>
            <input
              className="rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-black"
              type="number"
              min={1}
              max={120}
              value={maxPeriods}
              onChange={(ev) => setMaxPeriods(Number(ev.target.value) || 24)}
            />
          </label>
          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
              KPI filter (optional)
            </legend>
            <div className="flex max-h-40 flex-wrap gap-2 overflow-y-auto rounded-md border border-zinc-200 p-2 dark:border-zinc-700">
              {KPI_OPTIONS.map((code) => (
                <label
                  key={code}
                  className="flex cursor-pointer items-center gap-1 font-mono text-xs"
                >
                  <input
                    type="checkbox"
                    checked={selectedKpis.has(code)}
                    onChange={() => toggleKpi(code)}
                  />
                  {code}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={loading || !factoryId || !lineId}
              className="max-w-xs rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
            >
              {loading ? "Loading…" : "Load trends"}
            </button>
            <button
              type="button"
              disabled={!factoryId || !lineId}
              className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-800 dark:border-zinc-600 dark:text-zinc-200"
              onClick={() => void downloadTrendsCsv()}
            >
              Download trends CSV
            </button>
          </div>
        </form>

        {(authMessage || message) && !series.length ? (
          <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
            {authMessage ?? message}
          </p>
        ) : null}

        {series.length > 0 && periodColumns.length > 0 ? (
          <div className="mt-8 overflow-x-auto">
            <table className="min-w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-zinc-300 dark:border-zinc-600">
                  <th className="sticky left-0 z-10 bg-white py-2 pr-3 font-medium dark:bg-zinc-950">
                    KPI
                  </th>
                  {periodColumns.map((col) => (
                    <th
                      key={col.id}
                      className="min-w-[5rem] px-1 py-2 font-medium text-zinc-700 dark:text-zinc-300"
                      title={col.period_end}
                    >
                      {(col.label ?? col.period_end).slice(0, 7)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {series.map((s) => (
                  <tr
                    key={s.kpi_code}
                    className="border-b border-zinc-100 dark:border-zinc-800"
                  >
                    <td className="sticky left-0 z-10 bg-white py-2 pr-3 font-mono dark:bg-zinc-950">
                      <span className="font-semibold">{s.kpi_code}</span>
                      <span className="ml-1 text-zinc-500 dark:text-zinc-400">
                        ({s.definition_unit})
                      </span>
                    </td>
                    {periodColumns.map((col) => {
                      const pt = pointFor(s, col.id);
                      return (
                        <td
                          key={col.id}
                          className="px-1 py-2 text-center text-zinc-800 dark:text-zinc-200"
                        >
                          {pt
                            ? formatMeasure(s.definition_unit, pt.kpi_value)
                            : "—"}
                          {pt && pt.calculation_status !== "ok" ? (
                            <span className="block text-[10px] text-amber-600 dark:text-amber-400">
                              {pt.calculation_status}
                            </span>
                          ) : null}
                        </td>
                      );
                    })}
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
