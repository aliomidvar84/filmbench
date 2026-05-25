import type { Pool } from "pg";

import { formatRatioAsPercent } from "@filmbench/shared";

import { loadEvaluationContext } from "./context.js";
import { mergeImpactParams, loadImpactParams } from "./impact-params.js";
import { estimateImpact } from "./impact.js";
import type { ImpactParams } from "./impact-params.js";
import { computePriorityScore } from "./priority.js";
import { renderTemplate } from "./template.js";
import type { InsightDraft, InsightRuleRow } from "./types.js";

function fmtValue(unit: string, raw: string | null): string {
  if (raw == null || raw === "") return "—";
  const n = Number(raw);
  if (Number.isNaN(n)) return raw;
  if (unit === "ratio") return formatRatioAsPercent(n);
  return n.toLocaleString(undefined, { maximumFractionDigits: 6 });
}

function matchesKpiFilter(rule: InsightRuleRow, kpiCode: string | null): boolean {
  if (!rule.kpi_code_filter) return true;
  return kpiCode === rule.kpi_code_filter;
}

type ImpactParamsWithOutput = ImpactParams & { monthly_output_kg: number };

function evaluateRule(
  rule: InsightRuleRow,
  ctx: Awaited<ReturnType<typeof loadEvaluationContext>>,
  factoryId: string,
  periodId: string,
  impactParams: ImpactParamsWithOutput,
): InsightDraft[] {
  const out: InsightDraft[] = [];
  const cfg = rule.condition_config ?? {};

  if (rule.condition_type === "below_peer_median") {
    for (const row of ctx.benchmark) {
      if (!matchesKpiFilter(rule, row.kpi_code)) continue;
      if (row.comparison_status !== "ok") continue;
      const gap = Number(row.gap_to_median_signed);
      if (!Number.isFinite(gap) || gap >= 0) continue;
      const gapMag = Math.abs(gap);
      const minGap = Number(cfg.min_gap ?? 0);
      if (Number.isFinite(minGap) && gapMag < minGap) continue;
      const vars = {
        line_code: row.line_code,
        kpi_code: row.kpi_code,
        current_value: fmtValue(row.definition_unit, row.current_value),
        gap_signed: fmtValue(row.definition_unit, row.gap_to_median_signed),
        peer_sample_size: String(row.peer_sample_size ?? ""),
        percentile: row.estimated_percentile != null ? String(row.estimated_percentile) : "",
      };
      const impact = estimateImpact(
        row.kpi_code,
        gap,
        row.definition_unit,
        impactParams,
      );
      out.push({
        factory_id: factoryId,
        line_id: row.line_id,
        line_code: row.line_code,
        reporting_period_id: periodId,
        rule_id: rule.id,
        rule_code: rule.rule_code,
        severity: rule.severity,
        priority_score: computePriorityScore(rule.severity, Number(rule.priority_weight), gapMag),
        title: renderTemplate(rule.title_template, vars),
        body: renderTemplate(rule.body_template, vars),
        kpi_code: row.kpi_code,
        impact_estimate: impact,
        metadata: {
          gap_to_median_signed: row.gap_to_median_signed,
          cohort_key: row.cohort_key,
          definition_unit: row.definition_unit,
        },
      });
    }
    return out;
  }

  if (rule.condition_type === "below_target") {
    const minGap = Number(cfg.min_gap ?? 0);
    for (const row of ctx.belowTarget) {
      if (!matchesKpiFilter(rule, row.kpi_code)) continue;
      const gap = Number(row.gap_to_target_signed);
      if (Number.isFinite(minGap) && minGap > 0) {
        const gapMag = Math.abs(gap);
        if (!Number.isFinite(gapMag) || gapMag < minGap) continue;
      }
      const vars = {
        line_code: row.line_code,
        kpi_code: row.kpi_code,
        kpi_name: row.kpi_name,
        current_value: fmtValue(row.definition_unit, row.current_value),
        target_value: fmtValue(row.definition_unit, row.target_value),
        gap_signed: fmtValue(row.definition_unit, row.gap_to_target_signed),
      };
      const impact = estimateImpact(
        row.kpi_code,
        gap,
        row.definition_unit,
        impactParams,
      );
      out.push({
        factory_id: factoryId,
        line_id: row.line_id,
        line_code: row.line_code,
        reporting_period_id: periodId,
        rule_id: rule.id,
        rule_code: rule.rule_code,
        severity: rule.severity,
        priority_score: computePriorityScore(
          rule.severity,
          Number(rule.priority_weight),
          Number.isFinite(gap) ? Math.abs(gap) : 1,
        ),
        title: renderTemplate(rule.title_template, vars),
        body: renderTemplate(rule.body_template, vars),
        kpi_code: row.kpi_code,
        impact_estimate: impact,
        metadata: {
          gap_to_target_signed: row.gap_to_target_signed,
          definition_unit: row.definition_unit,
        },
      });
    }
    return out;
  }

  if (rule.condition_type === "validation_error") {
    for (const row of ctx.validationErrors) {
      const vars = {
        line_code: row.line_code,
        issue_code: row.issue_code,
        issue_message: row.issue_message,
      };
      out.push({
        factory_id: factoryId,
        line_id: row.line_id,
        line_code: row.line_code,
        reporting_period_id: periodId,
        rule_id: rule.id,
        rule_code: rule.rule_code,
        severity: rule.severity,
        priority_score: computePriorityScore(rule.severity, Number(rule.priority_weight), 2),
        title: renderTemplate(rule.title_template, vars),
        body: renderTemplate(rule.body_template, vars),
        kpi_code: null,
        impact_estimate: { narrative: "Resolve validation errors before trusting KPI rankings." },
        metadata: { issue_code: row.issue_code },
      });
    }
    return out;
  }

  if (rule.condition_type === "validation_warning") {
    for (const row of ctx.validationWarnings) {
      const vars = {
        line_code: row.line_code,
        issue_code: row.issue_code,
        issue_message: row.issue_message,
      };
      out.push({
        factory_id: factoryId,
        line_id: row.line_id,
        line_code: row.line_code,
        reporting_period_id: periodId,
        rule_id: rule.id,
        rule_code: rule.rule_code,
        severity: rule.severity,
        priority_score: computePriorityScore(rule.severity, Number(rule.priority_weight), 0.5),
        title: renderTemplate(rule.title_template, vars),
        body: renderTemplate(rule.body_template, vars),
        kpi_code: null,
        impact_estimate: { narrative: "Review warning before publishing benchmark views." },
        metadata: { issue_code: row.issue_code },
      });
    }
    return out;
  }

  if (rule.condition_type === "low_percentile") {
    const maxPct = Number(cfg.max_percentile ?? 25);
    for (const row of ctx.benchmark) {
      if (!matchesKpiFilter(rule, row.kpi_code)) continue;
      if (row.comparison_status !== "ok") continue;
      if (row.estimated_percentile == null || row.estimated_percentile > maxPct) continue;
      const gap = Number(row.gap_to_median_signed);
      const vars = {
        line_code: row.line_code,
        kpi_code: row.kpi_code,
        current_value: fmtValue(row.definition_unit, row.current_value),
        percentile: String(row.estimated_percentile),
        gap_signed: fmtValue(row.definition_unit, row.gap_to_median_signed),
      };
      out.push({
        factory_id: factoryId,
        line_id: row.line_id,
        line_code: row.line_code,
        reporting_period_id: periodId,
        rule_id: rule.id,
        rule_code: rule.rule_code,
        severity: rule.severity,
        priority_score: computePriorityScore(
          rule.severity,
          Number(rule.priority_weight),
          Number.isFinite(gap) ? Math.abs(gap) : 1,
        ),
        title: renderTemplate(rule.title_template, vars),
        body: renderTemplate(rule.body_template, vars),
        kpi_code: row.kpi_code,
        impact_estimate: estimateImpact(
          row.kpi_code,
          gap,
          row.definition_unit,
          impactParams,
        ),
        metadata: {
          estimated_percentile: row.estimated_percentile,
          gap_to_median_signed: row.gap_to_median_signed,
          definition_unit: row.definition_unit,
        },
      });
    }
    return out;
  }

  if (rule.condition_type === "insufficient_peer_sample") {
    for (const row of ctx.benchmark) {
      if (!matchesKpiFilter(rule, row.kpi_code)) continue;
      if (row.comparison_status !== "insufficient_peer_sample") continue;
      const vars = {
        line_code: row.line_code,
        kpi_code: row.kpi_code,
        peer_sample_size: String(row.peer_sample_size ?? 0),
      };
      out.push({
        factory_id: factoryId,
        line_id: row.line_id,
        line_code: row.line_code,
        reporting_period_id: periodId,
        rule_id: rule.id,
        rule_code: rule.rule_code,
        severity: rule.severity,
        priority_score: computePriorityScore(rule.severity, Number(rule.priority_weight), 0.3),
        title: renderTemplate(rule.title_template, vars),
        body: renderTemplate(rule.body_template, vars),
        kpi_code: row.kpi_code,
        impact_estimate: { narrative: "Expand cohort or wait for more peer submissions." },
        metadata: { peer_sample_size: row.peer_sample_size },
      });
    }
  }

  return out;
}

