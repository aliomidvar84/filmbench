import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";

import { insertAuditEvent } from "../audit/log.js";
import { reportsDir } from "../config.js";
import { getPool, requirePool } from "../db.js";
import { sendBinary, sendJson, sendText } from "../http/respond.js";
import { isUuid, readJsonBody } from "../http/util.js";
import { notifyFactoryMembers } from "../notifications/insert.js";
import { buildExecutiveReportCsv } from "../reports/build-executive-csv.js";
import {
  buildExecutiveReportPdf,
  estimateExecutiveReportBytes,
} from "../reports/build-executive-pdf.js";
import { loadExecutiveReportContext } from "../reports/executive-data.js";
import { requireAccessFromRequest } from "./auth-handlers.js";
import { assertDashboard } from "./dashboard-handlers.js";

const MAX_LIST = 50;

type ReportFormat = "csv" | "pdf";

interface GenerateReportBody {
  reporting_period_id?: string;
  line_id?: string | null;
  title?: string;
  format?: string;
}

function parseFormat(raw: string | undefined): ReportFormat | null {
  const f = raw?.trim().toLowerCase() ?? "csv";
  if (f === "csv" || f === "pdf") return f;
  return null;
}

function safeStoragePath(
  factoryId: string,
  reportId: string,
  format: ReportFormat,
): string {
  return path.join(factoryId, `${reportId}.${format}`);
}

function resolveReportFile(storagePath: string): string {
  const base = reportsDir();
  const full = path.resolve(base, storagePath);
  if (!full.startsWith(path.resolve(base))) {
    throw new Error("invalid_storage_path");
  }
  return full;
}

export async function handleFactoryReportsList(
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

  const pool = requirePool();
  const { rows } = await pool.query(
    `SELECT r.id::text,
            r.report_kind,
            r.format,
            r.title,
            r.file_name,
            r.byte_size::text AS byte_size,
            r.reporting_period_id::text,
            r.line_id::text,
            r.summary,
            r.created_at::text AS created_at,
            u.email AS created_by_email
     FROM factory_reports r
     LEFT JOIN users u ON u.id = r.created_by_user_id
     WHERE r.factory_id = $1::uuid
     ORDER BY r.created_at DESC
     LIMIT $2::int`,
    [factoryId, MAX_LIST],
  );

  sendJson(res, 200, { reports: rows });
}

