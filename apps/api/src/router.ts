import type { IncomingMessage, ServerResponse } from "node:http";

import { API_VERSION } from "@filmbench/shared";

import {
  buildLivenessPayload,
  buildReadinessPayload,
} from "./health.js";
import {
  handleChangePassword,
  handleLogin,
  handleLogout,
  handleRefresh,
} from "./routes/auth-handlers.js";
import {
  handleMonthlyExcelUpload,
  handleMonthlyTemplateDownload,
} from "./routes/ingestion-handlers.js";
import {
  handleBenchmarkExecutionLog,
  handleBenchmarkFilterOptions,
  handleFactoryBenchmarkComparison,
  handleRefreshFactoryBenchmarks,
} from "./routes/benchmark-handlers.js";
import {
  handleFactoryInsights,
  handleImpactCalculator,
  handleRefreshFactoryInsights,
} from "./routes/insights-handlers.js";
import {
  handleAnalyticsStatus,
  handleAnalyticsSync,
} from "./routes/analytics-handlers.js";
import {
  handleGetFactorySettings,
  handlePatchFactorySettings,
} from "./routes/settings-handlers.js";
import {
  handleFactoryKpiResults,
  handleFactoryKpiTrends,
  handleFactoryLines,
  handleFactoryReportingPeriods,
} from "./routes/dashboard-handlers.js";
import {
  handleExportBenchmarkCsv,
  handleExportKpiResultsCsv,
  handleExportKpiTrendsCsv,
  handleFactoryAuditEvents,
} from "./routes/export-handlers.js";
import {
  handleAddFactoryMember,
  handleFactoryIngestionBatches,
  handleListFactoryMembers,
  handlePatchFactoryMember,
  handleRemoveFactoryMember,
} from "./routes/admin-handlers.js";
import {
  handleFactories,
  handleFactoryCapabilities,
  handleMe,
} from "./routes/v1-handlers.js";
import {
  handleExportValidationIssuesCsv,
  handleFactoryValidationIssues,
} from "./routes/validation-issues-handlers.js";
import {
  handleFactoryKpiTargetComparison,
  handleFactoryKpiTargets,
  handlePutFactoryKpiTargets,
} from "./routes/targets-handlers.js";
import { handleFactorySummary } from "./routes/summary-handlers.js";
import {
  handleExportKpiPeriodComparisonCsv,
  handleFactoryKpiPeriodComparison,
} from "./routes/period-compare-handlers.js";
import {
  handleCreateImprovementAction,
  handleExportImprovementActionsCsv,
  handleFactoryImprovementActions,
  handlePatchImprovementAction,
} from "./routes/improvement-actions-handlers.js";
import {
  handleListNotifications,
  handleMarkAllNotificationsRead,
  handleNotificationsUnreadCount,
  handlePatchNotification,
} from "./routes/notifications-handlers.js";
import {
  handleDownloadFactoryReport,
  handleFactoryReportsList,
  handleGenerateFactoryReport,
} from "./routes/reports-handlers.js";
import {
  handleGetMesIntegration,
  handleListMesEvents,
  handlePostMesEvent,
} from "./routes/integrations-handlers.js";
import {
  handleInsightRuleRegressionTest,
  handleListInsightRules,
  handlePatchInsightRule,
} from "./routes/insight-rules-admin-handlers.js";
import { handleFactoryOnboardingStatus } from "./routes/onboarding-handlers.js";
import { sendJson, sendOptions } from "./http/respond.js";

function appEnv(): "development" | "staging" | "production" {
  return process.env.NODE_ENV === "production"
    ? "production"
    : process.env.APP_ENV === "staging"
      ? "staging"
      : "development";
}

