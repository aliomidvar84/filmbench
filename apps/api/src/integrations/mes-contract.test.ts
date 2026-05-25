import { describe, expect, it } from "vitest";

import {
  MES_CONTRACT_VERSION,
  buildMesContract,
  isMesEventType,
} from "./mes-contract.js";

describe("mes-contract", () => {
  it("exposes stub status and capabilities", () => {
    const c = buildMesContract();
    expect(c.status).toBe("stub");
    expect(c.contract_version).toBe(MES_CONTRACT_VERSION);
    expect(c.capabilities.length).toBeGreaterThan(0);
    expect(c.sample_event.event_type).toBe("production_stop");
  });

  it("validates known event types", () => {
    expect(isMesEventType("oee_snapshot")).toBe(true);
    expect(isMesEventType("unknown")).toBe(false);
  });
});
