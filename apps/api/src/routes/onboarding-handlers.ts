import type { IncomingMessage, ServerResponse } from "node:http";

import { getPool, requirePool } from "../db.js";
import { sendJson } from "../http/respond.js";
import { isUuid, requestUrl } from "../http/util.js";
import { requireAccessFromRequest } from "./auth-handlers.js";
import { assertDashboard } from "./dashboard-handlers.js";

export interface ChecklistStep {
  id: string;
  label: string;
  done: boolean;
  href: string;
}

export interface OnboardingStatusPayload {
  factory_id: string;
  reporting_period_id: string;
  phase: "new" | "ingested" | "active";
  first_time_complete: boolean;
  monthly_close_complete: boolean;
  counts: {
    ingestion_batches: number;
    facts_in_period: number;
    kpi_results: number;
    validation_errors: number;
    validation_warnings: number;
    insights: number;
    reports: number;
  };
  first_time_steps: ChecklistStep[];
  monthly_close_steps: ChecklistStep[];
  suggested_next_href: string;
}

export function buildSteps(
  factoryId: string,
  periodId: string,
  counts: OnboardingStatusPayload["counts"],
): Pick<
  OnboardingStatusPayload,
  "first_time_steps" | "monthly_close_steps" | "suggested_next_href" | "phase"
> {
  const uploadDone = counts.facts_in_period > 0 || counts.ingestion_batches > 0;
  const kpisReady = counts.kpi_results > 0;
  const validateDone = uploadDone && counts.validation_errors === 0;
  const insightsDone = counts.insights > 0;
  const reportDone = counts.reports > 0;

  const first_time_steps: ChecklistStep[] = [
    {
      id: "upload",
      label: "Upload monthly production Excel",
      done: uploadDone,
      href: `/upload?factory_id=${factoryId}`,
    },
    {
      id: "dashboard",
      label: "Open dashboard and review KPIs",
      done: kpisReady,
      href: `/dashboard?factory_id=${factoryId}&reporting_period_id=${periodId}`,
    },
  ];

  const monthly_close_steps: ChecklistStep[] = [
    {
      id: "upload",
      label: "Upload data for this period",
      done: counts.facts_in_period > 0,
      href: `/upload?factory_id=${factoryId}&reporting_period_id=${periodId}`,
    },
    {
      id: "validate",
      label: "Resolve validation errors",
      done: validateDone,
      href: `/data-quality?factory_id=${factoryId}&reporting_period_id=${periodId}`,
    },
    {
      id: "overview",
      label: "Review executive overview",
      done: kpisReady && validateDone,
      href: `/overview?factory_id=${factoryId}&reporting_period_id=${periodId}`,
    },
    {
      id: "insights",
      label: "Refresh insights",
      done: insightsDone,
      href: `/insights?factory_id=${factoryId}&reporting_period_id=${periodId}`,
    },
    {
      id: "report",
      label: "Generate executive report",
      done: reportDone,
      href: `/reports?factory_id=${factoryId}&reporting_period_id=${periodId}`,
    },
  ];

  let phase: OnboardingStatusPayload["phase"] = "active";
  if (counts.ingestion_batches === 0 && counts.facts_in_period === 0) {
    phase = "new";
  } else if (!kpisReady) {
    phase = "ingested";
  }

  let suggested_next_href = `/overview?factory_id=${factoryId}&reporting_period_id=${periodId}`;
  if (phase === "new") {
    suggested_next_href = `/upload?factory_id=${factoryId}`;
  } else if (counts.validation_errors > 0) {
    suggested_next_href = `/data-quality?factory_id=${factoryId}&reporting_period_id=${periodId}`;
  } else if (!insightsDone) {
    suggested_next_href = `/insights?factory_id=${factoryId}&reporting_period_id=${periodId}`;
  } else if (!reportDone) {
    suggested_next_href = `/reports?factory_id=${factoryId}&reporting_period_id=${periodId}`;
  } else if (!kpisReady) {
    suggested_next_href = `/upload?factory_id=${factoryId}`;
  }

  return { first_time_steps, monthly_close_steps, suggested_next_href, phase };
}

