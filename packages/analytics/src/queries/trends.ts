import type { Pool } from "pg";

import { clickhouseDatabase, useClickHouseQueries } from "../config.js";
import { escapeChString, queryClickHouseJson } from "../client.js";
import { pingClickHouse } from "../client.js";

export interface RawTrendRow {
  kpi_code: string;
  kpi_name: string;
  definition_unit: string;
  reporting_period_id: string;
  period_start: string;
  period_end: string;
  label: string | null;
  kpi_value: string | null;
  calculation_status: string;
}

export interface TrendQueryInput {
  factoryId: string;
  lineId: string;
  maxPeriods: number;
  kpiCodes: string[];
}

async function queryTrendsFromClickHouse(
  input: TrendQueryInput,
): Promise<RawTrendRow[] | null> {
  if (!useClickHouseQueries()) return null;
  if ((await pingClickHouse()) !== "ok") return null;

  const db = clickhouseDatabase();
  const fid = escapeChString(input.factoryId);
  const lid = escapeChString(input.lineId);
  const codes = input.kpiCodes
    .map((c) => `'${escapeChString(c)}'`)
    .join(", ");
  const codeClause =
    input.kpiCodes.length > 0 ? ` AND kpi_code IN (${codes})` : "";

  const sql = `
SELECT k.kpi_code,
       k.kpi_name,
       k.definition_unit,
       toString(k.reporting_period_id) AS reporting_period_id,
       toString(k.period_start) AS period_start,
       toString(k.period_end) AS period_end,
       nullIf(k.label, '') AS label,
       toString(k.kpi_value) AS kpi_value,
       k.calculation_status
FROM ${db}.kpi_monthly_fact AS k FINAL
INNER JOIN (
  SELECT reporting_period_id
  FROM ${db}.kpi_monthly_fact
  WHERE factory_id = toUUID('${fid}')
    AND line_id = toUUID('${lid}')
  GROUP BY reporting_period_id, period_end
  ORDER BY period_end DESC
  LIMIT ${input.maxPeriods}
) AS recent ON k.reporting_period_id = recent.reporting_period_id
WHERE k.factory_id = toUUID('${fid}')
  AND k.line_id = toUUID('${lid}')${codeClause}
ORDER BY k.period_end ASC, k.kpi_code`;

  const rows = await queryClickHouseJson<RawTrendRow>(sql);
  return rows.map((r) => ({
    ...r,
    label: r.label === "" || r.label == null ? null : r.label,
  }));
}

async function queryTrendsFromPostgres(
  pool: Pool,
  input: TrendQueryInput,
): Promise<RawTrendRow[]> {
  const { rows } = await pool.query<RawTrendRow>(
    `WITH recent_periods AS (
       SELECT rp.id
       FROM reporting_periods rp
       INNER JOIN kpi_results kr ON kr.reporting_period_id = rp.id
       WHERE kr.factory_id = $1::uuid
         AND kr.line_id = $2::uuid
         AND rp.period_type = 'monthly'
       GROUP BY rp.id, rp.period_end
       ORDER BY rp.period_end DESC
       LIMIT $3
     )
     SELECT kr.kpi_code,
            kd.name AS kpi_name,
            kd.unit AS definition_unit,
            rp.id::text AS reporting_period_id,
            rp.period_start::text AS period_start,
            rp.period_end::text AS period_end,
            rp.label,
            kr.kpi_value::text AS kpi_value,
            kr.calculation_status
     FROM kpi_results kr
     INNER JOIN recent_periods p ON p.id = kr.reporting_period_id
     INNER JOIN reporting_periods rp ON rp.id = kr.reporting_period_id
     INNER JOIN kpi_definitions kd ON kd.kpi_code = kr.kpi_code
     WHERE kr.factory_id = $1::uuid
       AND kr.line_id = $2::uuid
       AND (cardinality($4::text[]) = 0 OR kr.kpi_code = ANY ($4::text[]))
     ORDER BY rp.period_end ASC, kr.kpi_code`,
    [input.factoryId, input.lineId, input.maxPeriods, input.kpiCodes],
  );
  return rows;
}

export async function fetchKpiTrendRows(
  pool: Pool,
  input: TrendQueryInput,
): Promise<{ rows: RawTrendRow[]; source: "clickhouse" | "postgres" }> {
  try {
    const ch = await queryTrendsFromClickHouse(input);
    if (ch && ch.length > 0) {
      return { rows: ch, source: "clickhouse" };
    }
  } catch {
    /* fallback */
  }
  const rows = await queryTrendsFromPostgres(pool, input);
  return { rows, source: "postgres" };
}
