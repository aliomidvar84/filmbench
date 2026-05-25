import type { Pool } from "pg";

import { notifyFactoryMembers } from "./insert.js";

export async function notifyFactoryPriorityDigest(
  pool: Pool,
  factoryId: string,
  periodIds: string[],
): Promise<void> {
  if (!periodIds.length) return;

  const validationRes = await pool.query<{ errors: number; warnings: number }>(
    `SELECT
       count(*) FILTER (WHERE d.issue_severity = 'error')::int AS errors,
       count(*) FILTER (WHERE d.issue_severity = 'warning')::int AS warnings
     FROM data_validation_issues d
     INNER JOIN production_fact_monthly pf ON pf.id = d.production_fact_id
     INNER JOIN production_lines pl ON pl.id = pf.line_id AND pl.factory_id = $1::uuid
     WHERE pf.reporting_period_id = ANY($2::uuid[])`,
    [factoryId, periodIds],
  );
  const errors = validationRes.rows[0]?.errors ?? 0;
  const warnings = validationRes.rows[0]?.warnings ?? 0;

  if (errors > 0) {
    await notifyFactoryMembers(pool, factoryId, {
      kind: "validation_errors",
      severity: "critical",
      title: "Data validation errors need attention",
      body: `${errors} error(s) and ${warnings} warning(s) for uploaded period(s).`,
      href: "/data-quality",
      metadata: { errors, warnings, reporting_period_ids: periodIds },
    });
  } else if (warnings > 0) {
    await notifyFactoryMembers(pool, factoryId, {
      kind: "validation_errors",
      severity: "warning",
      title: "Data validation warnings",
      body: `${warnings} warning(s) for uploaded period(s).`,
      href: "/data-quality",
      metadata: { warnings, reporting_period_ids: periodIds },
    });
  }

  const belowRes = await pool.query<{ below_target: number }>(
    `SELECT count(*)::int AS below_target
     FROM vw_kpi_below_factory_target g
     WHERE g.factory_id = $1::uuid
       AND g.reporting_period_id = ANY($2::uuid[])`,
    [factoryId, periodIds],
  );
  const below = belowRes.rows[0]?.below_target ?? 0;
  if (below > 0) {
    await notifyFactoryMembers(pool, factoryId, {
      kind: "below_target_alert",
      severity: "warning",
      title: "KPIs below factory target",
      body: `${below} KPI result(s) are below your factory targets for the latest upload.`,
      href: "/overview",
      metadata: { below_target: below, reporting_period_ids: periodIds },
    });
  }
}