export async function handleGenerateFactoryReport(
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

  let body: GenerateReportBody;
  try {
    body = (await readJsonBody(req)) as GenerateReportBody;
  } catch {
    sendJson(res, 400, { error: "invalid_json" });
    return;
  }

  const periodId = body.reporting_period_id?.trim() ?? "";
  const lineIdRaw =
    body.line_id === null || body.line_id === undefined
      ? ""
      : String(body.line_id).trim();
  if (!isUuid(periodId)) {
    sendJson(res, 400, { error: "reporting_period_id_required" });
    return;
  }
  const lineId = lineIdRaw && isUuid(lineIdRaw) ? lineIdRaw : null;
  if (lineIdRaw && !lineId) {
    sendJson(res, 400, { error: "invalid_line_id" });
    return;
  }
  const format = parseFormat(body.format);
  if (!format) {
    sendJson(res, 400, { error: "invalid_format" });
    return;
  }

  const pool = requirePool();
  const ctx = await loadExecutiveReportContext(
    pool,
    factoryId,
    periodId,
    lineId,
  );
  if (!ctx) {
    sendJson(res, 404, { error: "factory_or_period_not_found" });
    return;
  }

  const periodLabel = ctx.period_label ?? ctx.period_end.slice(0, 7);
  const scopeSuffix = ctx.line_code ? `-${ctx.line_code}` : "";
  const title =
    body.title?.trim() ||
    `Executive summary ${periodLabel}${scopeSuffix ? ` (${ctx.line_code})` : ""}`;

  const estimatedByteSize = estimateExecutiveReportBytes(ctx, format);
  const buf =
    format === "pdf"
      ? await buildExecutiveReportPdf(ctx)
      : Buffer.from(buildExecutiveReportCsv(ctx), "utf8");
  const ext = format;
  const fileName = `executive-${periodLabel}${scopeSuffix}.${ext}`;

  const insertRes = await pool.query<{ id: string }>(
    `INSERT INTO factory_reports (
       factory_id,
       created_by_user_id,
       reporting_period_id,
       line_id,
       report_kind,
       format,
       title,
       file_name,
       storage_path,
       byte_size,
       summary
     )
     VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 'executive_summary', $5, $6, $7, 'pending', $8, $9::jsonb)
     RETURNING id::text`,
    [
      factoryId,
      claims.sub,
      periodId,
      lineId,
      format,
      title,
      fileName,
      buf.length,
      JSON.stringify({ counts: ctx.counts, format }),
    ],
  );
  const reportId = insertRes.rows[0]?.id;
  if (!reportId) {
    sendJson(res, 500, { error: "report_insert_failed" });
    return;
  }

  const storagePath = safeStoragePath(factoryId, reportId, format);
  const filePath = resolveReportFile(storagePath);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, buf);

  await pool.query(
    `UPDATE factory_reports SET storage_path = $2 WHERE id = $1::uuid`,
    [reportId, storagePath],
  );

  void insertAuditEvent(pool, {
    factoryId,
    actorUserId: claims.sub,
    action: "report.generated",
    entityType: "factory_report",
    entityId: reportId,
    metadata: {
      reporting_period_id: periodId,
      line_id: lineId,
      format,
      byte_size: buf.length,
      estimated_byte_size: estimatedByteSize,
    },
  }).catch(() => {});

  void notifyFactoryMembers(pool, factoryId, {
    kind: "system",
    severity: "info",
    title: "Executive report ready",
    body: `${title} (${format.toUpperCase()})`,
    href: "/reports",
    metadata: { report_id: reportId, format },
  }).catch(() => {});

  sendJson(res, 201, {
    report: {
      id: reportId,
      title,
      format,
      file_name: fileName,
      byte_size: buf.length,
      estimated_byte_size: estimatedByteSize,
      reporting_period_id: periodId,
      line_id: lineId,
      summary: { counts: ctx.counts, format },
    },
  });
}

export async function handleDownloadFactoryReport(
  req: IncomingMessage,
  res: ServerResponse,
  factoryId: string,
  reportId: string,
): Promise<void> {
  if (!getPool()) {
    sendJson(res, 503, { error: "database_unconfigured" });
    return;
  }
  if (!isUuid(reportId)) {
    sendJson(res, 400, { error: "invalid_report_id" });
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

  const pool = requirePool();
  const { rows } = await pool.query<{
    file_name: string;
    storage_path: string;
    title: string;
    format: string;
  }>(
    `SELECT file_name, storage_path, title, format
     FROM factory_reports
     WHERE id = $1::uuid AND factory_id = $2::uuid`,
    [reportId, factoryId],
  );
  const report = rows[0];
  if (!report?.storage_path) {
    sendJson(res, 404, { error: "report_not_found" });
    return;
  }

  let fileBuf: Buffer;
  try {
    fileBuf = await readFile(resolveReportFile(report.storage_path));
  } catch {
    sendJson(res, 404, { error: "report_file_missing" });
    return;
  }

  const format =
    report.format === "pdf" || report.file_name.toLowerCase().endsWith(".pdf")
      ? "pdf"
      : "csv";

  void insertAuditEvent(pool, {
    factoryId,
    actorUserId: claims.sub,
    action: "report.downloaded",
    entityType: "factory_report",
    entityId: reportId,
    metadata: {
      file_name: report.file_name,
      title: report.title,
      format,
      byte_size: fileBuf.length,
    },
  }).catch(() => {});

  const safeName = report.file_name.replace(/"/g, "");
  const disposition = `attachment; filename="${safeName}"`;

  if (format === "pdf") {
    sendBinary(res, 200, fileBuf, "application/pdf", {
      "content-disposition": disposition,
    });
    return;
  }

  sendText(res, 200, fileBuf.toString("utf8"), "text/csv", {
    "content-disposition": disposition,
  });
}
