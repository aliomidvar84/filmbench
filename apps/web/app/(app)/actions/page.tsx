"use client";

import type { FormEvent } from "react";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

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
  label: string | null;
  period_end: string;
}

interface ActionRow {
  id: string;
  title: string;
  description: string | null;
  status: string;
  source_kind: string;
  kpi_code: string | null;
  line_code: string | null;
  period_label: string | null;
  due_date: string | null;
  created_at: string;
  updated_at: string;
  created_by_email: string | null;
}

const STATUSES = ["open", "in_progress", "done", "cancelled"] as const;

function ActionsPageInner() {
  const searchParams = useSearchParams();
  const [factories, setFactories] = useState<FactoryRow[]>([]);
  const [factoryId, setFactoryId] = useState("");
  const [lines, setLines] = useState<LineRow[]>([]);
  const [periods, setPeriods] = useState<PeriodRow[]>([]);
  const [filterStatus, setFilterStatus] = useState("");
  const [actions, setActions] = useState<ActionRow[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [lineId, setLineId] = useState("");
  const [periodId, setPeriodId] = useState("");
  const [kpiCode, setKpiCode] = useState("");
  const [sourceKind, setSourceKind] = useState("manual");
  const [dueDate, setDueDate] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const dashboardFactories = useMemo(
    () => factories.filter((f) => f.can_view_dashboard),
    [factories],
  );

  useEffect(() => {
    void Promise.resolve().then(() => {
      const prefillTitle = searchParams.get("title");
      const prefillSource = searchParams.get("source_kind");
      const prefillKpi = searchParams.get("kpi_code");
      const prefillLine = searchParams.get("line_id");
      const prefillPeriod = searchParams.get("reporting_period_id");
      if (prefillTitle) setTitle(prefillTitle);
      if (prefillSource) setSourceKind(prefillSource);
      if (prefillKpi) setKpiCode(prefillKpi);
      if (prefillLine) setLineId(prefillLine);
      if (prefillPeriod) setPeriodId(prefillPeriod);
    });
  }, [searchParams]);

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
      .then((d) => setLines(d.lines ?? []))
      .catch(() => setLines([]));
    void fetch(`${apiBase}/v1/factories/${factoryId}/reporting-periods`, {
      headers: { authorization: `Bearer ${token}` },
    })
      .then((r) => r.json() as Promise<{ reporting_periods?: PeriodRow[] }>)
      .then((d) => setPeriods(d.reporting_periods ?? []))
      .catch(() => setPeriods([]));
  }, [factoryId]);

  const loadActions = useCallback(() => {
    const token = localStorage.getItem("filmbench_access_token");
    if (!token || !factoryId) return;
    setLoading(true);
    const qs = new URLSearchParams();
    if (filterStatus) qs.set("status", filterStatus);
    void fetch(
      `${apiBase}/v1/factories/${factoryId}/improvement-actions?${qs.toString()}`,
      { headers: { authorization: `Bearer ${token}` } },
    )
      .then(
        (r) =>
          r.json() as Promise<{
            improvement_actions?: ActionRow[];
            error?: string;
          }>,
      )
      .then((d) => {
        if (!("improvement_actions" in d)) {
          setMessage(d.error ?? "load_failed");
          setActions([]);
        } else {
          setActions(d.improvement_actions ?? []);
        }
      })
      .catch(() => setActions([]))
      .finally(() => setLoading(false));
  }, [factoryId, filterStatus]);

  useEffect(() => {
    void Promise.resolve().then(() => {
      loadMeta();
    });
  }, [loadMeta]);

  useEffect(() => {
    void Promise.resolve().then(() => {
      loadActions();
    });
  }, [loadActions]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    const token = localStorage.getItem("filmbench_access_token");
    if (!token || !factoryId || !title.trim()) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(
        `${apiBase}/v1/factories/${factoryId}/improvement-actions`,
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${token}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            title: title.trim(),
            description: description.trim() || null,
            line_id: lineId || null,
            reporting_period_id: periodId || null,
            kpi_code: kpiCode.trim() || null,
            source_kind: sourceKind,
            due_date: dueDate || null,
          }),
        },
      );
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setMessage(data.error ?? `create_failed_${res.status}`);
        return;
      }
      setTitle("");
      setDescription("");
      setDueDate("");
      setMessage("Action created.");
      loadActions();
    } catch {
      setMessage("network_error");
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(actionId: string, status: string) {
    const token = localStorage.getItem("filmbench_access_token");
    if (!token || !factoryId) return;
    const res = await fetch(
      `${apiBase}/v1/factories/${factoryId}/improvement-actions/${actionId}`,
      {
        method: "PATCH",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ status }),
      },
    );
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      setMessage(data.error ?? "patch_failed");
      return;
    }
    loadActions();
  }

  async function downloadCsv() {
    const token = localStorage.getItem("filmbench_access_token");
    if (!token || !factoryId) return;
    const qs = new URLSearchParams();
    if (filterStatus) qs.set("status", filterStatus);
    const res = await fetch(
      `${apiBase}/v1/factories/${factoryId}/improvement-actions/export?${qs.toString()}`,
      { headers: { authorization: `Bearer ${token}` } },
    );
    if (!res.ok) {
      setMessage("export_failed");
      return;
    }
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "improvement-actions.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="flex min-h-full flex-col items-center bg-zinc-50 px-4 py-12 dark:bg-black">
      <div className="w-full max-w-5xl rounded-xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <h1 className="text-xl font-semibold">Improvement actions</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Sprint 12 — track follow-ups from overview priorities (managers and
          admins).
        </p>
        <div className="mt-4 flex flex-wrap gap-3 text-sm">
          <Link className="underline" href="/overview">
            Overview
          </Link>
          <Link className="underline" href="/">
            Home
          </Link>
        </div>

        <label className="mt-6 flex max-w-md flex-col gap-1 text-sm">
          <span className="font-medium">Factory</span>
          <select
            className="rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-black"
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

        {message ? (
          <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">{message}</p>
        ) : null}

        <form
          className="mt-8 border-t border-zinc-200 pt-6 dark:border-zinc-800"
          onSubmit={onCreate}
        >
          <h2 className="text-sm font-semibold">New action</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm sm:col-span-2">
              <span>Title</span>
              <input
                className="rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-black"
                value={title}
                onChange={(ev) => setTitle(ev.target.value)}
                required
              />
            </label>
            <label className="flex flex-col gap-1 text-sm sm:col-span-2">
              <span>Description</span>
              <textarea
                className="rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-black"
                rows={2}
                value={description}
                onChange={(ev) => setDescription(ev.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span>Source</span>
              <select
                className="rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-black"
                value={sourceKind}
                onChange={(ev) => setSourceKind(ev.target.value)}
              >
                <option value="manual">manual</option>
                <option value="below_target">below_target</option>
                <option value="below_peer_median">below_peer_median</option>
                <option value="validation_error">validation_error</option>
                <option value="validation_warning">validation_warning</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span>Due date</span>
              <input
                type="date"
                className="rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-black"
                value={dueDate}
                onChange={(ev) => setDueDate(ev.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span>Line</span>
              <select
                className="rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-black"
                value={lineId}
                onChange={(ev) => setLineId(ev.target.value)}
              >
                <option value="">—</option>
                {lines.map((ln) => (
                  <option key={ln.id} value={ln.id}>
                    {ln.line_code}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span>Period</span>
              <select
                className="rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-black"
                value={periodId}
                onChange={(ev) => setPeriodId(ev.target.value)}
              >
                <option value="">—</option>
                {periods.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label ?? p.period_end.slice(0, 10)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span>KPI code</span>
              <input
                className="rounded-md border border-zinc-300 px-3 py-2 font-mono text-xs dark:border-zinc-700 dark:bg-black"
                value={kpiCode}
                onChange={(ev) => setKpiCode(ev.target.value)}
              />
            </label>
          </div>
          <button
            type="submit"
            disabled={saving || !factoryId}
            className="mt-4 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
          >
            {saving ? "Saving…" : "Create action"}
          </button>
        </form>

        <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-zinc-200 pt-6 dark:border-zinc-800">
          <label className="flex items-center gap-2 text-sm">
            <span>Filter status</span>
            <select
              className="rounded border border-zinc-300 px-2 py-1 dark:border-zinc-600 dark:bg-black"
              value={filterStatus}
              onChange={(ev) => setFilterStatus(ev.target.value)}
            >
              <option value="">All</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="text-sm underline"
            onClick={() => void downloadCsv()}
          >
            Download CSV
          </button>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-xs">
            <thead>
              <tr className="border-b border-zinc-300 dark:border-zinc-600">
                <th className="py-2 pr-3">Title</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3">Line</th>
                <th className="py-2 pr-3">KPI</th>
                <th className="py-2">Update</th>
              </tr>
            </thead>
            <tbody>
              {actions.map((a) => (
                <tr
                  key={a.id}
                  className="border-b border-zinc-100 dark:border-zinc-800"
                >
                  <td className="py-2 pr-3">
                    <span className="font-medium">{a.title}</span>
                    {a.description ? (
                      <p className="text-zinc-500">{a.description}</p>
                    ) : null}
                  </td>
                  <td className="py-2 pr-3 font-mono">{a.status}</td>
                  <td className="py-2 pr-3">{a.line_code ?? "—"}</td>
                  <td className="py-2 pr-3 font-mono">{a.kpi_code ?? "—"}</td>
                  <td className="py-2">
                    <select
                      className="rounded border border-zinc-300 bg-white px-1 py-0.5 dark:border-zinc-600 dark:bg-zinc-900"
                      value={a.status}
                      onChange={(ev) =>
                        void changeStatus(a.id, ev.target.value)
                      }
                    >
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!actions.length && !loading ? (
            <p className="mt-2 text-xs text-zinc-500">No actions yet.</p>
          ) : null}
          {loading ? (
            <p className="mt-2 text-xs text-zinc-500">Loading…</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default function ActionsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-full items-center justify-center p-12 text-sm text-zinc-500">
          Loading…
        </div>
      }
    >
      <ActionsPageInner />
    </Suspense>
  );
}
