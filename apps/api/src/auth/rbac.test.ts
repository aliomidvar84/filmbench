import { describe, expect, it } from "vitest";

import {
  assertFactoryRole,
  canAdminister,
  canUpload,
  canViewDashboardAndReports,
  type Membership,
} from "./rbac.js";

const memberships: Membership[] = [
  { factory_id: "f1", role: "analyst" },
  { factory_id: "f2", role: "manager" },
];

describe("rbac", () => {
  it("analyst can upload", () => {
    expect(canUpload("analyst")).toBe(true);
    expect(canUpload("manager")).toBe(false);
  });

  it("manager can view dashboard and reports", () => {
    expect(canViewDashboardAndReports("manager")).toBe(true);
    expect(canViewDashboardAndReports("analyst")).toBe(false);
  });

  it("only admin can administer", () => {
    expect(canAdminister("admin")).toBe(true);
    expect(canAdminister("manager")).toBe(false);
  });

  it("assertFactoryRole allows matching role", () => {
    expect(assertFactoryRole(memberships, "f1", ["analyst", "admin"])).toBe(
      "analyst",
    );
  });

  it("assertFactoryRole rejects missing factory", () => {
    expect(() =>
      assertFactoryRole(memberships, "missing", ["admin"]),
    ).toThrow("forbidden");
  });
});
