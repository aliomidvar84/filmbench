"use client";

import type { FormEvent } from "react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { PageContainer } from "../../../components/PageContainer";
import { apiBase, getAccessToken } from "../../../lib/api";
import { useFactoryPeriod } from "../../../lib/factory-period-context";

interface SettingsDto {
  factory_id: string;
  factory_name: string;
  anonymized_code: string;
  display_name: string | null;
  currency_code: string;
  timezone: string;
  normalize_by_capacity: boolean;
  normalize_by_width: boolean;
  margin_per_kg: string | null;
  energy_cost_per_kwh: string | null;
  default_monthly_output_kg: string;
  updated_at: string;
}

const TIMEZONES = [
  "UTC",
  "Europe/Berlin",
  "Europe/Istanbul",
  "Europe/London",
  "America/New_York",
  "Asia/Dubai",
];

const CURRENCIES = ["EUR", "USD", "GBP", "TRY", "CHF"];

type TabId = "profile" | "impact" | "team";

export default function SettingsPage() {
  const { factoryId, selectedFactory } = useFactoryPeriod();
  const [tab, setTab] = useState<TabId>("profile");
  const [settings, setSettings] = useState<SettingsDto | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [currencyCode, setCurrencyCode] = useState("EUR");
  const [timezone, setTimezone] = useState("UTC");
  const [normalizeByCapacity, setNormalizeByCapacity] = useState(false);
  const [normalizeByWidth, setNormalizeByWidth] = useState(true);
  const [marginPerKg, setMarginPerKg] = useState("0.85");
  const [energyCostPerKwh, setEnergyCostPerKwh] = useState("0.12");
  const [defaultMonthlyOutputKg, setDefaultMonthlyOutputKg] = useState("50000");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const isAdmin = Boolean(selectedFactory?.can_administer);

  const load = useCallback(() => {
    const token = getAccessToken();
    if (!token || !factoryId || !isAdmin) return;
    setLoading(true);
    void fetch(`${apiBase}/v1/factories/${factoryId}/settings`, {
      headers: { authorization: `Bearer ${token}` },
    })
      .then((r) => r.json() as Promise<{ settings?: SettingsDto; error?: string }>)
      .then((d) => {
        if (d.error || !d.settings) {
          setMessage(d.error ?? "load_failed");
          setSettings(null);
          return;
        }
        setSettings(d.settings);
        setDisplayName(d.settings.display_name ?? "");
        setCurrencyCode(d.settings.currency_code);
        setTimezone(d.settings.timezone);
        setNormalizeByCapacity(d.settings.normalize_by_capacity);
        setNormalizeByWidth(d.settings.normalize_by_width);
        setMarginPerKg(d.settings.margin_per_kg ?? "0.85");
        setEnergyCostPerKwh(d.settings.energy_cost_per_kwh ?? "0.12");
        setDefaultMonthlyOutputKg(d.settings.default_monthly_output_kg ?? "50000");
        setMessage(null);
      })
      .catch(() => setMessage("network_error"))
      .finally(() => setLoading(false));
  }, [factoryId, isAdmin]);

  useEffect(() => {
    void Promise.resolve().then(() => load());
  }, [load]);

  async function onSave(e: FormEvent) {
    e.preventDefault();
    const token = getAccessToken();
    if (!token || !factoryId || !isAdmin) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(`${apiBase}/v1/factories/${factoryId}/settings`, {
        method: "PATCH",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          display_name: displayName.trim() || null,
          currency_code: currencyCode,
          timezone,
          normalize_by_capacity: normalizeByCapacity,
          normalize_by_width: normalizeByWidth,
        }),
      });
      const data = (await res.json()) as {
        settings?: SettingsDto;
        error?: string;
      };
      if (!res.ok) {
        setMessage(data.error ?? `save_failed_${res.status}`);
        return;
      }
      if (data.settings) setSettings(data.settings);
      setMessage("Settings saved.");
    } catch {
      setMessage("network_error");
    } finally {
      setSaving(false);
    }
  }

  if (!isAdmin) {
    return (
      <PageContainer
        title="Settings"
        subtitle="Factory profile and team (admin only)."
      >
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          You need factory admin role to change settings. Select a factory where you
          are admin.
        </p>
      </PageContainer>
    );
  }

  return (
    <PageContainer
      title="Settings"
      subtitle="Factory profile, impact calculator defaults, and benchmark normalization (Sprint 20 + 28)."
    >
      <div className="mb-6 flex gap-2 border-b border-zinc-200 dark:border-zinc-800">
        <button
          type="button"
          onClick={() => setTab("profile")}
          className={`border-b-2 px-3 py-2 text-sm font-medium ${
            tab === "profile"
              ? "border-zinc-900 text-zinc-900 dark:border-zinc-100 dark:text-zinc-100"
              : "border-transparent text-zinc-500"
          }`}
        >
          Factory profile
        </button>
        <button
          type="button"
          onClick={() => setTab("impact")}
          className={`border-b-2 px-3 py-2 text-sm font-medium ${
            tab === "impact"
              ? "border-zinc-900 text-zinc-900 dark:border-zinc-100 dark:text-zinc-100"
              : "border-transparent text-zinc-500"
          }`}
        >
          Impact calculator
        </button>
        <button
          type="button"
          onClick={() => setTab("team")}
          className={`border-b-2 px-3 py-2 text-sm font-medium ${
            tab === "team"
              ? "border-zinc-900 text-zinc-900 dark:border-zinc-100 dark:text-zinc-100"
              : "border-transparent text-zinc-500"
          }`}
        >
          Team
        </button>
      </div>

      {tab === "team" ? (
        <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-sm text-zinc-700 dark:text-zinc-300">
            Manage members, upload history, and audit events on the Team page (same
            app shell).
          </p>
          <Link
            href={`/team?factory_id=${factoryId}`}
            className="mt-4 inline-block rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
          >
            Open Team
          </Link>
          <Link
            href={`/integrations?factory_id=${factoryId}`}
            className="mt-3 ml-3 inline-block rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium dark:border-zinc-600"
          >
            MES contract
          </Link>
          <Link
            href="/admin/rules"
            className="mt-3 ml-3 inline-block rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium dark:border-zinc-600"
          >
            Insight rules
          </Link>
        </div>
      ) : null}

      {tab === "impact" ? (
        <>
          {message ? (
            <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">{message}</p>
          ) : null}
          {loading ? <p className="text-sm text-zinc-500">Loading…</p> : null}
          <form
            onSubmit={(ev) => void onSave(ev)}
            className="max-w-lg space-y-4 rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900"
          >
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Defaults for insight what-if estimates (currency: {currencyCode}).
            </p>
            <label className="block text-sm">
              <span className="font-medium text-zinc-800 dark:text-zinc-200">
                Margin per kg ({currencyCode})
              </span>
              <input
                type="number"
                min={0}
                step="0.01"
                value={marginPerKg}
                onChange={(e) => setMarginPerKg(e.target.value)}
                className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-600 dark:bg-zinc-950"
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-zinc-800 dark:text-zinc-200">
                Energy cost per kWh ({currencyCode})
              </span>
              <input
                type="number"
                min={0}
                step="0.001"
                value={energyCostPerKwh}
                onChange={(e) => setEnergyCostPerKwh(e.target.value)}
                className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-600 dark:bg-zinc-950"
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-zinc-800 dark:text-zinc-200">
                Default monthly output (kg)
              </span>
              <input
                type="number"
                min={1}
                value={defaultMonthlyOutputKg}
                onChange={(e) => setDefaultMonthlyOutputKg(e.target.value)}
                className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-600 dark:bg-zinc-950"
              />
            </label>
            <button
              type="submit"
              disabled={saving || loading}
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
            >
              {saving ? "Saving…" : "Save impact defaults"}
            </button>
          </form>
        </>
      ) : null}

      {tab === "profile" ? (
        <>
          {settings ? (
            <p className="mb-4 text-xs text-zinc-500">
              Legal name: {settings.factory_name} · code {settings.anonymized_code}
              {settings.updated_at ? ` · updated ${settings.updated_at}` : ""}
            </p>
          ) : null}
          {message ? (
            <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">{message}</p>
          ) : null}
          {loading ? <p className="text-sm text-zinc-500">Loading…</p> : null}
          <form
            onSubmit={(ev) => void onSave(ev)}
            className="max-w-lg space-y-4 rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900"
          >
            <label className="block text-sm">
              <span className="font-medium text-zinc-800 dark:text-zinc-200">
                Display name
              </span>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-600 dark:bg-zinc-950"
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-zinc-800 dark:text-zinc-200">
                Currency
              </span>
              <select
                value={currencyCode}
                onChange={(e) => setCurrencyCode(e.target.value)}
                className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-600 dark:bg-zinc-950"
              >
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="font-medium text-zinc-800 dark:text-zinc-200">
                Timezone
              </span>
              <select
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-600 dark:bg-zinc-950"
              >
                {TIMEZONES.includes(timezone) ? null : (
                  <option value={timezone}>{timezone}</option>
                )}
                {TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </select>
            </label>
            <fieldset className="space-y-2 text-sm">
              <legend className="font-medium text-zinc-800 dark:text-zinc-200">
                Benchmark normalization
              </legend>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={normalizeByWidth}
                  onChange={(e) => setNormalizeByWidth(e.target.checked)}
                />
                Normalize by line width cohort
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={normalizeByCapacity}
                  onChange={(e) => setNormalizeByCapacity(e.target.checked)}
                />
                Normalize by annual capacity
              </label>
            </fieldset>
            <button
              type="submit"
              disabled={saving || loading}
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
            >
              {saving ? "Saving…" : "Save settings"}
            </button>
          </form>
        </>
      ) : null}
    </PageContainer>
  );
}
