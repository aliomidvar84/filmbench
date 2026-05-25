import type { IncomingMessage, ServerResponse } from "node:http";

import { getPool, requirePool } from "../db.js";
import { toCsv } from "../http/csv.js";
import { sendJson, sendText } from "../http/respond.js";
import { isUuid, requestUrl } from "../http/util.js";
import { requireAccessFromRequest } from "./auth-handlers.js";
import { assertDashboard } from "./dashboard-handlers.js";

const MAX_ROWS = 500;

function rowString(record: Record<string, unknown>, keys: string[]): string[] {
  return keys.map((k) => {
    const v = record[k];
    if (v == null) return "";
    return String(v);
  });
}

function parseSeverity(raw: string | null): "error" | "warning" | null {
  if (!raw?.trim()) return null;
  const s = raw.trim().toLowerCase();
  if (s === "error" || s === "warning") return s;
  return null;
}

export async function handleFactoryValidationIssues(
  req: IncomingMessage,
  res: ServerResponse,
  factoryId: string,
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
  if (!assertDashboard(res, claims.memberships, factoryId)) return;

  const url = requestUrl(req);
  const lineIdRaw = url.searchParams.get("line_id")?.trim() ?? "";
  const periodIdRaw = url.searchParams.get("reporting_period_id")?.trim() ?? "";
  const issueCodeRaw = url.searchParams.get("issue_code")?.trim() ?? "";
  const severityParam = parseSeverity(url.searchParams.get("severity"));

  if (lineIdRaw && !isUuid(lineIdRaw)) {
    sendJson(res, 400, { error: "invalid_line_id" });
    return;
  }
  if (periodIdRaw && !isUuid(periodIdRaw)) {
    sendJson(res, 400, { error: "invalid_reporting_period_id" });
    return;
  }
  if (
    url.searchParams.has("severity") &&
    url.searchParams.get("severity")?.trim() &&
    !severityParam
  ) {
    sendJson(res, 400, { error: "invalid_severity" });
    return;
  }

  const pool = requirePool();
  const { rows } = await pool.query(
    `SELECT d.id::text,
            d.issue_code,
            d.issue_severity,
            d.issue_message,
            d.created_at::text AS created_at,
            pf.id::text AS production_fact_id,
            pf.line_id::text AS line_id,
            pl.line_code,
            pf.reporting_period_id::text AS reporting_period_id,
            rp.period_end::text AS period_end,
            rp.label,
            pf.data_quality_status,
            pf.ingestion_batch_id::text AS ingestion_batch_id
     FROM data_validation_issues d
     INNER JOIN production_fact_monthly pf ON pf.id = d.production_fact_id
     INNER JOIN production_lines pl ON pl.id = pf.line_id AND pl.factory_id = $1::uuid
     INNER JOIN reporting_periods rp ON rp.id = pf.reporting_period_id
     WHERE ($2::uuid IS NULL OR pf.line_id = $2::uuid)
       AND ($3::uuid IS NULL OR pf.reporting_period_id = $3::uuid)
       AND ($4::text IS NULL OR d.issue_severity = $4::text)
       AND ($5::text IS NULL OR d.issue_code = $5::text)
     ORDER BY d.created_at DESC
     LIMIT $6::int`,
    [
      factoryId,
      lineIdRaw || null,
      periodIdRaw || null,
      severityParam,
      issueCodeRaw || null,
      MAX_ROWS,
    ],
  );

  sendJson(res, 200, {
    validation_issues: rows,
    limit: MAX_ROWS,
  });
}

export async function handleExportValidationIssuesCsv(
  req: IncomingMessage,
  res: ServerResponse,
  factoryId: string,
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
  if (!assertDashboard(res, claims.memberships, factoryId)) return;

  const url = requestUrl(req);
  const lineIdRaw = url.searchParams.get("line_id")?.trim() ?? "";
  const periodIdRaw = url.searchParams.get("reporting_period_id")?.trim() ?? "";
  const issueCodeRaw = url.searchParams.get("issue_code")?.trim() ?? "";
  const severityParam = parseSeverity(url.searchParams.get("severity"));

  if (lineIdRaw && !isUuid(lineIdRaw)) {
    sendJson(res, 400, { error: "invalid_line_id" });
    return;
  }
  if (periodIdRaw && !isUuid(periodIdRaw)) {
    sendJson(res, 400, { error: "invalid_reporting_period_id" });
    return;
  }
  if (
    url.searchParams.has("severity") &&
    url.searchParams.get("severity")?.trim() &&
    !severityParam
  ) {
    sendJson(res, 400, { error: "invalid_severity" });
    return;
  }

  const pool = requirePool();
  const { rows } = await pool.query(
    `SELECT d.id::text,
            d.issue_code,
            d.issue_severity,
            d.issue_message,
            d.created_at::text AS created_at,
            pf.id::text AS production_fact_id,
            pf.line_id::text AS line_id,
            pl.line_code,
            pf.reporting_period_id::text AS reporting_period_id,
            rp.period_end::text AS period_end,
            rp.label,
            pf.data_quality_status,
            pf.ingestion_batch_id::text AS ingestion_batch_id
     FROM data_validation_issues d
     INNER JOIN production_fact_monthly pf ON pf.id = d.production_fact_id
     INNER JOIN production_lines pl ON pl.id = pf.line_id AND pl.factory_id = $1::uuid
     INNER JOIN reporting_periods rp ON rp.id = pf.reporting_period_id
     WHERE ($2::uuid IS NULL OR pf.line_id = $2::uuid)
       AND ($3::uuid IS NULL OR pf.reporting_period_id = $3::uuid)
       AND ($4::text IS NULL OR d.issue_severity = $4::text)
       AND ($5::text IS NULL OR d.issue_code = $5::text)
     ORDER BY d.created_at DESC
     LIMIT $6::int`,
    [
      factoryId,
      lineIdRaw || null,
      periodIdRaw || null,
      severityParam,
      issueCodeRaw || null,
      MAX_ROWS,
    ],
  );

  const recs = rows as Record<string, unknown>[];
  const keys =
    recs.length > 0
      ? Object.keys(recs[0]!)
      : [
          "id",
          "issue_code",
          "issue_severity",
          "issue_message",
          "created_at",
          "production_fact_id",
          "line_id",
          "line_code",
          "reporting_period_id",
          "period_end",
          "label",
          "data_quality_status",
          "ingestion_batch_id",
        ];
  const data = recs.map((r) => rowString(r, keys));
  const csv = toCsv(keys, data);
  sendText(res, 200, `\ufeff${csv}`, "text/csv", {
    "content-disposition": `attachment; filename="filmbench-validation-issues-${factoryId.slice(0, 8)}.csv"`,
  });
}
