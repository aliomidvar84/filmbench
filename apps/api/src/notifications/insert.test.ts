import { describe, expect, it } from "vitest";

import type { NotificationInsert } from "./insert.js";

describe("NotificationInsert", () => {
  it("defaults severity to info when omitted", () => {
    const n: NotificationInsert = {
      kind: "system",
      title: "Test",
    };
    expect(n.severity ?? "info").toBe("info");
  });
});
