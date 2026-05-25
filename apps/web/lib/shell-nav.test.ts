import { describe, expect, it } from "vitest";

import { filterNavForFactory, SHELL_NAV } from "./shell-nav";

describe("filterNavForFactory", () => {
  it("hides dashboard routes for analyst without dashboard", () => {
    const out = filterNavForFactory(
      SHELL_NAV,
      {
        can_view_dashboard: false,
        can_upload: true,
        can_administer: false,
      },
      true,
    );
    expect(out.some((i) => i.href === "/dashboard")).toBe(false);
    expect(out.some((i) => i.href === "/upload")).toBe(true);
  });

  it("shows dashboard for manager", () => {
    const out = filterNavForFactory(
      SHELL_NAV,
      {
        can_view_dashboard: true,
        can_upload: false,
        can_administer: false,
      },
      true,
    );
    expect(out.some((i) => i.href === "/overview")).toBe(true);
    expect(out.some((i) => i.href === "/upload")).toBe(false);
  });
});
