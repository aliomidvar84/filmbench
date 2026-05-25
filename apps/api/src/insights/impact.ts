/** Sprint 19/28 — impact narrative + calculator breakdown (A6 §14). */

import type { ImpactParams } from "./impact-params.js";

export interface ImpactEstimate {
  narrative: string;
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

type ParamsWithOutput = ImpactParams & { monthly_output_kg: number };

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

export function calculateImpact(
  kpiCode: string,
  gapSigned: number | null,
  unit: string,
  params: ParamsWithOutput,
): ImpactEstimate {
  if (gapSigned == null || Number.isNaN(gapSigned)) {
    return { narrative: "Impact estimate unavailable.", currency_code: params.currency_code };
  }

  const cur = params.currency_code;
  const outKg = params.monthly_output_kg;
  const margin = params.margin_per_kg;
  const energyCost = params.energy_cost_per_kwh;

  if (kpiCode === "SCRAP_RATE" && unit === "ratio" && gapSigned < 0) {
    const gapRatio = Math.abs(gapSigned);
    const scrapKg = Math.round(gapRatio * outKg);
    const scrapValue = roundMoney(scrapKg * margin);
    return {
      narrative: `Closing ~${(gapRatio * 100).toFixed(1)} pts scrap vs peers ≈ ${scrapKg.toLocaleString()} kg/month material at risk (~${scrapValue.toLocaleString()} ${cur} margin proxy).`,
      currency_code: cur,
      scrap_proxy_kg: scrapKg,
      scrap_value: scrapValue,
      total_value: scrapValue,
      monthly_output_kg: outKg,
      margin_per_kg: margin,
      energy_cost_per_kwh: energyCost,
    };
  }

  if (kpiCode === "OEE" && gapSigned < 0) {
    const pts = Math.abs(gapSigned * 100);
    const valueProxy = roundMoney(pts * 0.01 * outKg * margin * 0.35);
    return {
      narrative: `~${pts.toFixed(1)} pt OEE gap vs peers → ~${valueProxy.toLocaleString()} ${cur}/month throughput value proxy (35% of margin × output).`,
      currency_code: cur,
      oee_uplift_pts: pts,
      oee_value_proxy: valueProxy,
      total_value: valueProxy,
      monthly_output_kg: outKg,
      margin_per_kg: margin,
      energy_cost_per_kwh: energyCost,
    };
  }

  if (kpiCode === "ENERGY_PER_KG" && gapSigned < 0) {
    const extraKwhPerKg = Math.abs(gapSigned);
    const kwh = roundMoney(extraKwhPerKg * outKg);
    const energyValue = roundMoney(kwh * energyCost);
    return {
      narrative: `~${extraKwhPerKg.toFixed(3)} kWh/kg above peers on ${outKg.toLocaleString()} kg output ≈ ${kwh.toLocaleString()} kWh (~${energyValue.toLocaleString()} ${cur}/month).`,
      currency_code: cur,
      energy_kwh_saved: kwh,
      energy_value: energyValue,
      total_value: energyValue,
      monthly_output_kg: outKg,
      margin_per_kg: margin,
      energy_cost_per_kwh: energyCost,
    };
  }

  return {
    narrative:
      gapSigned < 0
        ? "Performance is below the peer reference; adjust margin/output in Settings for a tailored estimate."
        : "Performance is at or above peer reference.",
    currency_code: cur,
    monthly_output_kg: outKg,
    margin_per_kg: margin,
    energy_cost_per_kwh: energyCost,
  };
}

export function estimateImpact(
  kpiCode: string,
  gapSigned: number | null,
  unit: string,
  params?: ImpactParams | (ImpactParams & { monthly_output_kg: number }),
): ImpactEstimate {
  const base: ParamsWithOutput = params
    ? "monthly_output_kg" in params
      ? (params as ParamsWithOutput)
      : { ...params, monthly_output_kg: params.default_monthly_output_kg }
    : {
        currency_code: "EUR",
        margin_per_kg: 0.85,
        energy_cost_per_kwh: 0.12,
        default_monthly_output_kg: 50000,
        monthly_output_kg: 50000,
      };
  return calculateImpact(kpiCode, gapSigned, unit, base);
}
