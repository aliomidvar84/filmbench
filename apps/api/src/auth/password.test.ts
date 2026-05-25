import { describe, expect, it } from "vitest";

import { validateNewPassword } from "./password.js";

describe("validateNewPassword", () => {
  it("rejects short passwords", () => {
    expect(validateNewPassword("abc")).toBe("password_too_short");
  });

  it("accepts passwords at min length", () => {
    expect(validateNewPassword("12345678")).toBeNull();
  });
});