export async function evaluateInsightRules(
  pool: Pool,
  factoryId: string,
  reportingPeriodId: string,
  lineId: string | null,
): Promise<{ insights: InsightDraft[]; executionCounts: Record<string, number> }> {
  const { rows: rules } = await pool.query<InsightRuleRow>(
    `SELECT id::text AS id,
            rule_code,
            rule_group,
            name,
            severity,
            priority_weight::text,
            condition_type,
            condition_config,
            title_template,
            body_template,
            kpi_code_filter
     FROM insight_rules
     WHERE is_active = TRUE
     ORDER BY priority_weight DESC, rule_code`,
  );

  const ctx = await loadEvaluationContext(pool, factoryId, reportingPeriodId, lineId);
  const baseImpact = await loadImpactParams(pool, factoryId);
  const impactParams = mergeImpactParams(baseImpact, {});
  const all: InsightDraft[] = [];
  const executionCounts: Record<string, number> = {};

  for (const rule of rules) {
    const matches = evaluateRule(
      rule,
      ctx,
      factoryId,
      reportingPeriodId,
      impactParams,
    );
    executionCounts[rule.rule_code] = matches.length;
    all.push(...matches);
  }

  all.sort((a, b) => b.priority_score - a.priority_score);
  return { insights: all, executionCounts };
}