export async function handleFactoryOnboardingStatus(
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
  let periodId = url.searchParams.get("reporting_period_id")?.trim() ?? "";

  const pool = requirePool();

  if (!isUuid(periodId)) {
    const { rows: periodRows } = await pool.query<{ id: string }>(
      `SELECT rp.id::text
       FROM reporting_periods rp
       WHERE rp.id IN (
         SELECT pf.reporting_period_id
         FROM production_fact_monthly pf
         INNER JOIN production_lines pl ON pl.id = pf.line_id AND pl.factory_id = $1::uuid
         UNION
         SELECT kr.reporting_period_id
         FROM kpi_results kr
         WHERE kr.factory_id = $1::uuid
       )
       ORDER BY rp.period_end DESC, rp.period_start DESC
       LIMIT 1`,
      [factoryId],
    );
    periodId = periodRows[0]?.id ?? "";
  }

  if (!isUuid(periodId)) {
    sendJson(res, 400, { error: "reporting_period_id_required" });
    return;
  }
  const { rows } = await pool.query<{
    ingestion_batches: number;
    facts_in_period: number;
    kpi_results: number;
    validation_errors: number;
    validation_warnings: number;
    insights: number;
    reports: number;
  }>(
    `SELECT
       (SELECT count(*)::int FROM ingestion_batches b WHERE b.factory_id = $1::uuid) AS ingestion_batches,
       (SELECT count(*)::int
        FROM production_fact_monthly pf
        INNER JOIN production_lines pl ON pl.id = pf.line_id AND pl.factory_id = $1::uuid
        WHERE pf.reporting_period_id = $2::uuid) AS facts_in_period,
       (SELECT count(*)::int
        FROM kpi_results kr
        WHERE kr.factory_id = $1::uuid AND kr.reporting_period_id = $2::uuid) AS kpi_results,
       (SELECT count(*)::int
        FROM data_validation_issues d
        INNER JOIN production_fact_monthly pf ON pf.id = d.production_fact_id
        INNER JOIN production_lines pl ON pl.id = pf.line_id AND pl.factory_id = $1::uuid
        WHERE pf.reporting_period_id = $2::uuid AND d.issue_severity = 'error') AS validation_errors,
       (SELECT count(*)::int
        FROM data_validation_issues d
        INNER JOIN production_fact_monthly pf ON pf.id = d.production_fact_id
        INNER JOIN production_lines pl ON pl.id = pf.line_id AND pl.factory_id = $1::uuid
        WHERE pf.reporting_period_id = $2::uuid AND d.issue_severity = 'warning') AS validation_warnings,
       (SELECT count(*)::int
        FROM generated_insights gi
        WHERE gi.factory_id = $1::uuid AND gi.reporting_period_id = $2::uuid) AS insights,
       (SELECT count(*)::int
        FROM factory_reports r
        WHERE r.factory_id = $1::uuid AND r.reporting_period_id = $2::uuid) AS reports`,
    [factoryId, periodId],
  );

  const counts = rows[0] ?? {
    ingestion_batches: 0,
    facts_in_period: 0,
    kpi_results: 0,
    validation_errors: 0,
    validation_warnings: 0,
    insights: 0,
    reports: 0,
  };

  const built = buildSteps(factoryId, periodId, counts);
  const first_time_complete =
    built.first_time_steps.every((s) => s.done) && counts.kpi_results > 0;
  const monthly_close_complete = built.monthly_close_steps.every((s) => s.done);

  const payload: OnboardingStatusPayload = {
    factory_id: factoryId,
    reporting_period_id: periodId,
    phase: built.phase,
    first_time_complete,
    monthly_close_complete,
    counts,
    first_time_steps: built.first_time_steps,
    monthly_close_steps: built.monthly_close_steps,
    suggested_next_href: built.suggested_next_href,
  };

  sendJson(res, 200, payload);
}
