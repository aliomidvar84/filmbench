import { describe, expect, it } from "vitest";

import { buildSteps } from "./onboarding-handlers.js";

const factoryId = "00000000-0000-4000-8000-000000000001";
const periodId = "00000000-0000-4000-8000-000000000002";

describe("buildSteps", () => {
  it("suggests upload when factory is new", () => {
    const r = buildSteps(factoryId, periodId, {
      ingestion_batches: 0,
      facts_in_period: 0,
      kpi_results: 0,
      validation_errors: 0,
      validation_warnings: 0,
      insights: 0,
      reports: 0,
    });
    expect(r.phase).toBe("new");
    expect(r.suggested_next_href).toContain("/upload");
  });

  it("suggests data-quality when validation errors exist", () => {
    const r = buildSteps(factoryId, periodId, {
      ingestion_batches: 2,
      facts_in_period: 5,
      kpi_results: 10,
      validation_errors: 1,
      validation_warnings: 0,
      insights: 0,
      reports: 0,
    });
    expect(r.suggested_next_href).toContain("/data-quality");
    expect(r.monthly_close_steps.find((s) => s.id === "validate")?.done).toBe(
      false,
    );
  });

  it("marks monthly close complete when all steps done", () => {
    const r = buildSteps(factoryId, periodId, {
      ingestion_batches: 2,
      facts_in_period: 5,
      kpi_results: 10,
      validation_errors: 0,
      validation_warnings: 0,
      insights: 3,
      reports: 1,
    });
    expect(r.monthly_close_steps.every((s) => s.done)).toBe(true);
    expect(r.phase).toBe("active");
  });
});