export async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const method = req.method ?? "GET";
  const host = req.headers.host ?? "127.0.0.1";
  const url = new URL(req.url ?? "/", `http://${host}`);
  const path = url.pathname;

  if (method === "OPTIONS") {
    sendOptions(res);
    return;
  }

  const healthLivePaths = new Set([
    "/health/live",
    `/${API_VERSION}/health/live`,
  ]);
  if (method === "GET" && healthLivePaths.has(path)) {
    sendJson(res, 200, buildLivenessPayload(appEnv()));
    return;
  }

  const healthReadyPaths = new Set([
    "/health",
    "/health/ready",
    `/${API_VERSION}/health`,
    `/${API_VERSION}/health/ready`,
  ]);
  if (method === "GET" && healthReadyPaths.has(path)) {
    const payload = await buildReadinessPayload(appEnv());
    sendJson(res, payload.ok ? 200 : 503, payload);
    return;
  }

  try {
    if (method === "POST" && path === `/${API_VERSION}/auth/login`) {
      await handleLogin(req, res);
      return;
    }
    if (method === "POST" && path === `/${API_VERSION}/auth/refresh`) {
      await handleRefresh(req, res);
      return;
    }
    if (method === "POST" && path === `/${API_VERSION}/auth/logout`) {
      await handleLogout(req, res);
      return;
    }
    if (method === "POST" && path === `/${API_VERSION}/me/change-password`) {
      await handleChangePassword(req, res);
      return;
    }
    const notifUnreadPath = `/${API_VERSION}/notifications/unread-count`;
    if (method === "GET" && path === notifUnreadPath) {
      await handleNotificationsUnreadCount(req, res);
      return;
    }
    const notifMarkAllPath = `/${API_VERSION}/notifications/mark-all-read`;
    if (method === "POST" && path === notifMarkAllPath) {
      await handleMarkAllNotificationsRead(req, res);
      return;
    }
    const notifItemPath = path.match(
      new RegExp(`^/${API_VERSION}/notifications/([^/]+)$`),
    );
    const notifId = notifItemPath?.[1] ?? "";
    if (
      method === "PATCH" &&
      notifItemPath &&
      notifId !== "unread-count" &&
      notifId !== "mark-all-read"
    ) {
      await handlePatchNotification(req, res, notifId);
      return;
    }
    const notifListPath = `/${API_VERSION}/notifications`;
    if (method === "GET" && path === notifListPath) {
      await handleListNotifications(req, res);
      return;
    }
    if (method === "GET" && path === `/${API_VERSION}/me`) {
      await handleMe(req, res);
      return;
    }
    const insightRuleTestPath = path.match(
      new RegExp(`^/${API_VERSION}/admin/insight-rules/([^/]+)/regression-test$`),
    );
    if (method === "POST" && insightRuleTestPath) {
      await handleInsightRuleRegressionTest(
        req,
        res,
        insightRuleTestPath[1] ?? "",
      );
      return;
    }
    const insightRuleItemPath = path.match(
      new RegExp(`^/${API_VERSION}/admin/insight-rules/([^/]+)$`),
    );
    if (method === "PATCH" && insightRuleItemPath) {
      await handlePatchInsightRule(req, res, insightRuleItemPath[1] ?? "");
      return;
    }
    const insightRulesListPath = `/${API_VERSION}/admin/insight-rules`;
    if (method === "GET" && path === insightRulesListPath) {
      await handleListInsightRules(req, res);
      return;
    }
    const mesEventsPath = `/${API_VERSION}/integrations/mes/events`;
    if (method === "GET" && path === mesEventsPath) {
      await handleListMesEvents(req, res);
      return;
    }
    if (method === "POST" && path === mesEventsPath) {
      await handlePostMesEvent(req, res);
      return;
    }
    const mesContractPath = `/${API_VERSION}/integrations/mes`;
    if (method === "GET" && path === mesContractPath) {
      await handleGetMesIntegration(req, res);
      return;
    }
    if (method === "GET" && path === `/${API_VERSION}/factories`) {
      await handleFactories(req, res);
      return;
    }
    const cap = path.match(
      new RegExp(`^/${API_VERSION}/factories/([^/]+)/capabilities$`),
    );
    if (method === "GET" && cap) {
      await handleFactoryCapabilities(req, res, cap[1] ?? "");
      return;
    }
    const linesPath = path.match(
      new RegExp(`^/${API_VERSION}/factories/([^/]+)/lines$`),
    );
    if (method === "GET" && linesPath) {
      await handleFactoryLines(req, res, linesPath[1] ?? "");
      return;
    }
    const periodsPath = path.match(
      new RegExp(`^/${API_VERSION}/factories/([^/]+)/reporting-periods$`),
    );
    if (method === "GET" && periodsPath) {
      await handleFactoryReportingPeriods(req, res, periodsPath[1] ?? "");
      return;
    }
    const kpiExportPath = path.match(
      new RegExp(`^/${API_VERSION}/factories/([^/]+)/kpi-results/export$`),
    );
    if (method === "GET" && kpiExportPath) {
      await handleExportKpiResultsCsv(req, res, kpiExportPath[1] ?? "");
      return;
    }
    const kpiPath = path.match(
      new RegExp(`^/${API_VERSION}/factories/([^/]+)/kpi-results$`),
    );
    if (method === "GET" && kpiPath) {
      await handleFactoryKpiResults(req, res, kpiPath[1] ?? "");
      return;
    }
    const periodCompareExportPath = path.match(
      new RegExp(
        `^/${API_VERSION}/factories/([^/]+)/kpi-period-comparison/export$`,
      ),
    );
    if (method === "GET" && periodCompareExportPath) {
      await handleExportKpiPeriodComparisonCsv(
        req,
        res,
        periodCompareExportPath[1] ?? "",
      );
      return;
    }
    const periodComparePath = path.match(
      new RegExp(
        `^/${API_VERSION}/factories/([^/]+)/kpi-period-comparison$`,
      ),
    );
    if (method === "GET" && periodComparePath) {
      await handleFactoryKpiPeriodComparison(
        req,
        res,
        periodComparePath[1] ?? "",
      );
      return;
    }
    const trendsExportPath = path.match(
      new RegExp(`^/${API_VERSION}/factories/([^/]+)/kpi-trends/export$`),
    );
    if (method === "GET" && trendsExportPath) {
      await handleExportKpiTrendsCsv(req, res, trendsExportPath[1] ?? "");
      return;
    }
    const trendsPath = path.match(
      new RegExp(`^/${API_VERSION}/factories/([^/]+)/kpi-trends$`),
    );
    if (method === "GET" && trendsPath) {
      await handleFactoryKpiTrends(req, res, trendsPath[1] ?? "");
      return;
    }
    const benchRefreshPath = path.match(
      new RegExp(`^/${API_VERSION}/factories/([^/]+)/benchmark/refresh$`),
    );
    if (method === "POST" && benchRefreshPath) {
      await handleRefreshFactoryBenchmarks(req, res, benchRefreshPath[1] ?? "");
      return;
    }
    const benchExecLogPath = path.match(
      new RegExp(`^/${API_VERSION}/factories/([^/]+)/benchmark/execution-log$`),
    );
    if (method === "GET" && benchExecLogPath) {
      await handleBenchmarkExecutionLog(req, res, benchExecLogPath[1] ?? "");
      return;
    }
    const benchFilterPath = path.match(
      new RegExp(
        `^/${API_VERSION}/factories/([^/]+)/benchmark-comparison/filter-options$`,
      ),
    );
    if (method === "GET" && benchFilterPath) {
      await handleBenchmarkFilterOptions(req, res, benchFilterPath[1] ?? "");
      return;
    }
    const benchExportPath = path.match(
      new RegExp(
        `^/${API_VERSION}/factories/([^/]+)/benchmark-comparison/export$`,
      ),
    );
    if (method === "GET" && benchExportPath) {
      await handleExportBenchmarkCsv(req, res, benchExportPath[1] ?? "");
      return;
    }
    const benchPath = path.match(
      new RegExp(`^/${API_VERSION}/factories/([^/]+)/benchmark-comparison$`),
    );
    if (method === "GET" && benchPath) {
      await handleFactoryBenchmarkComparison(req, res, benchPath[1] ?? "");
      return;
    }
    const auditPath = path.match(
      new RegExp(`^/${API_VERSION}/factories/([^/]+)/audit-events$`),
    );
    if (method === "GET" && auditPath) {
      await handleFactoryAuditEvents(req, res, auditPath[1] ?? "");
      return;
    }
    const validationExportPath = path.match(
      new RegExp(
        `^/${API_VERSION}/factories/([^/]+)/validation-issues/export$`,
      ),
    );
    if (method === "GET" && validationExportPath) {
      await handleExportValidationIssuesCsv(
        req,
        res,
        validationExportPath[1] ?? "",
      );
      return;
    }
    const validationIssuesPath = path.match(
      new RegExp(`^/${API_VERSION}/factories/([^/]+)/validation-issues$`),
    );
    if (method === "GET" && validationIssuesPath) {
      await handleFactoryValidationIssues(
        req,
        res,
        validationIssuesPath[1] ?? "",
      );
      return;
    }
    const targetComparisonPath = path.match(
      new RegExp(
        `^/${API_VERSION}/factories/([^/]+)/kpi-target-comparison$`,
      ),
    );
    if (method === "GET" && targetComparisonPath) {
      await handleFactoryKpiTargetComparison(
        req,
        res,
        targetComparisonPath[1] ?? "",
      );
      return;
    }
    const kpiTargetsPath = path.match(
      new RegExp(`^/${API_VERSION}/factories/([^/]+)/kpi-targets$`),
    );
    if (method === "GET" && kpiTargetsPath) {
      await handleFactoryKpiTargets(req, res, kpiTargetsPath[1] ?? "");
      return;
    }
    if (method === "PUT" && kpiTargetsPath) {
      await handlePutFactoryKpiTargets(req, res, kpiTargetsPath[1] ?? "");
      return;
    }
    const analyticsSyncPath = path.match(
      new RegExp(`^/${API_VERSION}/factories/([^/]+)/analytics/sync$`),
    );
    if (method === "POST" && analyticsSyncPath) {
      await handleAnalyticsSync(req, res, analyticsSyncPath[1] ?? "");
      return;
    }
    const analyticsStatusPath = path.match(
      new RegExp(`^/${API_VERSION}/factories/([^/]+)/analytics/status$`),
    );
    if (method === "GET" && analyticsStatusPath) {
      await handleAnalyticsStatus(req, res, analyticsStatusPath[1] ?? "");
      return;
    }
    const settingsPath = path.match(
      new RegExp(`^/${API_VERSION}/factories/([^/]+)/settings$`),
    );
    if (method === "GET" && settingsPath) {
      await handleGetFactorySettings(req, res, settingsPath[1] ?? "");
      return;
    }
    if (method === "PATCH" && settingsPath) {
      await handlePatchFactorySettings(req, res, settingsPath[1] ?? "");
      return;
    }
    const insightsRefreshPath = path.match(
      new RegExp(`^/${API_VERSION}/factories/([^/]+)/insights/refresh$`),
    );
    if (method === "POST" && insightsRefreshPath) {
      await handleRefreshFactoryInsights(req, res, insightsRefreshPath[1] ?? "");
      return;
    }
    const impactCalcPath = path.match(
      new RegExp(`^/${API_VERSION}/factories/([^/]+)/impact-calculator$`),
    );
    if (method === "POST" && impactCalcPath) {
      await handleImpactCalculator(req, res, impactCalcPath[1] ?? "");
      return;
    }
    const insightsPath = path.match(
      new RegExp(`^/${API_VERSION}/factories/([^/]+)/insights$`),
    );
    if (method === "GET" && insightsPath) {
      await handleFactoryInsights(req, res, insightsPath[1] ?? "");
      return;
    }
    const onboardingPath = path.match(
      new RegExp(`^/${API_VERSION}/factories/([^/]+)/onboarding-status$`),
    );
    if (method === "GET" && onboardingPath) {
      await handleFactoryOnboardingStatus(req, res, onboardingPath[1] ?? "");
      return;
    }
    const summaryPath = path.match(
      new RegExp(`^/${API_VERSION}/factories/([^/]+)/summary$`),
    );
    if (method === "GET" && summaryPath) {
      await handleFactorySummary(req, res, summaryPath[1] ?? "");
      return;
    }
    const reportDownloadPath = path.match(
      new RegExp(`^/${API_VERSION}/factories/([^/]+)/reports/([^/]+)/download$`),
    );
    if (method === "GET" && reportDownloadPath) {
      await handleDownloadFactoryReport(
        req,
        res,
        reportDownloadPath[1] ?? "",
        reportDownloadPath[2] ?? "",
      );
      return;
    }
    const reportsPath = path.match(
      new RegExp(`^/${API_VERSION}/factories/([^/]+)/reports$`),
    );
    if (method === "GET" && reportsPath) {
      await handleFactoryReportsList(req, res, reportsPath[1] ?? "");
      return;
    }
    if (method === "POST" && reportsPath) {
      await handleGenerateFactoryReport(req, res, reportsPath[1] ?? "");
      return;
    }
    const actionExportPath = path.match(
      new RegExp(
        `^/${API_VERSION}/factories/([^/]+)/improvement-actions/export$`,
      ),
    );
    if (method === "GET" && actionExportPath) {
      await handleExportImprovementActionsCsv(
        req,
        res,
        actionExportPath[1] ?? "",
      );
      return;
    }
    const actionItemPath = path.match(
      new RegExp(
        `^/${API_VERSION}/factories/([^/]+)/improvement-actions/([^/]+)$`,
      ),
    );
    if (method === "PATCH" && actionItemPath) {
      await handlePatchImprovementAction(
        req,
        res,
        actionItemPath[1] ?? "",
        actionItemPath[2] ?? "",
      );
      return;
    }
    const actionsPath = path.match(
      new RegExp(`^/${API_VERSION}/factories/([^/]+)/improvement-actions$`),
    );
    if (method === "GET" && actionsPath) {
      await handleFactoryImprovementActions(req, res, actionsPath[1] ?? "");
      return;
    }
    if (method === "POST" && actionsPath) {
      await handleCreateImprovementAction(req, res, actionsPath[1] ?? "");
      return;
    }
    const ingestionBatchesPath = path.match(
      new RegExp(`^/${API_VERSION}/factories/([^/]+)/ingestion-batches$`),
    );
    if (method === "GET" && ingestionBatchesPath) {
      await handleFactoryIngestionBatches(
        req,
        res,
        ingestionBatchesPath[1] ?? "",
      );
      return;
    }
    const factoryMemberPath = path.match(
      new RegExp(`^/${API_VERSION}/factories/([^/]+)/members/([^/]+)$`),
    );
    if (method === "PATCH" && factoryMemberPath) {
      await handlePatchFactoryMember(
        req,
        res,
        factoryMemberPath[1] ?? "",
        factoryMemberPath[2] ?? "",
      );
      return;
    }
    if (method === "DELETE" && factoryMemberPath) {
      await handleRemoveFactoryMember(
        req,
        res,
        factoryMemberPath[1] ?? "",
        factoryMemberPath[2] ?? "",
      );
      return;
    }
    const factoryMembersPath = path.match(
      new RegExp(`^/${API_VERSION}/factories/([^/]+)/members$`),
    );
    if (method === "GET" && factoryMembersPath) {
      await handleListFactoryMembers(req, res, factoryMembersPath[1] ?? "");
      return;
    }
    if (method === "POST" && factoryMembersPath) {
      await handleAddFactoryMember(req, res, factoryMembersPath[1] ?? "");
      return;
    }
    const monthlyTemplate = path.match(
      new RegExp(
        `^/${API_VERSION}/factories/([^/]+)/ingestion/monthly-template\\.xlsx$`,
      ),
    );
    if (method === "GET" && monthlyTemplate) {
      await handleMonthlyTemplateDownload(req, res, monthlyTemplate[1] ?? "");
      return;
    }
    const monthlyUpload = path.match(
      new RegExp(`^/${API_VERSION}/factories/([^/]+)/ingestion/monthly-excel$`),
    );
    if (method === "POST" && monthlyUpload) {
      await handleMonthlyExcelUpload(req, res, monthlyUpload[1] ?? "");
      return;
    }
  } catch (e) {
    const status =
      typeof e === "object" && e !== null && "status" in e
        ? Number((e as { status?: number }).status) || 500
        : 500;
    const message = e instanceof Error ? e.message : "error";
    sendJson(res, status, { error: message });
    return;
  }

  sendJson(res, 404, { error: "not_found" });
}
