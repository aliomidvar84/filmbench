import { describe, expect, it } from "vitest";

import { renderTemplate } from "./template.js";
import { computePriorityScore } from "./priority.js";

describe("insight template", () => {
  it("replaces variables", () => {
    expect(
      renderTemplate("{{line_code}}: {{kpi_code}}", {
        line_code: "L1",
        kpi_code: "OEE",
      }),
    ).toBe("L1: OEE");
  });
});

describe("computePriorityScore", () => {
  it("ranks critical above info", () => {
    const c = computePriorityScore("critical", 1, 0.5);
    const i = computePriorityScore("info", 1, 0.5);
    expect(c).toBeGreaterThan(i);
  });
});
