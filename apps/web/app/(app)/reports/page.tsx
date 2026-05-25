"use client";

import type { FormEvent } from "react";
import { useCallback, useEffect, useState } from "react";

import { PageContainer } from "../../../components/PageContainer";
import { apiBase, getAccessToken } from "../../../lib/api";
import { useFactoryPeriod } from "../../../lib/factory-period-context";

type ReportFormat = "csv" | "pdf";

interface LineRow {
  id: string;
  line_code: string;
}

interface ReportRow {
  id: string;
  title: string;
  format: ReportFormat;
  file_name: string;
  byte_size: string;
  reporting_period_id: string;
  line_id: string | null;
  created_at: string;
  created_by_email: string | null;
  summary: { counts?: Record<string, number> };
}

const SIZE_HINT: Record<ReportFormat, string> = {
  csv: "Typical CSV: about 3–80 KB",
  pdf: "Typical PDF: about 15–250 KB",
};

function formatBytes(raw: string | number): string {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return String(raw);
  if (n < 1024) return `${n} B`;
  return `${(n / 1024).toFixed(1)} KB`;
}

export default function ReportsPage() {
  const { factoryId, periodId, periods, setPeriodId, selectedFactory } =
    useFactoryPeriod();
  const [lines, setLines] = useState<LineRow[]>([]);
  const [lineId, setLineId] = useState("");
  const [format, setFormat] = useState<ReportFormat>("csv");
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [lastEstimate, setLastEstimate] = useState<number | null>(null);

  const canDashboard = Boolean(selectedFactory?.can_view_dashboard);

  const loadLines = useCallback(() => {
    const token = getAccessToken();
    if (!token || !factoryId) return;
    void fetch(`${apiBase}/v1/factories/${factoryId}/lines`, {
      headers: { authorization: `Bearer ${token}` },
    })
      .then((r) => r.json() as Promise<{ lines?: LineRow[] }>)
      .then((d) => setLines(d.lines ?? []))
      .catch(() => setLines([]));
  }, [factoryId]);

  const loadReports = useCallback(() => {
    const token = getAccessToken();
    if (!token || !factoryId) return;
    setLoading(true);
    void fetch(`${apiBase}/v1/factories/${factoryId}/reports`, {
      headers: { authorization: `Bearer ${token}` },
    })
      .then((r) => r.json() as Promise<{ reports?: ReportRow[]; error?: string }>)
      .then((d) => {
        if (!d.reports) {
          setMessage(d.error ?? "could_not_load_reports");
          return;
        }
        setReports(d.reports);
        setMessage(null);
      })
      .catch(() => setMessage("network_error"))
      .finally(() => setLoading(false));
  }, [factoryId]);

  useEffect(() => {
    void Promise.resolve().then(() => loadLines());
  }, [loadLines]);

  useEffect(() => {
    void Promise.resolve().then(() => loadReports());
  }, [loadReports]);

  async function onGenerate(e: FormEvent) {
    e.preventDefault();
    const token = getAccessToken();
    if (!token || !factoryId || !periodId) {
      setMessage("Select factory and period in the top bar.");
      return;
    }
    setGenerating(true);
    setMessage(null);
    setLastEstimate(null);
    try {
      const res = await fetch(`${apiBase}/v1/factories/${factoryId}/reports`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          reporting_period_id: periodId,
          line_id: lineId || null,
          format,
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        report?: {
          byte_size?: number;
          estimated_byte_size?: number;
          format?: ReportFormat;
        };
      };
      if (!res.ok) {
        setMessage(data.error ?? `generate_failed_${res.status}`);
        return;
      }
      const actual = data.report?.byte_size;
      const est = data.report?.estimated_byte_size;
      if (est != null) setLastEstimate(est);
      setMessage(
        actual != null
          ? `Report generated (${data.report?.format?.toUpperCase() ?? format}): ${formatBytes(actual)}` +
              (est != null ? ` · estimated ~${formatBytes(est)}` : "")
          : "Report generated. Download from the list below.",
      );
      loadReports();
    } catch {
      setMessage("network_error");
    } finally {
      setGenerating(false);
    }
  }

  async function downloadReport(
    reportId: string,
    fileName: string,
    reportFormat: ReportFormat,
  ) {
    const token = getAccessToken();
    if (!token || !factoryId) return;
    const res = await fetch(
      `${apiBase}/v1/factories/${factoryId}/reports/${reportId}/download`,
      { headers: { authorization: `Bearer ${token}` } },
    );
    if (!res.ok) {
      setMessage(`download_failed_${res.status}`);
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
    setMessage(`Downloaded ${reportFormat.toUpperCase()} (${formatBytes(blob.size)}).`);
  }

  if (!canDashboard) {
    return (
      <PageContainer
        title="Reports"
        subtitle="Executive CSV/PDF summaries (manager or admin)."
      >
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Dashboard access required to generate and download reports.
        </p>
      </PageContainer>
    );
  }

  return (
    <PageContainer
      title="Reports"
      subtitle="Executive summary as shareable CSV or PDF (Sprint 21). Downloads are audit-logged."
    >
      <form
        onSubmit={(ev) => void onGenerate(ev)}
        className="mb-8 grid gap-4 rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900 sm:grid-cols-2"
      >
        <label className="flex flex-col gap-1 text-sm sm:col-span-2">
          Reporting period
          <select
            className="rounded-lg border border-zinc-300 px-3 py-2 dark:border-zinc-600 dark:bg-zinc-950"
            value={periodId}
            onChange={(e) => setPeriodId(e.target.value)}
          >
            {periods.length === 0 ? (
              <option value="">No periods — select factory in top bar</option>
            ) : null}
            {periods.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label ?? p.period_end}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm sm:col-span-2">
          Line (optional — all lines if empty)
          <select
            className="rounded-lg border border-zinc-300 px-3 py-2 dark:border-zinc-600 dark:bg-zinc-950"
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
          Format
          <select
            className="rounded-lg border border-zinc-300 px-3 py-2 dark:border-zinc-600 dark:bg-zinc-950"
            value={format}
            onChange={(e) => setFormat(e.target.value as ReportFormat)}
          >
            <option value="csv">CSV (spreadsheet)</option>
            <option value="pdf">PDF (shareable)</option>
          </select>
        </label>
        <div className="flex flex-col justify-end text-sm text-zinc-600 dark:text-zinc-400">
          <p>{SIZE_HINT[format]}</p>
          {lastEstimate != null ? (
            <p className="mt-1 text-xs">
              Last estimate: ~{formatBytes(lastEstimate)}
            </p>
          ) : null}
        </div>
        <div className="sm:col-span-2">
          <button
            type="submit"
            disabled={generating || !periodId}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
          >
            {generating
              ? "Generating…"
              : `Generate executive ${format.toUpperCase()}`}
          </button>
        </div>
      </form>

      {message ? (
        <p className="mb-4 text-sm text-zinc-700 dark:text-zinc-300">{message}</p>
      ) : null}

      <h2 className="mb-3 text-lg font-medium text-zinc-900 dark:text-zinc-100">
        Recent reports
      </h2>
      {loading ? (
        <p className="text-sm text-zinc-500">Loading…</p>
      ) : reports.length === 0 ? (
        <p className="text-sm text-zinc-500">No reports yet.</p>
      ) : (
        <ul className="divide-y divide-zinc-200 rounded-xl border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
          {reports.map((r) => {
            const fmt = (r.format ?? "csv") as ReportFormat;
            return (
              <li
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
              >
                <div>
                  <p className="font-medium text-zinc-900 dark:text-zinc-100">
                    {r.title}
                  </p>
                  <p className="text-xs text-zinc-500">
                    {fmt.toUpperCase()} · {formatBytes(r.byte_size)} ·{" "}
                    {r.created_by_email ?? "unknown"} ·{" "}
                    {new Date(r.created_at).toLocaleString()}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void downloadReport(r.id, r.file_name, fmt)}
                  className="text-sm font-medium text-sky-700 underline dark:text-sky-400"
                >
                  Download {fmt.toUpperCase()}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </PageContainer>
  );
}
