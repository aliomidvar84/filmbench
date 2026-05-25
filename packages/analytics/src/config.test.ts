import { afterEach, describe, expect, it } from "vitest";

import {
  isClickHouseEnabled,
  useClickHouseQueries,
} from "./config.js";

describe("clickhouse config", () => {
  const prev = { ...process.env };

  afterEach(() => {
    process.env = { ...prev };
  });

  it("is disabled by default", () => {
    delete process.env.CLICKHOUSE_ENABLED;
    delete process.env.USE_CLICKHOUSE_QUERIES;
    expect(isClickHouseEnabled()).toBe(false);
    expect(useClickHouseQueries()).toBe(false);
  });

  it("enables queries only when both flags set", () => {
    process.env.CLICKHOUSE_ENABLED = "true";
    process.env.USE_CLICKHOUSE_QUERIES = "true";
    expect(isClickHouseEnabled()).toBe(true);
    expect(useClickHouseQueries()).toBe(true);
  });
});
