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

interface TargetCatalogRow {
  kpi_code: string;
  kpi_name: string;
  definition_unit: string;
  direction: string;
  target_value: string | null;
  notes: string | null;
}

interface ComparisonRow {
  line_code: string;
  kpi_code: string;
  kpi_name: string;
  definition_unit: string;
  current_value: string | null;
  target_value: string | null;
  gap_to_target_signed: string | null;
  target_status: string;
  peer_p50: string | null;
}

function formatMeasure(unit: string, raw: string | null): string {
  if (raw == null || raw === "") return "—";
  const n = Number(raw);
  if (Number.isNaN(n)) return raw;
  if (unit === "ratio") return formatRatioAsPercent(n);
  return n.toLocaleString(undefined, { maximumFractionDigits: 6 });
}

export default function TargetsPage() {
  const { factories, factoryId, setFactoryId, selectedFactory, authMessage } =
    useFactoryPeriod();
  const [lines, setLines] = useState<LineRow[]>([]);
  const [periods, setPeriods] = useState<PeriodRow[]>([]);
  const [lineId, setLineId] = useState("");
  const [periodId, setPeriodId] = useState("");
  const [catalog, setCatalog] = useState<TargetCatalogRow[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [comparison, setComparison] = useState<ComparisonRow[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

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
        setLines(d.lines ?? []);
        setLineId("");
      })
      .catch(() => setLines([]));
    void fetch(`${apiBase}/v1/factories/${factoryId}/reporting-periods`, {
      headers: { authorization: `Bearer ${token}` },
    })
      .then((r) => r.json() as Promise<{ reporting_periods?: PeriodRow[] }>)
      .then((d) => {
        const pr = d.reporting_periods ?? [];
        setPeriods(pr);
        setPeriodId(pr[0]?.id ?? "");
      })
      .catch(() => {
        setPeriods([]);
        setPeriodId("");
      });
  }, [factoryId]);

  const loadCatalog = useCallback(() => {
    const token = getAccessToken();
    if (!token || !factoryId) return;
    void fetch(`${apiBase}/v1/factories/${factoryId}/kpi-targets`, {
      headers: { authorization: `Bearer ${token}` },
    })
      .then(
        (r) =>
          r.json() as Promise<{
            kpi_targets?: TargetCatalogRow[];
            error?: string;
          }>,
      )
      .then((d) => {
        const rows = d.kpi_targets ?? [];
        setCatalog(rows);
        const next: Record<string, string> = {};
        for (const row of rows) {
          if (row.target_value != null && row.target_value !== "") {
            next[row.kpi_code] = row.target_value;
          }
        }
        setDrafts(next);
      })
      .catch(() => setCatalog([]));
  }, [factoryId]);

  useEffect(() => {
    void Promise.resolve().then(() => {
      loadMeta();
      loadCatalog();
    });
  }, [loadMeta, loadCatalog]);

  async function onSaveTargets(e: FormEvent) {
    e.preventDefault();
    if (!selectedFactory?.can_administer) {
      setMessage("Only factory admins can edit targets.");
      return;
    }
    const token = getAccessToken();
    if (!token || !factoryId) return;
    const targets = Object.entries(drafts)
      .filter(([, v]) => v.trim() !== "")
      .map(([kpi_code, v]) => ({
        kpi_code,
        target_value: Number(v),
      }))
      .filter((t) => Number.isFinite(t.target_value));
    if (!targets.length) {
      setMessage("Enter at least one target value.");
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(`${apiBase}/v1/factories/${factoryId}/kpi-targets`, {
        method: "PUT",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ targets }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setMessage(data.error ?? `save_failed_${res.status}`);
        return;
      }
      setMessage("Targets saved.");
      loadCatalog();
    } catch {
      setMessage("network_error");
    } finally {
      setSaving(false);
    }
  }

  async function onLoadComparison(e: FormEvent) {
    e.preventDefault();
    const token = getAccessToken();
    if (!token || !factoryId || !periodId) {
      setMessage("Pick factory and reporting period.");
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      const qs = new URLSearchParams({ reporting_period_id: periodId });
      if (lineId) qs.set("line_id", lineId);
      const res = await fetch(
        `${apiBase}/v1/factories/${factoryId}/kpi-target-comparison?${qs.toString()}`,
        { headers: { authorization: `Bearer ${token}` } },
      );
      const data = (await res.json()) as {
        error?: string;
        rows?: ComparisonRow[];
      };
      if (!res.ok) {
        setMessage(data.error ?? `request_failed_${res.status}`);
        setComparison([]);
        return;
      }
      setComparison(data.rows ?? []);
      if (!(data.rows?.length ?? 0)) {
        setMessage("No KPI rows for this period (upload facts and refresh KPIs).");
      }
    } catch {
      setMessage("network_error");
      setComparison([]);
    } finally {
      setLoading(false);
    }
  }

  const noAccess =
    factories.length > 0 && dashboardFactories.length === 0;

  return (
    <div className="flex min-h-full flex-col items-center bg-zinc-50 px-4 py-12 dark:bg-black">
      <div className="w-full max-w-6xl rounded-xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
          KPI targets
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Sprint 10 — factory admins set improvement targets; managers compare
          actuals vs targets and peers for a reporting period.
        </p>
        <div className="mt-4 flex flex-wrap gap-3 text-sm">
          <Link className="font-medium underline" href="/">
            Home
          </Link>
          <Link className="font-medium underline" href="/dashboard">
            Dashboard
          </Link>
          <Link className="font-medium underline" href="/login">
            Sign in
          </Link>
        </div>

        {noAccess ? (
          <p className="mt-6 text-sm text-amber-800 dark:text-amber-200">
            Need manager or admin on a factory.
          </p>
        ) : null}

        <label className="mt-6 flex max-w-md flex-col gap-1 text-sm">
          <span className="font-medium">Factory</span>
          <select
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-black dark:text-zinc-50"
            value={factoryId}
            onChange={(ev) => setFactoryId(ev.target.value)}
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

        {authMessage || message ? (
          <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
            {authMessage ?? message}
          </p>
        ) : null}

        {selectedFactory?.can_administer ? (
          <form
            className="mt-8 border-t border-zinc-200 pt-6 dark:border-zinc-800"
            onSubmit={onSaveTargets}
          >
            <h2 className="text-sm font-semibold">Set targets (decimal in DB)</h2>
            <p className="mt-1 text-xs text-zinc-500">
              Ratios as decimals (e.g. 0.85 for 85%). Only rows with a value are saved.
            </p>
            <div className="mt-4 max-h-64 overflow-y-auto rounded border border-zinc-200 p-2 dark:border-zinc-700">
              {catalog.map((row) => (
                <label
                  key={row.kpi_code}
                  className="flex flex-wrap items-center gap-2 border-b border-zinc-100 py-2 text-xs dark:border-zinc-800"
                >
                  <span className="min-w-[10rem] font-mono font-semibold">
                    {row.kpi_code}
                  </span>
                  <span className="text-zinc-500">({row.definition_unit})</span>
                  <input
                    className="ml-auto w-28 rounded border border-zinc-300 px-2 py-1 font-mono dark:border-zinc-600 dark:bg-black"
                    type="text"
                    placeholder="target"
                    value={drafts[row.kpi_code] ?? ""}
                    onChange={(ev) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [row.kpi_code]: ev.target.value,
                      }))
                    }
                  />
                </label>
              ))}
            </div>
            <button
              type="submit"
              disabled={saving || !factoryId}
              className="mt-4 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
            >
              {saving ? "Saving…" : "Save targets"}
            </button>
          </form>
        ) : (
          <p className="mt-6 text-sm text-zinc-500">
            Target editing is for factory admins. You can still view comparison below.
          </p>
        )}

        <form
          className="mt-8 flex flex-col gap-4 border-t border-zinc-200 pt-6 dark:border-zinc-800"
          onSubmit={onLoadComparison}
        >
          <h2 className="text-sm font-semibold">Actual vs target</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Reporting period</span>
              <select
                className="rounded-md border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-black"
                value={periodId}
                onChange={(ev) => setPeriodId(ev.target.value)}
                required
              >
                <option value="" disabled>
                  {periods.length ? "Select…" : "No periods"}
                </option>
                {periods.map((p) => (
                  <option key={p.id} value={p.id}>
                    {(p.label ?? p.period_end).slice(0, 10)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Line (optional)</span>
              <select
                className="rounded-md border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-black"
                value={lineId}
                onChange={(ev) => setLineId(ev.target.value)}
              >
                <option value="">All lines</option>
                {lines.map((ln) => (
                  <option key={ln.id} value={ln.id}>
                    {ln.line_code}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button
            type="submit"
            disabled={loading || !factoryId || !periodId}
            className="max-w-xs rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium dark:border-zinc-600"
          >
            {loading ? "Loading…" : "Load comparison"}
          </button>
        </form>

        {comparison.length > 0 ? (
          <div className="mt-6 overflow-x-auto">
            <table className="min-w-full text-left text-xs">
              <thead>
                <tr className="border-b border-zinc-300 dark:border-zinc-600">
                  <th className="py-2 pr-3">Line</th>
                  <th className="py-2 pr-3">KPI</th>
                  <th className="py-2 pr-3">Actual</th>
                  <th className="py-2 pr-3">Target</th>
                  <th className="py-2 pr-3">Gap</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2">Peer p50</th>
                </tr>
              </thead>
              <tbody>
                {comparison.map((row) => (
                  <tr
                    key={`${row.line_code}-${row.kpi_code}`}
                    className="border-b border-zinc-100 dark:border-zinc-800"
                  >
                    <td className="py-2 pr-3">{row.line_code}</td>
                    <td className="py-2 pr-3 font-mono">{row.kpi_code}</td>
                    <td className="py-2 pr-3">
                      {formatMeasure(row.definition_unit, row.current_value)}
                    </td>
                    <td className="py-2 pr-3">
                      {formatMeasure(row.definition_unit, row.target_value)}
                    </td>
                    <td className="py-2 pr-3">
                      {formatMeasure(row.definition_unit, row.gap_to_target_signed)}
                    </td>
                    <td className="py-2 pr-3 font-mono">{row.target_status}</td>
                    <td className="py-2">
                      {formatMeasure(row.definition_unit, row.peer_p50)}
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
