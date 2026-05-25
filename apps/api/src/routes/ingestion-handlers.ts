import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { PoolClient } from "pg";

import { canUpload, roleForFactory } from "../auth/rbac.js";
import { insertAuditEvent } from "../audit/log.js";
import { notifyFactoryMembers } from "../notifications/insert.js";
import { notifyFactoryPriorityDigest } from "../notifications/priorities.js";
import { maxUploadBytes, uploadDir } from "../config.js";
import { getPool, requirePool } from "../db.js";
import { sendBinary, sendJson } from "../http/respond.js";
import { scheduleAnalyticsSync } from "@filmbench/analytics";

import { parseMultipartSingleFile } from "../ingestion/multipart.js";
import { parseMonthlyWorkbook, type ParsedMonthlyExcelRow } from "../ingestion/parse.js";
import { buildMonthlyTemplateBuffer } from "../ingestion/template.js";
import { requireAccessFromRequest } from "./auth-handlers.js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(s: string): boolean {
  return UUID_RE.test(s);
}

async function upsertReportingPeriod(
  client: PoolClient,
  periodStart: string,
  periodEnd: string,
): Promise<string> {
  const label = periodStart.slice(0, 7);
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO reporting_periods (period_type, period_start, period_end, label)
     VALUES ('monthly', $1::date, $2::date, $3)
     ON CONFLICT (period_type, period_start, period_end) DO UPDATE
       SET label = COALESCE(EXCLUDED.label, reporting_periods.label)
     RETURNING id::text`,
    [periodStart, periodEnd, label],
  );
  const id = rows[0]?.id;
  if (!id) throw new Error("reporting_period_upsert_failed");
  return id;
}

async function upsertFactRow(
  client: PoolClient,
  batchId: string,
  lineId: string,
  periodId: string,
  row: ParsedMonthlyExcelRow,
): Promise<void> {
  const m = row.metrics;
  await client.query(
    `INSERT INTO production_fact_monthly (
       line_id,
       reporting_period_id,
       total_input_kg,
       total_output_kg,
       good_output_kg,
       scrap_kg,
       rework_kg,
       runtime_hours,
       planned_downtime_hours,
       unplanned_downtime_hours,
       total_available_hours,
       actual_speed,
       design_speed,
       total_energy_kwh,
       energy_cost_amount,
       raw_material_cost_amount,
       labor_cost_amount,
       overhead_cost_amount,
       other_cost_amount,
       total_cost_amount,
       startup_waste_kg,
       line_break_count,
       defect_count,
       changeover_count,
       currency_code,
       source_type,
       ingestion_batch_id,
       data_quality_status
     ) VALUES (
       $1::uuid,
       $2::uuid,
       $3,
       $4,
       $5,
       $6,
       $7,
       $8,
       $9,
       $10,
       $11,
       $12,
       $13,
       $14,
       $15,
       $16,
       $17,
       $18,
       $19,
       $20,
       $21,
       $22,
       $23,
       $24,
       $25,
       'excel',
       $26::uuid,
       'pending'
     )
     ON CONFLICT (line_id, reporting_period_id) DO UPDATE SET
       total_input_kg = EXCLUDED.total_input_kg,
       total_output_kg = EXCLUDED.total_output_kg,
       good_output_kg = EXCLUDED.good_output_kg,
       scrap_kg = EXCLUDED.scrap_kg,
       rework_kg = EXCLUDED.rework_kg,
       runtime_hours = EXCLUDED.runtime_hours,
       planned_downtime_hours = EXCLUDED.planned_downtime_hours,
       unplanned_downtime_hours = EXCLUDED.unplanned_downtime_hours,
       total_available_hours = EXCLUDED.total_available_hours,
       actual_speed = EXCLUDED.actual_speed,
       design_speed = EXCLUDED.design_speed,
       total_energy_kwh = EXCLUDED.total_energy_kwh,
       energy_cost_amount = EXCLUDED.energy_cost_amount,
       raw_material_cost_amount = EXCLUDED.raw_material_cost_amount,
       labor_cost_amount = EXCLUDED.labor_cost_amount,
       overhead_cost_amount = EXCLUDED.overhead_cost_amount,
       other_cost_amount = EXCLUDED.other_cost_amount,
       total_cost_amount = EXCLUDED.total_cost_amount,
       startup_waste_kg = EXCLUDED.startup_waste_kg,
       line_break_count = EXCLUDED.line_break_count,
       defect_count = EXCLUDED.defect_count,
       changeover_count = EXCLUDED.changeover_count,
       currency_code = EXCLUDED.currency_code,
       source_type = 'excel',
       ingestion_batch_id = EXCLUDED.ingestion_batch_id,
       data_quality_status = 'pending',
       updated_at = now()`,
    [
      lineId,
      periodId,
      m.total_input_kg,
      m.total_output_kg,
      m.good_output_kg,
      m.scrap_kg,
      m.rework_kg,
      m.runtime_hours,
      m.planned_downtime_hours,
      m.unplanned_downtime_hours,
      m.total_available_hours,
      m.actual_speed,
      m.design_speed,
      m.total_energy_kwh,
      m.energy_cost_amount,
      m.raw_material_cost_amount,
      m.labor_cost_amount,
      m.overhead_cost_amount,
      m.other_cost_amount,
      m.total_cost_amount,
      m.startup_waste_kg,
      m.line_break_count,
      m.defect_count,
      m.changeover_count,
      m.currency_code,
      batchId,
    ],
  );
}

export async function handleMonthlyTemplateDownload(
  _req: IncomingMessage,
  res: ServerResponse,
  factoryId: string,
): Promise<void> {
  if (!getPool()) {
    sendJson(res, 503, { error: "database_unconfigured" });
    return;
  }
  let claims;
  try {
    claims = requireAccessFromRequest(_req);
  } catch {
    sendJson(res, 401, { error: "unauthorized" });
    return;
  }
  if (!isUuid(factoryId)) {
    sendJson(res, 400, { error: "invalid_factory_id" });
    return;
  }
  const role = roleForFactory(claims.memberships, factoryId);
  if (!role || !canUpload(role)) {
    sendJson(res, 403, { error: "forbidden" });
    return;
  }

  const buf = buildMonthlyTemplateBuffer();
  sendBinary(
    res,
    200,
    buf,
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    {
      "content-disposition": 'attachment; filename="filmbench-monthly-template.xlsx"',
    },
  );
}

export async function handleMonthlyExcelUpload(
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
  if (!isUuid(factoryId)) {
    sendJson(res, 400, { error: "invalid_factory_id" });
    return;
  }
  const role = roleForFactory(claims.memberships, factoryId);
  if (!role || !canUpload(role)) {
    sendJson(res, 403, { error: "forbidden" });
    return;
  }

  const ct = req.headers["content-type"] ?? "";
  if (!ct.toLowerCase().includes("multipart/form-data")) {
    sendJson(res, 415, { error: "expected_multipart_form_data" });
    return;
  }

  let file: { filename: string; buffer: Buffer };
  try {
    file = await parseMultipartSingleFile(req, maxUploadBytes());
  } catch (e) {
    const status =
      typeof e === "object" && e !== null && "status" in e
        ? Number((e as { status?: number }).status) || 400
        : 400;
    const code =
      e instanceof Error && e.message === "file_too_large"
        ? "file_too_large"
        : e instanceof Error && e.message === "file_required"
          ? "file_required"
          : "upload_parse_failed";
    sendJson(res, status, { error: code });
    return;
  }

  const parsed = parseMonthlyWorkbook(file.buffer);
  if (parsed.errors.length) {
    sendJson(res, 400, { error: "validation_failed", issues: parsed.errors });
    return;
  }

  const pool = requirePool();
  const codes = [...new Set(parsed.rows.map((r) => r.line_code))];
  const { rows: lineRows } = await pool.query<{ id: string; line_code: string }>(
    `SELECT id::text, line_code
     FROM production_lines
     WHERE factory_id = $1::uuid AND line_code = ANY($2::text[])`,
    [factoryId, codes],
  );
  const lineByCode = new Map(lineRows.map((r) => [r.line_code, r.id]));
  const missing = codes.filter((c) => !lineByCode.has(c));
  if (missing.length) {
    sendJson(res, 400, { error: "unknown_line_codes", line_codes: missing });
    return;
  }

  const client = await pool.connect();
  let batchId: string | null = null;
  const affected = new Map<string, { lineId: string; periodId: string }>();
  const periodCache = new Map<string, string>();

  try {
    await client.query("BEGIN");
    const ins = await client.query<{ id: string }>(
      `INSERT INTO ingestion_batches (
         factory_id,
         uploaded_by_user_id,
         original_filename,
         storage_path,
         status
       )
       VALUES ($1::uuid, $2::uuid, $3, '', 'processing')
       RETURNING id::text`,
      [factoryId, claims.sub, file.filename],
    );
    batchId = ins.rows[0]?.id ?? null;
    if (!batchId) throw new Error("batch_insert_failed");

    const storagePath = `${batchId}.xlsx`;
    await client.query(
      `UPDATE ingestion_batches SET storage_path = $1 WHERE id = $2::uuid`,
      [storagePath, batchId],
    );

    for (const row of parsed.rows) {
      const pkey = `${row.period_start}|${row.period_end}`;
      let periodId = periodCache.get(pkey);
      if (!periodId) {
        periodId = await upsertReportingPeriod(client, row.period_start, row.period_end);
        periodCache.set(pkey, periodId);
      }
      const lineId = lineByCode.get(row.line_code);
      if (!lineId) throw new Error("line_resolve_failed");
      await upsertFactRow(client, batchId, lineId, periodId, row);
      affected.set(`${lineId}\0${periodId}`, { lineId, periodId });
    }

    await client.query(
      `UPDATE ingestion_batches
       SET status = 'completed',
           row_count = $2,
           completed_at = now()
       WHERE id = $1::uuid`,
      [batchId, parsed.rows.length],
    );
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    sendJson(res, 500, {
      error: "ingest_failed",
      message: e instanceof Error ? e.message : String(e),
    });
    return;
  } finally {
    client.release();
  }

  if (!batchId) {
    sendJson(res, 500, { error: "ingest_failed", message: "missing_batch_id" });
    return;
  }
  const dir = uploadDir();
  await mkdir(dir, { recursive: true });
  const storagePath = `${batchId}.xlsx`;
  try {
    await writeFile(path.join(dir, storagePath), file.buffer);
  } catch {
    await pool
      .query(
        `UPDATE ingestion_batches
         SET summary = COALESCE(summary, '{}'::jsonb) || $2::jsonb
         WHERE id = $1::uuid`,
        [batchId, JSON.stringify({ file_write_warning: true })],
      )
      .catch(() => {});
  }

  const refreshErrors: string[] = [];
  for (const { lineId, periodId } of affected.values()) {
    try {
      await pool.query(`SELECT refresh_kpis_then_benchmarks($1::uuid, $2::uuid)`, [
        lineId,
        periodId,
      ]);
    } catch (err) {
      refreshErrors.push(
        `${lineId}/${periodId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  try {
    await pool.query(`SELECT append_soft_validation_for_batch($1::uuid)`, [batchId]);
  } catch (err) {
    refreshErrors.push(
      `soft_validation: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (refreshErrors.length) {
    await pool.query(
      `UPDATE ingestion_batches
       SET summary = COALESCE(summary, '{}'::jsonb) || $2::jsonb
       WHERE id = $1::uuid`,
      [batchId, JSON.stringify({ refresh_errors: refreshErrors })],
    );
  }

  const distinctPeriods = new Set<string>();
  for (const v of affected.values()) {
    distinctPeriods.add(v.periodId);
  }

  void insertAuditEvent(pool, {
    factoryId,
    actorUserId: claims.sub,
    action: "ingestion.monthly_excel.completed",
    entityType: "ingestion_batch",
    entityId: batchId,
    metadata: {
      rows_ingested: parsed.rows.length,
      reporting_periods_touched: distinctPeriods.size,
      line_period_pairs_refreshed: affected.size,
      refresh_error_count: refreshErrors.length,
    },
  }).catch(() => {});

  const periodIdList = [...distinctPeriods];
  scheduleAnalyticsSync(pool, factoryId, periodIdList);
  void notifyFactoryMembers(pool, factoryId, {
    kind: "ingestion_completed",
    severity: refreshErrors.length ? "warning" : "info",
    title: "Monthly data upload completed",
    body: `${parsed.rows.length} row(s) ingested across ${distinctPeriods.size} reporting period(s). KPIs and benchmarks were refreshed.`,
    href: "/upload",
    metadata: {
      ingestion_batch_id: batchId,
      rows_ingested: parsed.rows.length,
      refresh_error_count: refreshErrors.length,
    },
  }).catch(() => {});
  void notifyFactoryPriorityDigest(pool, factoryId, periodIdList).catch(() => {});

  sendJson(res, 200, {
    ingestion_batch_id: batchId,
    rows_ingested: parsed.rows.length,
    reporting_periods_touched: distinctPeriods.size,
    reporting_period_ids: periodIdList,
    line_period_pairs_refreshed: affected.size,
    refresh_errors: refreshErrors.length ? refreshErrors : undefined,
  });
}
