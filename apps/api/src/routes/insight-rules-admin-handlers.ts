import type { IncomingMessage, ServerResponse } from "node:http";

import { insertAuditEvent } from "../audit/log.js";
import {
  type Membership,
  canAdminister,
  roleForFactory,
} from "../auth/rbac.js";
import { getPool, requirePool } from "../db.js";
import { evaluateSingleRule } from "../insights/evaluate.js";
import type { InsightRuleRow } from "../insights/types.js";
import { sendJson } from "../http/respond.js";
import { isUuid, readJsonBody } from "../http/util.js";
import { requireAccessFromRequest } from "./auth-handlers.js";

function assertInsightRuleAdmin(
  res: ServerResponse,
  memberships: Membership[],
): boolean {
  const isAdmin = memberships.some((m) => canAdminister(m.role));
  if (!isAdmin) {
    sendJson(res, 403, { error: "forbidden" });
    return false;
  }
  return true;
}

function assertFactoryAdmin(
  res: ServerResponse,
  memberships: Membership[],
  factoryId: string,
): boolean {
  if (!isUuid(factoryId)) {
    sendJson(res, 400, { error: "invalid_factory_id" });
    return false;
  }
  const role = roleForFactory(memberships, factoryId);
  if (!role || !canAdminister(role)) {
    sendJson(res, 403, { error: "forbidden" });
    return false;
  }
  return true;
}

export async function handleListInsightRules(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (!getPool()) {
    sendJson(res, 503, { error: "database_unconfigured" });
    return;
  }
  let claims;
  try {
    claims = requireAccessFromRequest(req);
  } catch {
    sendJson(res, 401, { error: "unauthorized" });
    return;
  }
  if (!assertInsightRuleAdmin(res, claims.memberships)) return;

  const pool = requirePool();
  const { rows } = await pool.query(
    `SELECT id::text,
            rule_code,
            rule_group,
            name,
            is_active,
            severity,
            priority_weight::text AS priority_weight,
            condition_type,
            condition_config,
            title_template,
            body_template,
            kpi_code_filter,
            created_at::text AS created_at
     FROM insight_rules
     ORDER BY rule_group, rule_code`,
  );

  sendJson(res, 200, { rules: rows, count: rows.length });
}

interface PatchInsightRuleBody {
  is_active?: boolean;
  severity?: string;
  priority_weight?: number | string;
  name?: string;
  condition_config?: Record<string, unknown>;
}

const SEVERITIES = ["info", "warning", "critical"] as const;

