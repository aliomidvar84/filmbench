/** Sprint 7 — pure grouping for KPI time-series API responses. */

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

export interface TrendPoint {
  reporting_period_id: string;
  period_start: string;
  period_end: string;
  label: string | null;
  kpi_value: string | null;
  calculation_status: string;
}

export interface TrendSeries {
  kpi_code: string;
  kpi_name: string;
  definition_unit: string;
  points: TrendPoint[];
}

export interface TrendPeriodColumn {
  id: string;
  period_end: string;
  label: string | null;
}

export function trendPeriodColumns(series: TrendSeries[]): TrendPeriodColumn[] {
  const map = new Map<string, TrendPeriodColumn>();
  for (const s of series) {
    for (const p of s.points) {
      if (!map.has(p.reporting_period_id)) {
        map.set(p.reporting_period_id, {
          id: p.reporting_period_id,
          period_end: p.period_end,
          label: p.label,
        });
      }
    }
  }
  return [...map.values()].sort((a, b) => a.period_end.localeCompare(b.period_end));
}

export function trendPointValue(series: TrendSeries, periodId: string): string {
  const pt = series.points.find((p) => p.reporting_period_id === periodId);
  return pt?.kpi_value ?? "";
}

export function groupKpiTrendRows(rows: RawTrendRow[]): TrendSeries[] {
  const byCode = new Map<string, TrendSeries>();
  for (const r of rows) {
    let s = byCode.get(r.kpi_code);
    if (!s) {
      s = {
        kpi_code: r.kpi_code,
        kpi_name: r.kpi_name,
        definition_unit: r.definition_unit,
        points: [],
      };
      byCode.set(r.kpi_code, s);
    }
    s.points.push({
      reporting_period_id: r.reporting_period_id,
      period_start: r.period_start,
      period_end: r.period_end,
      label: r.label,
      kpi_value: r.kpi_value,
      calculation_status: r.calculation_status,
    });
  }
  return [...byCode.values()].sort((a, b) => a.kpi_code.localeCompare(b.kpi_code));
}