export async function evaluateSingleRule(
  pool: Pool,
  ruleId: string,
  factoryId: string,
  reportingPeriodId: string,
  lineId: string | null,
): Promise<{ rule: InsightRuleRow; matches: InsightDraft[] } | null> {
  const { rows } = await pool.query<InsightRuleRow>(
    `SELECT id::text AS id,
            rule_code,
            rule_group,
            name,
            severity,
            priority_weight::text,
            condition_type,
            condition_config,
            title_template,
            body_template,
            kpi_code_filter
     FROM insight_rules
     WHERE id = $1::uuid`,
    [ruleId],
  );
  const rule = rows[0];
  if (!rule) return null;

  const ctx = await loadEvaluationContext(
    pool,
    factoryId,
    reportingPeriodId,
    lineId,
  );
  const baseImpact = await loadImpactParams(pool, factoryId);
  const impactParams = mergeImpactParams(baseImpact, {});
  const matches = evaluateRule(
    rule,
    ctx,
    factoryId,
    reportingPeriodId,
    impactParams,
  );
  return { rule, matches };
}

export async function persistInsights(
  pool: Pool,
  factoryId: string,
  reportingPeriodId: string,
  lineId: string | null,
  drafts: InsightDraft[],
  executionCounts: Record<string, number>,
): Promise<{ inserted: number; critical_count: number }> {
  if (lineId) {
    await pool.query(
      `DELETE FROM generated_insights
       WHERE factory_id = $1::uuid
         AND reporting_period_id = $2::uuid
         AND line_id = $3::uuid`,
      [factoryId, reportingPeriodId, lineId],
    );
  } else {
    await pool.query(
      `DELETE FROM generated_insights
       WHERE factory_id = $1::uuid AND reporting_period_id = $2::uuid`,
      [factoryId, reportingPeriodId],
    );
  }

  let critical_count = 0;
  for (const d of drafts) {
    if (d.severity === "critical") critical_count++;
    await pool.query(
      `INSERT INTO generated_insights (
         factory_id,
         line_id,
         reporting_period_id,
         rule_id,
         rule_code,
         severity,
         priority_score,
         title,
         body,
         kpi_code,
         impact_estimate,
         metadata
       )
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6, $7, $8, $9, $10, $11::jsonb, $12::jsonb)`,
      [
        d.factory_id,
        d.line_id,
        d.reporting_period_id,
        d.rule_id,
        d.rule_code,
        d.severity,
        d.priority_score,
        d.title,
        d.body,
        d.kpi_code,
        JSON.stringify(d.impact_estimate),
        JSON.stringify(d.metadata),
      ],
    );
  }

  for (const [ruleCode, count] of Object.entries(executionCounts)) {
    await pool.query(
      `INSERT INTO insight_rule_executions (
         factory_id,
         reporting_period_id,
         rule_code,
         matches_found
       )
       VALUES ($1::uuid, $2::uuid, $3, $4::int)`,
      [factoryId, reportingPeriodId, ruleCode, count],
    );
  }

  return { inserted: drafts.length, critical_count };
}
