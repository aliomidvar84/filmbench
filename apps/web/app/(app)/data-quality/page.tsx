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
  period_start: string;
  period_end: string;
  label: string | null;
}

interface ValidationIssueRow {
  id: string;
  issue_code: string;
  issue_severity: string;
  issue_message: string;
  created_at: string;
  production_fact_id: string;
  line_id: string;
  line_code: string;
  reporting_period_id: string;
  period_end: string;
  label: string | null;
  data_quality_status: string;
  ingestion_batch_id: string | null;
}

export default function DataQualityPage() {
  const [factories, setFactories] = useState<FactoryRow[]>([]);
  const [factoryId, setFactoryId] = useState("");
  const [lines, setLines] = useState<LineRow[]>([]);
  const [periods, setPeriods] = useState<PeriodRow[]>([]);
  const [lineId, setLineId] = useState("");
  const [periodId, setPeriodId] = useState("");
  const [severity, setSeverity] = useState<"" | "error" | "warning">("");
  const [issueCode, setIssueCode] = useState("");
  const [issues, setIssues] = useState<ValidationIssueRow[]>([]);
  const [limit, setLimit] = useState<number | null>(null);
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

  const loadLinesAndPeriods = useCallback(() => {
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
        setPeriodId("");
      })
      .catch(() => {
        setPeriods([]);
        setPeriodId("");
      });
  }, [factoryId]);

  useEffect(() => {
    void Promise.resolve().then(() => {
      loadLinesAndPeriods();
    });
  }, [loadLinesAndPeriods]);

  async function downloadCsv(): Promise<void> {
    const token = localStorage.getItem("filmbench_access_token");
    if (!token || !factoryId) {
      setMessage("Pick a factory.");
      return;
    }
    const qs = new URLSearchParams();
    if (lineId) qs.set("line_id", lineId);
    if (periodId) qs.set("reporting_period_id", periodId);
    if (severity) qs.set("severity", severity);
    if (issueCode.trim()) qs.set("issue_code", issueCode.trim());
    const q = qs.toString();
    const path = `/v1/factories/${factoryId}/validation-issues/export${q ? `?${q}` : ""}`;
    try {
      const res = await fetch(`${apiBase}${path}`, {
        headers: { authorization: `Bearer ${token}` },
      });
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
      const name = m?.[1] ?? "validation-issues.csv";
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
    const token = localStorage.getItem("filmbench_access_token");
    if (!token || !factoryId) {
      setMessage("Pick a factory.");
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      const qs = new URLSearchParams();
      if (lineId) qs.set("line_id", lineId);
      if (periodId) qs.set("reporting_period_id", periodId);
      if (severity) qs.set("severity", severity);
      if (issueCode.trim()) qs.set("issue_code", issueCode.trim());
      const res = await fetch(
        `${apiBase}/v1/factories/${factoryId}/validation-issues?${qs.toString()}`,
        { headers: { authorization: `Bearer ${token}` } },
      );
      const data = (await res.json()) as {
        error?: string;
        validation_issues?: ValidationIssueRow[];
        limit?: number;
      };
      if (!res.ok) {
        setMessage(data.error ?? `request_failed_${res.status}`);
        setIssues([]);
        setLimit(null);
        return;
      }
      setIssues(data.validation_issues ?? []);
      setLimit(data.limit ?? null);
      if (!(data.validation_issues?.length ?? 0)) {
        setMessage("No validation issues match these filters.");
      } else {
        setMessage(null);
      }
    } catch {
      setMessage("network_error");
      setIssues([]);
      setLimit(null);
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
          Data quality — validation issues
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Sprint 9 — hard and soft checks from{" "}
          <code className="rounded bg-zinc-100 px-1 text-xs dark:bg-zinc-900">
            data_validation_issues
          </code>
          . Same access as the KPI dashboard (factory managers and admins).
        </p>
        <div className="mt-4 flex flex-wrap gap-3 text-sm">
          <Link className="font-medium underline" href="/">
            Home
          </Link>
          <Link className="font-medium underline" href="/dashboard">
            Dashboard
          </Link>
          <Link className="font-medium underline" href="/upload">
            Upload
          </Link>
          <Link className="font-medium underline" href="/login">
            Sign in
          </Link>
        </div>

        {noAccess ? (
          <p className="mt-6 text-sm text-amber-800 dark:text-amber-200">
            Need manager or admin on a factory to view validation issues.
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
              <span className="font-medium">Severity (optional)</span>
              <select
                className="rounded-md border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-black dark:text-zinc-50"
                value={severity}
                onChange={(ev) =>
                  setSeverity(ev.target.value as "" | "error" | "warning")
                }
              >
                <option value="">All</option>
                <option value="error">error</option>
                <option value="warning">warning</option>
              </select>
            </label>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Line (optional)</span>
              <select
                className="rounded-md border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-black dark:text-zinc-50"
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
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Reporting period (optional)</span>
              <select
                className="rounded-md border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-black dark:text-zinc-50"
                value={periodId}
                onChange={(ev) => setPeriodId(ev.target.value)}
              >
                <option value="">All periods</option>
                {periods.map((p) => (
                  <option key={p.id} value={p.id}>
                    {(p.label ?? p.period_start).slice(0, 10)} →{" "}
                    {p.period_end.slice(0, 10)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="flex max-w-xl flex-col gap-1 text-sm">
            <span className="font-medium">Issue code (optional, exact match)</span>
            <input
              className="rounded-md border border-zinc-300 px-3 py-2 font-mono text-xs dark:border-zinc-700 dark:bg-black"
              value={issueCode}
              onChange={(ev) => setIssueCode(ev.target.value)}
              placeholder="e.g. SOFT_HIGH_ENERGY_PER_KG"
            />
          </label>
          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={loading || !factoryId}
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
            >
              {loading ? "Loading…" : "Load issues"}
            </button>
            <button
              type="button"
              disabled={!factoryId}
              className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-800 dark:border-zinc-600 dark:text-zinc-200"
              onClick={() => void downloadCsv()}
            >
              Download CSV
            </button>
          </div>
        </form>

        {message && !issues.length ? (
          <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">{message}</p>
        ) : null}

        {issues.length > 0 ? (
          <div className="mt-8">
            <p className="text-xs text-zinc-500">
              Showing {issues.length}
              {limit != null ? ` of at most ${limit}` : ""} rows (newest first).
            </p>
            <div className="mt-3 overflow-x-auto">
              <table className="min-w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-zinc-300 dark:border-zinc-600">
                    <th className="py-2 pr-3 font-medium">Severity</th>
                    <th className="py-2 pr-3 font-medium">Code</th>
                    <th className="py-2 pr-3 font-medium">Line</th>
                    <th className="py-2 pr-3 font-medium">Period end</th>
                    <th className="py-2 pr-3 font-medium">Quality</th>
                    <th className="py-2 font-medium">Message</th>
                  </tr>
                </thead>
                <tbody>
                  {issues.map((row) => (
                    <tr
                      key={row.id}
                      className="border-b border-zinc-100 dark:border-zinc-800"
                    >
                      <td className="py-2 pr-3 font-mono">{row.issue_severity}</td>
                      <td className="py-2 pr-3 font-mono">{row.issue_code}</td>
                      <td className="py-2 pr-3">{row.line_code}</td>
                      <td className="py-2 pr-3 whitespace-nowrap">
                        {row.period_end.slice(0, 10)}
                      </td>
                      <td className="py-2 pr-3 font-mono">
                        {row.data_quality_status}
                      </td>
                      <td className="max-w-md py-2 text-zinc-700 dark:text-zinc-300">
                        {row.issue_message}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