export async function handlePatchInsightRule(
  req: IncomingMessage,
  res: ServerResponse,
  ruleId: string,
): Promise<void> {
  if (!getPool()) {
    sendJson(res, 503, { error: "database_unconfigured" });
    return;
  }
  if (!isUuid(ruleId)) {
    sendJson(res, 400, { error: "invalid_rule_id" });
    return;
  }
  let claims;
  try {
    claims = requireAccessFromRequest(req);
  } catch {
    sendJson(res, 401, { error: "unauthorized" });
    return;
  }
  if (!assertInsightRuleAdmin(res, claims.memberships)) return;

  let body: PatchInsightRuleBody;
  try {
    body = await readJsonBody<PatchInsightRuleBody>(req);
  } catch {
    sendJson(res, 400, { error: "invalid_json" });
    return;
  }

  const pool = requirePool();
  const beforeRes = await pool.query<InsightRuleRow & { is_active: boolean }>(
    `SELECT id::text AS id,
            rule_code,
            rule_group,
            name,
            is_active,
            severity,
            priority_weight::text AS priority_weight,
            condition_type,
            condition_config,
            title_template,
            body_template,
            kpi_code_filter
     FROM insight_rules
     WHERE id = $1::uuid`,
    [ruleId],
  );
  const before = beforeRes.rows[0];
  if (!before) {
    sendJson(res, 404, { error: "rule_not_found" });
    return;
  }

  const sets: string[] = [];
  const vals: unknown[] = [ruleId];
  let idx = 2;

  if (body.is_active !== undefined) {
    if (typeof body.is_active !== "boolean") {
      sendJson(res, 400, { error: "invalid_is_active" });
      return;
    }
    sets.push(`is_active = $${idx}`);
    vals.push(body.is_active);
    idx += 1;
  }
  if (body.severity !== undefined) {
    const sev = body.severity.trim();
    if (!SEVERITIES.includes(sev as (typeof SEVERITIES)[number])) {
      sendJson(res, 400, { error: "invalid_severity" });
      return;
    }
    sets.push(`severity = $${idx}`);
    vals.push(sev);
    idx += 1;
  }
  if (body.priority_weight !== undefined) {
    const w =
      typeof body.priority_weight === "number"
        ? body.priority_weight
        : Number(body.priority_weight);
    if (!Number.isFinite(w) || w < 0) {
      sendJson(res, 400, { error: "invalid_priority_weight" });
      return;
    }
    sets.push(`priority_weight = $${idx}`);
    vals.push(w);
    idx += 1;
  }
  if (body.name !== undefined) {
    const name = body.name.trim();
    if (!name) {
      sendJson(res, 400, { error: "invalid_name" });
      return;
    }
    sets.push(`name = $${idx}`);
    vals.push(name);
    idx += 1;
  }
  if (body.condition_config !== undefined) {
    if (
      typeof body.condition_config !== "object" ||
      body.condition_config === null ||
      Array.isArray(body.condition_config)
    ) {
      sendJson(res, 400, { error: "invalid_condition_config" });
      return;
    }
    const merged = {
      ...(before.condition_config as Record<string, unknown>),
      ...body.condition_config,
    };
    sets.push(`condition_config = $${idx}::jsonb`);
    vals.push(JSON.stringify(merged));
    idx += 1;
  }

  if (sets.length === 0) {
    sendJson(res, 400, { error: "no_fields_to_update" });
    return;
  }

  await pool.query(
    `UPDATE insight_rules SET ${sets.join(", ")} WHERE id = $1::uuid`,
    vals,
  );

  const { rows: afterRows } = await pool.query(
    `SELECT id::text,
            rule_code,
            rule_group,
            name,
            is_active,
            severity,
            priority_weight::text AS priority_weight,
            condition_type,
            condition_config,
            kpi_code_filter
     FROM insight_rules
     WHERE id = $1::uuid`,
    [ruleId],
  );
  const after = afterRows[0];

  const auditFactoryId = claims.memberships.find((m) =>
    canAdminister(m.role),
  )?.factory_id;
  if (auditFactoryId) {
    void insertAuditEvent(pool, {
      factoryId: auditFactoryId,
      actorUserId: claims.sub,
      action: "insight_rule.updated",
      entityType: "insight_rules",
      entityId: ruleId,
      metadata: {
        rule_code: before.rule_code,
        before: {
          is_active: before.is_active,
          severity: before.severity,
          priority_weight: before.priority_weight,
          condition_config: before.condition_config,
        },
        after: {
          is_active: after?.is_active,
          severity: after?.severity,
          priority_weight: after?.priority_weight,
          condition_config: after?.condition_config,
        },
      },
    }).catch(() => {});
  }

  sendJson(res, 200, { rule: after });
}

interface RegressionTestBody {
  factory_id?: string;
  reporting_period_id?: string;
  line_id?: string | null;
}

export async function handleInsightRuleRegressionTest(
  req: IncomingMessage,
  res: ServerResponse,
  ruleId: string,
): Promise<void> {
  if (!getPool()) {
    sendJson(res, 503, { error: "database_unconfigured" });
    return;
  }
  if (!isUuid(ruleId)) {
    sendJson(res, 400, { error: "invalid_rule_id" });
    return;
  }
  let claims;
  try {
    claims = requireAccessFromRequest(req);
  } catch {
    sendJson(res, 401, { error: "unauthorized" });
    return;
  }

  let body: RegressionTestBody;
  try {
    body = await readJsonBody<RegressionTestBody>(req);
  } catch {
    sendJson(res, 400, { error: "invalid_json" });
    return;
  }

  const factoryId = body.factory_id?.trim() ?? "";
  const periodId = body.reporting_period_id?.trim() ?? "";
  if (!isUuid(factoryId) || !isUuid(periodId)) {
    sendJson(res, 400, { error: "factory_id_and_reporting_period_id_required" });
    return;
  }
  if (!assertFactoryAdmin(res, claims.memberships, factoryId)) return;

  const lineIdRaw =
    body.line_id === null || body.line_id === undefined
      ? ""
      : String(body.line_id).trim();
  const lineId = lineIdRaw && isUuid(lineIdRaw) ? lineIdRaw : null;
  if (lineIdRaw && !lineId) {
    sendJson(res, 400, { error: "invalid_line_id" });
    return;
  }

  const pool = requirePool();
  const result = await evaluateSingleRule(
    pool,
    ruleId,
    factoryId,
    periodId,
    lineId,
  );
  if (!result) {
    sendJson(res, 404, { error: "rule_not_found" });
    return;
  }

  sendJson(res, 200, {
    rule_code: result.rule.rule_code,
    rule_name: result.rule.name,
    matches_found: result.matches.length,
    sample_insights: result.matches.slice(0, 5).map((m) => ({
      title: m.title,
      body: m.body,
      severity: m.severity,
      priority_score: m.priority_score,
      line_code: m.line_code,
      kpi_code: m.kpi_code,
    })),
  });
}
