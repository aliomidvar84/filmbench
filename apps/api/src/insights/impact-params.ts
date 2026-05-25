import type { Pool } from "pg";

export interface ImpactParams {
  currency_code: string;
  margin_per_kg: number;
  energy_cost_per_kwh: number;
  default_monthly_output_kg: number;
}

const DEFAULTS: ImpactParams = {
  currency_code: "EUR",
  margin_per_kg: 0.85,
  energy_cost_per_kwh: 0.12,
  default_monthly_output_kg: 50000,
};

export async function loadImpactParams(
  pool: Pool,
  factoryId: string,
): Promise<ImpactParams> {
  const { rows } = await pool.query<{
    currency_code: string;
    margin_per_kg: string | null;
    energy_cost_per_kwh: string | null;
    default_monthly_output_kg: string;
  }>(
    `SELECT COALESCE(s.currency_code, 'EUR') AS currency_code,
            s.margin_per_kg::text,
            s.energy_cost_per_kwh::text,
            COALESCE(s.default_monthly_output_kg, 50000)::text AS default_monthly_output_kg
     FROM factories f
     LEFT JOIN factory_settings s ON s.factory_id = f.id
     WHERE f.id = $1::uuid`,
    [factoryId],
  );
  const row = rows[0];
  if (!row) return { ...DEFAULTS };

  const margin = row.margin_per_kg != null ? Number(row.margin_per_kg) : DEFAULTS.margin_per_kg;
  const energy =
    row.energy_cost_per_kwh != null
      ? Number(row.energy_cost_per_kwh)
      : DEFAULTS.energy_cost_per_kwh;
  const output = Number(row.default_monthly_output_kg);

  return {
    currency_code: row.currency_code || DEFAULTS.currency_code,
    margin_per_kg: Number.isFinite(margin) ? margin : DEFAULTS.margin_per_kg,
    energy_cost_per_kwh: Number.isFinite(energy) ? energy : DEFAULTS.energy_cost_per_kwh,
    default_monthly_output_kg: Number.isFinite(output) && output > 0
      ? output
      : DEFAULTS.default_monthly_output_kg,
  };
}

export function mergeImpactParams(
  base: ImpactParams,
  overrides?: Partial<ImpactParams> & { monthly_output_kg?: number },
): ImpactParams & { monthly_output_kg: number } {
  return {
    currency_code: overrides?.currency_code ?? base.currency_code,
    margin_per_kg:
      overrides?.margin_per_kg != null && Number.isFinite(overrides.margin_per_kg)
        ? overrides.margin_per_kg
        : base.margin_per_kg,
    energy_cost_per_kwh:
      overrides?.energy_cost_per_kwh != null &&
      Number.isFinite(overrides.energy_cost_per_kwh)
        ? overrides.energy_cost_per_kwh
        : base.energy_cost_per_kwh,
    default_monthly_output_kg: base.default_monthly_output_kg,
    monthly_output_kg:
      overrides?.monthly_output_kg != null &&
      Number.isFinite(overrides.monthly_output_kg) &&
      overrides.monthly_output_kg > 0
        ? overrides.monthly_output_kg
        : base.default_monthly_output_kg,
  };
}
