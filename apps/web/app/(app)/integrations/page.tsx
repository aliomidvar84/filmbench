"use client";

import { useCallback, useEffect, useState } from "react";

import { PageContainer } from "../../../components/PageContainer";
import { apiBase, getAccessToken } from "../../../lib/api";
import { useFactoryPeriod } from "../../../lib/factory-period-context";

interface MesContract {
  status: string;
  contract_version: string;
  capabilities: string[];
  endpoints: Record<string, string>;
  event_types: string[];
  sample_event: Record<string, unknown>;
  sample_responses: Record<string, Record<string, unknown>>;
  notes: string[];
}

interface IntegrationEventRow {
  id: string;
  event_type: string;
  external_id: string | null;
  line_code: string | null;
  occurred_at: string;
  received_at: string;
  status: string;
  payload: Record<string, unknown>;
}

interface AnalyticsStatus {
  clickhouse_enabled: boolean;
  clickhouse_health: string;
  recent_syncs: {
    id: string;
    status: string;
    kpi_rows_synced: number;
    benchmark_rows_synced: number;
    started_at: string;
    error_message: string | null;
  }[];
}

export default function IntegrationsPage() {
  const { factoryId, selectedFactory } = useFactoryPeriod();
  const [contract, setContract] = useState<MesContract | null>(null);
  const [events, setEvents] = useState<IntegrationEventRow[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsStatus | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [posting, setPosting] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const isMember = Boolean(selectedFactory);
  const isAdmin = Boolean(selectedFactory?.can_administer);

  const load = useCallback(() => {
    const token = getAccessToken();
    if (!token) return;
    setLoading(true);
    void fetch(`${apiBase}/v1/integrations/mes`, {
      headers: { authorization: `Bearer ${token}` },
    })
      .then((r) => r.json() as Promise<MesContract & { error?: string }>)
      .then((d) => {
        if (d.error) {
          setMessage(d.error);
          return;
        }
        setContract(d);
      })
      .catch(() => setMessage("network_error"))
      .finally(() => setLoading(false));
  }, []);

  const loadEvents = useCallback(() => {
    const token = getAccessToken();
    if (!token || !factoryId) return;
    void fetch(
      `${apiBase}/v1/integrations/mes/events?factory_id=${factoryId}&limit=20`,
      { headers: { authorization: `Bearer ${token}` } },
    )
      .then(
        (r) =>
          r.json() as Promise<{
            events?: IntegrationEventRow[];
            error?: string;
          }>,
      )
      .then((d) => {
        if (d.events) setEvents(d.events);
      })
      .catch(() => {});
  }, [factoryId]);

  const loadAnalytics = useCallback(() => {
    const token = getAccessToken();
    if (!token || !factoryId || !isAdmin) return;
    void fetch(`${apiBase}/v1/factories/${factoryId}/analytics/status`, {
      headers: { authorization: `Bearer ${token}` },
    })
      .then((r) => r.json() as Promise<AnalyticsStatus & { error?: string }>)
      .then((d) => {
        if (!d.error) setAnalytics(d);
      })
      .catch(() => {});
  }, [factoryId, isAdmin]);

  useEffect(() => {
    void Promise.resolve().then(() => {
      load();
      loadEvents();
      loadAnalytics();
    });
  }, [load, loadEvents, loadAnalytics]);

  async function runAnalyticsSync() {
    const token = getAccessToken();
    if (!token || !factoryId || !isAdmin) return;
    setSyncing(true);
    setMessage(null);
    try {
      const res = await fetch(
        `${apiBase}/v1/factories/${factoryId}/analytics/sync`,
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${token}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({ full: true }),
        },
      );
      const data = (await res.json()) as {
        error?: string;
        kpi_rows_synced?: number;
        benchmark_rows_synced?: number;
      };
      if (!res.ok) {
        setMessage(data.error ?? `sync_failed_${res.status}`);
        return;
      }
      setMessage(
        `Synced ${data.kpi_rows_synced ?? 0} KPI + ${data.benchmark_rows_synced ?? 0} benchmark rows to ClickHouse.`,
      );
      loadAnalytics();
    } catch {
      setMessage("network_error");
    } finally {
      setSyncing(false);
    }
  }

  async function sendSampleEvent() {
    const token = getAccessToken();
    if (!token || !factoryId || !contract) {
      setMessage("Select a factory in the top bar.");
      return;
    }
    setPosting(true);
    setMessage(null);
    const body = {
      ...contract.sample_event,
      factory_id: factoryId,
      external_id: `web-demo-${Date.now()}`,
    };
    try {
      const res = await fetch(`${apiBase}/v1/integrations/mes/events`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as {
        error?: string;
        id?: string;
        message?: string;
        duplicate?: boolean;
      };
      if (!res.ok) {
        setMessage(data.error ?? `post_failed_${res.status}`);
        return;
      }
      setMessage(
        data.duplicate
          ? `Duplicate external_id — existing event ${data.id}`
          : data.message ?? `Event accepted (${data.id})`,
      );
      loadEvents();
    } catch {
      setMessage("network_error");
    } finally {
      setPosting(false);
    }
  }

  return (
    <PageContainer
      title="MES integration"
      subtitle="MES stub (Sprint 22) and ClickHouse analytics sync (Sprint 26)."
    >
      {!isMember ? (
        <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
          Select a factory you belong to in the top bar.
        </p>
      ) : null}

      {loading ? <p className="text-sm text-zinc-500">Loading contract…</p> : null}

      {contract ? (
        <div className="space-y-6">
          {isAdmin ? (
            <section className="rounded-xl border border-sky-200 bg-sky-50/50 p-4 dark:border-sky-900 dark:bg-sky-950/30">
              <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-100">
                ClickHouse analytics
              </h2>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                ETL from Postgres after upload/benchmark refresh. Enable{" "}
                <code className="rounded bg-zinc-200 px-1 dark:bg-zinc-800">
                  CLICKHOUSE_ENABLED
                </code>{" "}
                in API env — see{" "}
                <code className="rounded bg-zinc-200 px-1 dark:bg-zinc-800">
                  docs/ANALYTICS.md
                </code>
                .
              </p>
              {analytics ? (
                <p className="mt-2 text-xs text-zinc-500">
                  ClickHouse: {analytics.clickhouse_health} · enabled:{" "}
                  {String(analytics.clickhouse_enabled)}
                  {analytics.recent_syncs[0]
                    ? ` · last sync ${analytics.recent_syncs[0].status} (${analytics.recent_syncs[0].started_at})`
                    : ""}
                </p>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={syncing || !factoryId}
                  onClick={() => void runAnalyticsSync()}
                  className="rounded-md bg-sky-800 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-sky-200 dark:text-sky-950"
                >
                  {syncing ? "Syncing…" : "Full sync to ClickHouse"}
                </button>
              </div>
              <p className="mt-2 text-xs text-zinc-500">
                Nightly all-factory sync:{" "}
                <code className="rounded bg-zinc-200 px-1 dark:bg-zinc-800">
                  npm run analytics:scheduler
                </code>{" "}
                or Docker profile{" "}
                <code className="rounded bg-zinc-200 px-1 dark:bg-zinc-800">
                  with-clickhouse
                </code>{" "}
                (service <code className="rounded bg-zinc-200 px-1 dark:bg-zinc-800">analytics-cron</code>
                , 02:00 UTC).
              </p>
            </section>
          ) : null}

          <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-100">
              Contract {contract.contract_version}
            </h2>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              Status: <strong>{contract.status}</strong> — capabilities:{" "}
              {contract.capabilities.join(", ")}
            </p>
            <ul className="mt-3 list-inside list-disc text-sm text-zinc-600 dark:text-zinc-400">
              {Object.entries(contract.endpoints).map(([k, v]) => (
                <li key={k}>
                  <span className="font-medium">{k}:</span> {v}
                </li>
              ))}
            </ul>
            <ul className="mt-3 list-inside list-disc text-xs text-zinc-500">
              {contract.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </section>

          <section>
            <h2 className="mb-2 text-sm font-medium text-zinc-800 dark:text-zinc-200">
              Sample event (POST body)
            </h2>
            <pre className="overflow-x-auto rounded-lg bg-zinc-100 p-4 text-xs dark:bg-zinc-950">
              {JSON.stringify(
                { ...contract.sample_event, factory_id: factoryId || "(uuid)" },
                null,
                2,
              )}
            </pre>
            <button
              type="button"
              disabled={posting || !factoryId}
              onClick={() => void sendSampleEvent()}
              className="mt-3 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
            >
              {posting ? "Sending…" : "Send sample event to inbox"}
            </button>
          </section>

          <section>
            <h2 className="mb-2 text-sm font-medium text-zinc-800 dark:text-zinc-200">
              Sample responses
            </h2>
            <pre className="overflow-x-auto rounded-lg bg-zinc-100 p-4 text-xs dark:bg-zinc-950">
              {JSON.stringify(contract.sample_responses, null, 2)}
            </pre>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-medium text-zinc-900 dark:text-zinc-100">
              Recent events
            </h2>
            {events.length === 0 ? (
              <p className="text-sm text-zinc-500">No events yet for this factory.</p>
            ) : (
              <ul className="divide-y divide-zinc-200 rounded-xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
                {events.map((ev) => (
                  <li key={ev.id} className="px-4 py-3 text-sm">
                    <p className="font-medium text-zinc-900 dark:text-zinc-100">
                      {ev.event_type}
                      {ev.line_code ? ` · ${ev.line_code}` : ""}
                    </p>
                    <p className="text-xs text-zinc-500">
                      {ev.status} · {ev.external_id ?? "no external_id"} ·{" "}
                      {new Date(ev.received_at).toLocaleString()}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      ) : null}

      {message ? (
        <p className="mt-4 text-sm text-zinc-700 dark:text-zinc-300">{message}</p>
      ) : null}
    </PageContainer>
  );
}
