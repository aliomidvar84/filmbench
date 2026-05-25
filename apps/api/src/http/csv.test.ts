import { describe, expect, it } from "vitest";

import { csvEscape, toCsv } from "./csv.js";

describe("csvEscape", () => {
  it("quotes fields with commas and escapes quotes", () => {
    expect(csvEscape("ok")).toBe("ok");
    expect(csvEscape('say "hi"')).toBe('"say ""hi"""');
    expect(csvEscape("a,b")).toBe('"a,b"');
  });
});

describe("toCsv", () => {
  it("joins headers and rows with CRLF", () => {
    const s = toCsv(
      ["a", "b"],
      [
        ["1", "2"],
        ["3", "4"],
      ],
    );
    expect(s).toBe("a,b\r\n1,2\r\n3,4\r\n");
  });
});
