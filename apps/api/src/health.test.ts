import { describe, expect, it } from "vitest";

import {
  buildHealthPayload,
  buildLivenessPayload,
  isAuthConfigured,
} from "./health.js";

describe("buildHealthPayload", () => {
  it("returns payload with database and auth fields", () => {
    const p = buildHealthPayload("development");
    expect(p.service).toBe("filmbench-api");
    expect(p.check).toBe("ready");
    expect(p.environment).toBe("development");
    expect(p.database).toBe("unconfigured");
    expect(typeof p.auth_configured).toBe("boolean");
  });
});

describe("buildLivenessPayload", () => {
  it("always reports ok for live probe", () => {
    const p = buildLivenessPayload("production");
    expect(p.ok).toBe(true);
    expect(p.check).toBe("live");
  });
});

describe("isAuthConfigured", () => {
  it("returns boolean without throwing", () => {
    expect(typeof isAuthConfigured()).toBe("boolean");
  });
});
