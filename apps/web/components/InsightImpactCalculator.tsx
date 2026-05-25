"use client";

import Link from "next/link";
import { useCallback, useState } from "react";

import { apiBase, getAccessToken } from "../lib/api";

export interface ImpactEstimateDto {
  narrative?: string;
  currency_code?: string;
  scrap_proxy_kg?: number;
  scrap_value?: number;
  oee_uplift_pts?: number;
  oee_value_proxy?: number;
  energy_kwh_saved?: number;
  energy_value?: number;
  total_value?: number;
  monthly_output_kg?: number;
  margin_per_kg?: number;
  energy_cost_per_kwh?: number;
}

interface Props {
  factoryId: string;
  kpiCode: string;
  gapSigned: number | null;
  unit: string;
  storedEstimate?: ImpactEstimateDto;
}

export function InsightImpactCalculator({
  factoryId,
  kpiCode,
  gapSigned,
  unit,
  storedEstimate,
}: Props) {
  const [open, setOpen] = useState(false);
  const [monthlyOutputKg, setMonthlyOutputKg] = useState(
    String(storedEstimate?.monthly_output_kg ?? 50000),
  );
  const [marginPerKg, setMarginPerKg] = useState(
    String(storedEstimate?.margin_per_kg ?? 0.85),
  );
  const [energyCost, setEnergyCost] = useState(
    String(storedEstimate?.energy_cost_per_kwh ?? 0.12),
  );
  const [estimate, setEstimate] = useState<ImpactEstimateDto | null>(
    storedEstimate ?? null,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recalc = useCallback(() => {
    const token = getAccessToken();
    if (!token || gapSigned == null || !Number.isFinite(gapSigned)) return;
    setLoading(true);
    setError(null);
    void fetch(`${apiBase}/v1/factories/${factoryId}/impact-calculator`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        kpi_code: kpiCode,
        gap_signed: gapSigned,
        unit,
        monthly_output_kg: Number(monthlyOutputKg),
        margin_per_kg: Number(marginPerKg),
        energy_cost_per_kwh: Number(energyCost),
      }),
    })
      .then(
        (r) =>
          r.json() as Promise<{
            estimate?: ImpactEstimateDto;
            error?: string;
          }>,
      )
      .then((d) => {
        if (d.error) {
          setError(d.error);
          return;
        }
        setEstimate(d.estimate ?? null);
      })
      .catch(() => setError("network_error"))
      .finally(() => setLoading(false));
  }, [
    factoryId,
    gapSigned,
    kpiCode,
    unit,
    monthlyOutputKg,
    marginPerKg,
    energyCost,
  ]);

  if (gapSigned == null) return null;

  function toggleOpen() {
    const next = !open;
    setOpen(next);
    if (next) recalc();
  }

  const cur = estimate?.currency_code ?? "EUR";

  return (
    <div className="mt-3 border-t border-zinc-100 pt-3 dark:border-zinc-800">
      {estimate?.narrative && !open ? (
        <p className="text-xs text-zinc-500">Impact: {estimate.narrative}</p>
      ) : null}
      <button
        type="button"
        onClick={toggleOpen}
        className="mt-2 text-xs font-medium text-sky-700 underline dark:text-sky-400"
      >
        {open ? "Hide impact calculator" : "What-if impact calculator"}
      </button>
      {open ? (
        <div className="mt-3 rounded-lg bg-zinc-50 p-3 text-sm dark:bg-zinc-950">
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block text-xs">
              Monthly output (kg)
              <input
                type="number"
                min={1}
                value={monthlyOutputKg}
                onChange={(e) => setMonthlyOutputKg(e.target.value)}
                className="mt-1 w-full rounded border border-zinc-300 px-2 py-1 dark:border-zinc-600 dark:bg-zinc-900"
              />
            </label>
            <label className="block text-xs">
              Margin ({cur}/kg)
              <input
                type="number"
                min={0}
                step="0.01"
                value={marginPerKg}
                onChange={(e) => setMarginPerKg(e.target.value)}
                className="mt-1 w-full rounded border border-zinc-300 px-2 py-1 dark:border-zinc-600 dark:bg-zinc-900"
              />
            </label>
            <label className="block text-xs">
              Energy ({cur}/kWh)
              <input
                type="number"
                min={0}
                step="0.001"
                value={energyCost}
                onChange={(e) => setEnergyCost(e.target.value)}
                className="mt-1 w-full rounded border border-zinc-300 px-2 py-1 dark:border-zinc-600 dark:bg-zinc-900"
              />
            </label>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={loading}
              onClick={() => recalc()}
              className="rounded bg-zinc-800 px-3 py-1 text-xs text-white disabled:opacity-50 dark:bg-zinc-200 dark:text-zinc-900"
            >
              {loading ? "Calculating…" : "Recalculate"}
            </button>
            <Link
              href={`/settings?factory_id=${factoryId}`}
              className="self-center text-xs text-zinc-500 underline"
            >
              Save defaults in Settings
            </Link>
          </div>
          {error ? (
            <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>
          ) : null}
          {estimate?.narrative ? (
            <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">
              {estimate.narrative}
            </p>
          ) : null}
          {estimate?.total_value != null ? (
            <p className="mt-1 text-xs font-medium text-zinc-800 dark:text-zinc-200">
              Estimated monthly value: {estimate.total_value.toLocaleString()}{" "}
              {cur}
            </p>
          ) : null}
          <ul className="mt-2 space-y-0.5 text-xs text-zinc-500">
            {estimate?.scrap_value != null ? (
              <li>
                Scrap proxy: {estimate.scrap_proxy_kg?.toLocaleString()} kg →{" "}
                {estimate.scrap_value.toLocaleString()} {cur}
              </li>
            ) : null}
            {estimate?.oee_value_proxy != null ? (
              <li>
                OEE uplift ~{estimate.oee_uplift_pts?.toFixed(1)} pts →{" "}
                {estimate.oee_value_proxy.toLocaleString()} {cur}
              </li>
            ) : null}
            {estimate?.energy_value != null ? (
              <li>
                Energy: {estimate.energy_kwh_saved?.toLocaleString()} kWh →{" "}
                {estimate.energy_value.toLocaleString()} {cur}
              </li>
            ) : null}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
