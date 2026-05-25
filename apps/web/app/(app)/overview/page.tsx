"use client";

import type { FormEvent } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

const apiBase =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ??
  "http://127.0.0.1:4000";

interface FactoryRow {
  id: string;
  factory_name: string;
  can_view_dashboard: boolean;
}

interface LineRow {
  id: string;
  line_code: string;
}

interface PeriodRow {
  id: string;
  period_end: string;
  label: string | null;
}

interface SummaryCounts {
  lines: number;
  kpi_results: number;
  validation_errors: number;
  validation_warnings: number;
  below_target: number;
  below_peer_median: number;
  insufficient_peer_sample: number;
  targets_defined: number;
}

interface PriorityRow {
  kind: string;
  line_code: string;
  ref_code: string;
  message: string;
  severity: string;
  metric_value: string | null;
}

interface BatchRow {
  id: string;
  original_filename: string;
  status: string;
  row_count: number | null;
  created_at: string;
  uploaded_by_email: string;
}

const KIND_LABELS: Record<string, string> = {
  validation_error: "Data error",
  validation_warning: "Data warning",
  below_target: "Below target",
  below_peer_median: "Below peer median",
};

export default function OverviewPage() {
  const [factories, setFactories] = useState<FactoryRow[]>([]);
  const [factoryId, setFactoryId] = useState("");
  const [lines, setLines] = useState<LineRow[]>([]);
  const [periods, setPeriods] = useState<PeriodRow[]>([]);
  const [lineId, setLineId] = useState("");
  const [periodId, setPeriodId] = useState("");
  const [counts, setCounts] = useState<SummaryCounts | null>(null);
  const [priorities, setPriorities] = useState<PriorityRow[]>([]);
  const [batches, setBatches] = useState<BatchRow[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const dashboardFactories = useMemo(
    () => factories.filter((f) => f.can_view_dashboard),
    [factories],
  );

  useEffect(() => {
    void Promise.resolve().then(() => {
      const token = localStorage.getItem("filmbench_access_token");
      if (!token) {
        setMessage("Sign in first.");
        return;
      }
      void fetch(`${apiBase}/v1/factories`, {
        headers: { authorization: `Bearer ${token}` },
      })
        .then((r) => r.json() as Promise<{ factories?: FactoryRow[] }>)
        .then((data) => {
          const list = data.factories ?? [];
          setFactories(list);
          const dash = list.filter((f) => f.can_view_dashboard);
          if (dash[0]?.id) setFactoryId(dash[0].id);
        })
        .catch(() => setMessage("Could not load factories."));
    });
  }, []);

  const loadMeta = useCallback(() => {
    const token = localStorage.getItem("filmbench_access_token");
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

  useEffect(() => {
    void Promise.resolve().then(() => {
      loadMeta();
    });
  }, [loadMeta]);

  async function onLoad(e: FormEvent) {
    e.preventDefault();
    const token = localStorage.getItem("filmbench_access_token");
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
        `${apiBase}/v1/factories/${factoryId}/summary?${qs.toString()}`,
        { headers: { authorization: `Bearer ${token}` } },
      );
      const data = (await res.json()) as {
        error?: string;
        counts?: SummaryCounts;
        priorities?: PriorityRow[];
        recent_ingestion_batches?: BatchRow[];
      };
      if (!res.ok) {
        setMessage(data.error ?? `request_failed_${res.status}`);
        setCounts(null);
        setPriorities([]);
        setBatches([]);
        return;
      }
      setCounts(data.counts ?? null);
      setPriorities(data.priorities ?? []);
      setBatches(data.recent_ingestion_batches ?? []);
      if (!data.priorities?.length && data.counts?.kpi_results === 0) {
        setMessage("No KPI data for this period yet. Upload monthly facts first.");
      }
    } catch {
      setMessage("network_error");
      setCounts(null);
      setPriorities([]);
      setBatches([]);
    } finally {
      setLoading(false);
    }
  }

  const noAccess =
    factories.length > 0 && dashboardFactories.length === 0;

  return (
    <div className="flex min-h-full flex-col items-center bg-zinc-50 px-4 py-12 dark:bg-black">
      <div className="w-full max-w-5xl rounded-xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
          Factory overview
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Sprint 12 — priorities feed{" "}
          <Link className="underline" href="/actions">
            improvement actions
          </Link>
          . Counts cover validation, targets, and peer gaps for one period.
        </p>
        <div className="mt-4 flex flex-wrap gap-3 text-sm">
          <Link className="font-medium underline" href="/">
            Home
          </Link>
          <Link className="font-medium underline" href="/dashboard">
            Dashboard
          </Link>
          <Link className="font-medium underline" href="/targets">
            Targets
          </Link>
          <Link className="font-medium underline" href="/data-quality">
            Data quality
          </Link>
        </div>

        {noAccess ? (
          <p className="mt-6 text-sm text-amber-800 dark:text-amber-200">
            Need manager or admin on a factory.
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
                className="rounded-md border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-black"
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
          </div>
          <label className="flex max-w-md flex-col gap-1 text-sm">
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
          <button
            type="submit"
            disabled={loading || !factoryId || !periodId}
            className="max-w-xs rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
          >
            {loading ? "Loading…" : "Load overview"}
          </button>
        </form>

        {message ? (
          <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">{message}</p>
        ) : null}

        {counts ? (
          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Lines", counts.lines],
              ["KPI rows", counts.kpi_results],
              ["Validation errors", counts.validation_errors],
              ["Validation warnings", counts.validation_warnings],
              ["Below target", counts.below_target],
              ["Below peer median", counts.below_peer_median],
              ["Insufficient peers", counts.insufficient_peer_sample],
              ["Targets defined", counts.targets_defined],
            ].map(([label, n]) => (
              <div
                key={String(label)}
                className="rounded-lg border border-zinc-200 px-4 py-3 dark:border-zinc-700"
              >
                <p className="text-xs text-zinc-500">{label}</p>
                <p className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
                  {n}
                </p>
              </div>
            ))}
          </div>
        ) : null}

        {priorities.length > 0 ? (
          <div className="mt-8 border-t border-zinc-200 pt-6 dark:border-zinc-800">
            <h2 className="text-sm font-semibold">Improvement priorities</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {priorities.map((p, i) => (
                <li
                  key={`${p.kind}-${p.line_code}-${p.ref_code}-${i}`}
                  className="rounded-md border border-zinc-100 px-3 py-2 dark:border-zinc-800"
                >
                  <span className="font-mono text-xs text-amber-700 dark:text-amber-300">
                    {KIND_LABELS[p.kind] ?? p.kind}
                  </span>
                  <span className="ml-2 font-mono text-xs">{p.line_code}</span>
                  <span className="ml-1 font-mono text-xs text-zinc-500">
                    {p.ref_code}
                  </span>
                  <p className="mt-1 text-zinc-700 dark:text-zinc-300">{p.message}</p>
                  {p.metric_value ? (
                    <p className="mt-0.5 font-mono text-xs text-zinc-500">
                      gap: {p.metric_value}
                    </p>
                  ) : null}
                  <Link
                    className="mt-2 inline-block text-xs font-medium underline"
                    href={`/actions?${new URLSearchParams({
                      title: `${p.line_code} ${p.ref_code}: ${p.message}`.slice(
                        0,
                        120,
                      ),
                      source_kind: p.kind,
                      kpi_code: p.ref_code,
                      ...(periodId
                        ? { reporting_period_id: periodId }
                        : {}),
                    }).toString()}`}
                  >
                    Track as action →
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {batches.length > 0 ? (
          <div className="mt-8 border-t border-zinc-200 pt-6 dark:border-zinc-800">
            <h2 className="text-sm font-semibold">Recent uploads</h2>
            <ul className="mt-3 space-y-1 text-xs text-zinc-600 dark:text-zinc-400">
              {batches.map((b) => (
                <li key={b.id}>
                  {b.created_at.slice(0, 10)} — {b.original_filename} ({b.status}
                  {b.row_count != null ? `, ${b.row_count} rows` : ""}) by{" "}
                  {b.uploaded_by_email}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  );
}
