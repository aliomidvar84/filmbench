import { describe, expect, it } from "vitest";

import { isUuid } from "./util.js";

describe("isUuid", () => {
  it("accepts lowercase UUID v4 shape", () => {
    expect(isUuid("11111111-1111-4111-8111-111111111101")).toBe(true);
  });
  it("rejects non-UUID strings", () => {
    expect(isUuid("not-a-uuid")).toBe(false);
    expect(isUuid("")).toBe(false);
  });
});
