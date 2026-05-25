import { describe, expect, it } from "vitest";

import { escapeChString } from "./client.js";

describe("escapeChString", () => {
  it("escapes quotes and backslashes", () => {
    expect(escapeChString("a'b\\c")).toBe("a\\'b\\\\c");
  });
});
