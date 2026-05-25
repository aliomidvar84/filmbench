import { describe, expect, it } from "vitest";
import { API_VERSION } from "@filmbench/shared";

describe("web smoke", () => {
  it("resolves shared package", () => {
    expect(API_VERSION).toBe("v1");
  });
});
