import type { ImpactEstimate } from "./impact.js";

export type InsightSeverity = "info" | "warning" | "critical";

export type ConditionType =
  | "below_peer_median"
  | "below_target"
  | "validation_error"
  | "validation_warning"
  | "low_percentile"
  | "insufficient_peer_sample";

export interface InsightRuleRow {
  id: string;
  rule_code: string;
  rule_group: string;
  name: string;
  severity: InsightSeverity;
  priority_weight: string;
  condition_type: ConditionType;
  condition_config: Record<string, unknown>;
  title_template: string;
  body_template: string;
  kpi_code_filter: string | null;
}

export interface InsightDraft {
  factory_id: string;
  line_id: string | null;
  line_code: string;
  reporting_period_id: string;
  rule_id: string;
  rule_code: string;
  severity: InsightSeverity;
  priority_score: number;
  title: string;
  body: string;
  kpi_code: string | null;
  impact_estimate: ImpactEstimate;
  metadata: Record<string, unknown>;
}
