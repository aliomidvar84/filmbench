"use client";

import { useCallback, useEffect, useState } from "react";

import { PageContainer } from "../../../../components/PageContainer";
import { apiBase, getAccessToken } from "../../../../lib/api";
import { useFactoryPeriod } from "../../../../lib/factory-period-context";

interface InsightRuleRow {
  id: string;
  rule_code: string;
  rule_group: string;
  name: string;
  is_active: boolean;
  severity: string;
  priority_weight: string;
  condition_type: string;
  condition_config: Record<string, unknown>;
  kpi_code_filter: string | null;
}

interface RegressionResult {
  rule_code: string;
  matches_found: number;
  sample_insights: { title: string; severity: string; line_code: string }[];
}

export default function AdminInsightRulesPage() {
  const { factoryId, periodId, selectedFactory } = useFactoryPeriod();
  const [rules, setRules] = useState<InsightRuleRow[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [regression, setRegression] = useState<RegressionResult | null>(null);
  const [draftThresholds, setDraftThresholds] = useState<Record<string, string>>(
    {},
  );

  const isAdmin = Boolean(selectedFactory?.can_administer);

  const load = useCallback(() => {
    const token = getAccessToken();
    if (!token || !isAdmin) return;
    setLoading(true);
    void fetch(`${apiBase}/v1/admin/insight-rules`, {
      headers: { authorization: `Bearer ${token}` },
    })
      .then((r) => r.json() as Promise<{ rules?: InsightRuleRow[]; error?: string }>)
      .then((d) => {
        if (!d.rules) {
          setMessage(d.error ?? "load_failed");
          return;
        }
        setRules(d.rules);
        const th: Record<string, string> = {};
        for (const rule of d.rules) {
          const cfg = rule.condition_config ?? {};
          if (cfg.min_gap != null) th[rule.id] = String(cfg.min_gap);
          else if (cfg.max_percentile != null) th[rule.id] = String(cfg.max_percentile);
          else th[rule.id] = "";
        }
        setDraftThresholds(th);
        setMessage(null);
      })
      .catch(() => setMessage("network_error"))
      .finally(() => setLoading(false));
  }, [isAdmin]);

  useEffect(() => {
    void Promise.resolve().then(() => load());
  }, [load]);

  async function saveRule(rule: InsightRuleRow) {
    const token = getAccessToken();
    if (!token) return;
    setSavingId(rule.id);
    setMessage(null);
    const thRaw = draftThresholds[rule.id]?.trim() ?? "";
    const condition_config: Record<string, unknown> = {};
    if (thRaw) {
      const n = Number(thRaw);
      if (!Number.isFinite(n)) {
        setMessage("invalid_threshold");
        setSavingId(null);
        return;
      }
      if (rule.condition_type === "low_percentile") {
        condition_config.max_percentile = n;
      } else {
        condition_config.min_gap = n;
      }
    }

    try {
      const res = await fetch(`${apiBase}/v1/admin/insight-rules/${rule.id}`, {
        method: "PATCH",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          is_active: rule.is_active,
          severity: rule.severity,
          priority_weight: Number(rule.priority_weight),
          condition_config: thRaw ? condition_config : undefined,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setMessage(data.error ?? `save_failed_${res.status}`);
        return;
      }
      setMessage(`Saved ${rule.rule_code}.`);
      load();
    } catch {
      setMessage("network_error");
    } finally {
      setSavingId(null);
    }
  }

  async function runRegression(ruleId: string) {
    const token = getAccessToken();
    if (!token || !factoryId || !periodId) {
      setMessage("Select factory and period in the top bar.");
      return;
    }
    setTestingId(ruleId);
    setRegression(null);
    setMessage(null);
    try {
      const res = await fetch(
        `${apiBase}/v1/admin/insight-rules/${ruleId}/regression-test`,
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${token}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            factory_id: factoryId,
            reporting_period_id: periodId,
          }),
        },
      );
      const data = (await res.json()) as RegressionResult & { error?: string };
      if (!res.ok) {
        setMessage(data.error ?? `test_failed_${res.status}`);
        return;
      }
      setRegression(data);
      setMessage(
        `${data.rule_code}: ${data.matches_found} match(es) on sample period.`,
      );
    } catch {
      setMessage("network_error");
    } finally {
      setTestingId(null);
    }
  }

  if (!isAdmin) {
    return (
      <PageContainer
        title="Insight rules"
        subtitle="Configure insight engine rules (factory admin)."
      >
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Factory admin role required.
        </p>
      </PageContainer>
    );
  }

  const thresholdLabel = (rule: InsightRuleRow) =>
    rule.condition_type === "low_percentile" ? "max_percentile" : "min_gap";

  return (
    <PageContainer
      title="Insight rules"
      subtitle="Enable/disable rules and tune thresholds (Sprint 24). Changes are audit-logged."
    >
      {loading ? <p className="text-sm text-zinc-500">Loading rules…</p> : null}
      {message ? (
        <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">{message}</p>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <table className="min-w-full text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-200 dark:border-zinc-700">
              <th className="px-3 py-2">Active</th>
              <th className="px-3 py-2">Code</th>
              <th className="px-3 py-2">Severity</th>
              <th className="px-3 py-2">Weight</th>
              <th className="px-3 py-2">Threshold</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rules.map((rule) => (
              <tr
                key={rule.id}
                className="border-b border-zinc-100 dark:border-zinc-800"
              >
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    checked={rule.is_active}
                    onChange={(e) =>
                      setRules((prev) =>
                        prev.map((r) =>
                          r.id === rule.id
                            ? { ...r, is_active: e.target.checked }
                            : r,
                        ),
                      )
                    }
                  />
                </td>
                <td className="px-3 py-2">
                  <div className="font-mono text-xs">{rule.rule_code}</div>
                  <div className="text-xs text-zinc-500">{rule.name}</div>
                </td>
                <td className="px-3 py-2">
                  <select
                    className="rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-600 dark:bg-zinc-950"
                    value={rule.severity}
                    onChange={(e) =>
                      setRules((prev) =>
                        prev.map((r) =>
                          r.id === rule.id ? { ...r, severity: e.target.value } : r,
                        ),
                      )
                    }
                  >
                    <option value="info">info</option>
                    <option value="warning">warning</option>
                    <option value="critical">critical</option>
                  </select>
                </td>
                <td className="px-3 py-2">
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    className="w-16 rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-600 dark:bg-zinc-950"
                    value={rule.priority_weight}
                    onChange={(e) =>
                      setRules((prev) =>
                        prev.map((r) =>
                          r.id === rule.id
                            ? { ...r, priority_weight: e.target.value }
                            : r,
                        ),
                      )
                    }
                  />
                </td>
                <td className="px-3 py-2">
                  {["below_peer_median", "below_target", "low_percentile"].includes(
                    rule.condition_type,
                  ) ? (
                    <label className="flex flex-col text-xs text-zinc-500">
                      {thresholdLabel(rule)}
                      <input
                        type="text"
                        className="mt-0.5 w-24 rounded border border-zinc-300 px-2 py-1 dark:border-zinc-600 dark:bg-zinc-950"
                        value={draftThresholds[rule.id] ?? ""}
                        onChange={(e) =>
                          setDraftThresholds((prev) => ({
                            ...prev,
                            [rule.id]: e.target.value,
                          }))
                        }
                        placeholder="—"
                      />
                    </label>
                  ) : (
                    <span className="text-xs text-zinc-400">—</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={savingId === rule.id}
                      onClick={() => void saveRule(rule)}
                      className="text-xs font-medium text-sky-700 underline disabled:opacity-50 dark:text-sky-400"
                    >
                      {savingId === rule.id ? "Saving…" : "Save"}
                    </button>
                    <button
                      type="button"
                      disabled={testingId === rule.id}
                      onClick={() => void runRegression(rule.id)}
                      className="text-xs font-medium text-zinc-700 underline disabled:opacity-50 dark:text-zinc-300"
                    >
                      {testingId === rule.id ? "Testing…" : "Test"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {regression?.sample_insights?.length ? (
        <div className="mt-6 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-sm font-semibold">Regression sample</h2>
          <ul className="mt-2 space-y-2 text-sm">
            {regression.sample_insights.map((s, i) => (
              <li key={i}>
                <span className="font-medium">{s.title}</span> ({s.severity},{" "}
                {s.line_code})
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </PageContainer>
  );
}
