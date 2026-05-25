import { toCsv } from "../http/csv.js";
import type { ExecutiveReportContext } from "./executive-data.js";

function metaLine(label: string, value: string): string {
  return `# ${label}: ${value}`;
}

function sectionCsv(title: string, headers: string[], rows: string[][]): string {
  const block = toCsv(headers, rows);
  return `# ${title}\r\n${block}`;
}

export function buildExecutiveReportCsv(ctx: ExecutiveReportContext): string {
  const periodLabel = ctx.period_label ?? ctx.period_end;
  const scope = ctx.line_code ? `Line ${ctx.line_code}` : "All lines";

  const header = [
    "# FilmBench Executive Report",
    metaLine("Factory", ctx.factory_name),
    metaLine("Reporting period", periodLabel),
    metaLine("Scope", scope),
    metaLine("Generated at (UTC)", ctx.generated_at_iso),
    "",
  ].join("\r\n");

  const summary = sectionCsv(
    "Summary counts",
    ["metric", "value"],
    [
      ["lines", String(ctx.counts.lines)],
      ["kpi_results", String(ctx.counts.kpi_results)],
      ["validation_errors", String(ctx.counts.validation_errors)],
      ["validation_warnings", String(ctx.counts.validation_warnings)],
      ["below_factory_target", String(ctx.counts.below_target)],
      ["below_peer_median", String(ctx.counts.below_peer_median)],
      ["insufficient_peer_sample", String(ctx.counts.insufficient_peer_sample)],
      ["targets_defined", String(ctx.counts.targets_defined)],
    ],
  );

  const priorities = sectionCsv(
    "Priority items",
    ["kind", "line_code", "ref_code", "message", "severity", "metric_value"],
    ctx.priorities.map((p) => [
      String(p.kind ?? ""),
      String(p.line_code ?? ""),
      String(p.ref_code ?? ""),
      String(p.message ?? ""),
      String(p.severity ?? ""),
      String(p.metric_value ?? ""),
    ]),
  );

  const below = sectionCsv(
    "Below factory target",
    [
      "line_code",
      "kpi_code",
      "kpi_name",
      "unit",
      "direction",
      "current_value",
      "target_value",
      "gap_to_target_signed",
    ],
    ctx.below_target.map((r) => [
      String(r.line_code ?? ""),
      String(r.kpi_code ?? ""),
      String(r.kpi_name ?? ""),
      String(r.definition_unit ?? ""),
      String(r.direction ?? ""),
      String(r.current_value ?? ""),
      String(r.target_value ?? ""),
      String(r.gap_to_target_signed ?? ""),
    ]),
  );

  const gaps = sectionCsv(
    "Benchmark gaps (below peer median)",
    [
      "line_code",
      "kpi_code",
      "kpi_name",
      "current_value",
      "peer_p50",
      "gap_to_median_signed",
      "gap_to_best_practice_signed",
      "comparison_status",
    ],
    ctx.benchmark_gaps.map((r) => [
      String(r.line_code ?? ""),
      String(r.kpi_code ?? ""),
      String(r.kpi_name ?? ""),
      String(r.current_value ?? ""),
      String(r.peer_p50 ?? ""),
      String(r.gap_to_median_signed ?? ""),
      String(r.gap_to_best_practice_signed ?? ""),
      String(r.comparison_status ?? ""),
    ]),
  );

  return `\uFEFF${header}\r\n${summary}\r\n${priorities}\r\n${below}\r\n${gaps}`;
}
