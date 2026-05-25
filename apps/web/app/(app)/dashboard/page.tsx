"use client";

import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import Link from "next/link";

import { formatRatioAsPercent } from "@filmbench/shared";

import { OnboardingPanel } from "../../../components/OnboardingPanel";
import { PageContainer } from "../../../components/PageContainer";
import { apiBase, getAccessToken } from "../../../lib/api";
import { useFactoryPeriod } from "../../../lib/factory-period-context";

interface LineRow {
  id: string;
  line_code: string;
  line_type: string;
}

interface BenchRow {
  line_code: string;
  kpi_code: string;
  definition_unit: string;
  current_value: string | null;
  peer_p50: string | null;
  gap_to_median_signed: string | null;
  comparison_status: string;
}

function formatMeasure(unit: string, raw: string | null): string {
  if (raw == null || raw === "") return "—";
  const n = Number(raw);
  if (Number.isNaN(n)) return raw;
  if (unit === "ratio") return formatRatioAsPercent(n);
  return n.toLocaleString(undefined, { maximumFractionDigits: 6 });
}

export default function DashboardPage() {
  const { factoryId, periodId, selectedFactory, authMessage } =
    useFactoryPeriod();
  const [lines, setLines] = useState<LineRow[]>([]);
  const [lineId, setLineId] = useState("");
  const [benchRows, setBenchRows] = useState<BenchRow[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!factoryId) return;
    const token = getAccessToken();
    if (!token) return;
    void fetch(`${apiBase}/v1/factories/${factoryId}/lines`, {
      headers: { authorization: `Bearer ${token}` },
    })
      .then((r) => r.json() as Promise<{ lines?: LineRow[] }>)
      .then((d) => {
        setLines(d.lines ?? []);
        setLineId("");
      })
      .catch(() => setLines([]));
  }, [factoryId]);

  async function downloadAuthedCsv(
    relativePath: string,
    fallbackFilename: string,
  ): Promise<void> {
    const token = getAccessToken();
    if (!token) {
      setMessage("Sign in first.");
      return;
    }
    try {
      const res = await fetch(`${apiBase}${relativePath}`, {
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
      const name = m?.[1] ?? fallbackFilename;
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

  async function onLoadBenchmark(e: FormEvent) {
    e.preventDefault();
    setMessage(null);
    const token = getAccessToken();
    if (!token || !factoryId || !periodId) {
      setMessage("Pick factory and period in the top bar.");
      return;
    }
    setLoading(true);
    try {
      const qs = new URLSearchParams({ reporting_period_id: periodId });
      if (lineId) qs.set("line_id", lineId);
      const res = await fetch(
        `${apiBase}/v1/factories/${factoryId}/benchmark-comparison?${qs.toString()}`,
        { headers: { authorization: `Bearer ${token}` } },
      );
      const data = (await res.json()) as {
        error?: string;
        benchmark_rows?: BenchRow[];
      };
      if (!res.ok) {
        setMessage(data.error ?? `request_failed_${res.status}`);
        setBenchRows([]);
        return;
      }
      const rows = data.benchmark_rows ?? [];
      setBenchRows(rows);
      if (!rows.length) {
        setMessage(
          "No benchmark rows for this selection. Upload monthly facts first.",
        );
      }
    } catch {
      setMessage("network_error");
      setBenchRows([]);
    } finally {
      setLoading(false);
    }
  }

  const noDashboardAccess = Boolean(
    selectedFactory && !selectedFactory.can_view_dashboard,
  );

  return (
    <PageContainer
      title="KPI dashboard and peer comparison"
      subtitle="Factory and period come from the top bar (Sprint 17). Compare your lines to cohort medians."
    >
      <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
        For cohort filters and percentile narrative use{" "}
        <Link className="underline" href="/benchmark">
          Benchmark explorer
        </Link>
        . Quick view below, or start from{" "}
        <Link className="underline" href="/overview">
          Overview
        </Link>
        .
      </p>

      {factoryId && periodId && !noDashboardAccess ? (
        <OnboardingPanel
          factoryId={factoryId}
          periodId={periodId}
          compact
        />
      ) : null}

      {authMessage ? (
        <p className="mb-4 text-sm text-amber-800 dark:text-amber-200">
          {authMessage}
        </p>
      ) : null}

      {noDashboardAccess ? (
        <p className="mb-4 text-sm text-amber-800 dark:text-amber-200">
          Your role on this factory cannot view the dashboard (need manager or
          admin).
        </p>
      ) : null}

      <form
        className="flex flex-col gap-4 rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900"
        onSubmit={onLoadBenchmark}
      >
        <label className="flex max-w-md flex-col gap-1 text-sm">
          <span className="font-medium text-zinc-700 dark:text-zinc-300">
            Line (optional)
          </span>
          <select
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-black"
            value={lineId}
            onChange={(ev) => setLineId(ev.target.value)}
          >
            <option value="">All lines</option>
            {lines.map((ln) => (
              <option key={ln.id} value={ln.id}>
                {ln.line_code} ({ln.line_type})
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-wrap gap-3">
          <button
            type="submit"
            disabled={loading || !factoryId || !periodId || noDashboardAccess}
            className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
          >
            {loading ? "Loading…" : "Load benchmark comparison"}
          </button>
          <button
            type="button"
            disabled={!factoryId || !periodId}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600"
            onClick={() => {
              const qs = new URLSearchParams({ reporting_period_id: periodId });
              if (lineId) qs.set("line_id", lineId);
              void downloadAuthedCsv(
                `/v1/factories/${factoryId}/benchmark-comparison/export?${qs.toString()}`,
                "benchmark.csv",
              );
            }}
          >
            Download benchmark CSV
          </button>
        </div>
      </form>

      {message && !benchRows.length ? (
        <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">{message}</p>
      ) : null}

      {benchRows.length > 0 ? (
        <div className="mt-8 overflow-x-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <table className="min-w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 dark:border-zinc-700">
                <th className="px-4 py-2 font-medium">Line</th>
                <th className="px-4 py-2 font-medium">KPI</th>
                <th className="px-4 py-2 font-medium">Yours</th>
                <th className="px-4 py-2 font-medium">Peer p50</th>
                <th className="px-4 py-2 font-medium">Gap</th>
                <th className="px-4 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {benchRows.map((row) => (
                <tr
                  key={`${row.line_code}-${row.kpi_code}`}
                  className="border-b border-zinc-100 dark:border-zinc-800"
                >
                  <td className="px-4 py-2">{row.line_code}</td>
                  <td className="px-4 py-2 font-mono text-xs">{row.kpi_code}</td>
                  <td className="px-4 py-2">
                    {formatMeasure(row.definition_unit, row.current_value)}
                  </td>
                  <td className="px-4 py-2">
                    {formatMeasure(row.definition_unit, row.peer_p50)}
                  </td>
                  <td className="px-4 py-2">
                    {formatMeasure(
                      row.definition_unit,
                      row.gap_to_median_signed,
                    )}
                  </td>
                  <td className="px-4 py-2">{row.comparison_status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </PageContainer>
  );
}
