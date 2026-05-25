import { API_VERSION } from "@filmbench/shared";

export const MES_CONTRACT_VERSION = "1.0.0";

export const MES_CAPABILITIES = [
  "ingest_events",
  "production_stop",
  "line_status",
  "oee_snapshot",
  "downtime_reason",
] as const;

export type MesCapability = (typeof MES_CAPABILITIES)[number];

export const MES_EVENT_TYPES = [
  "production_stop",
  "line_status",
  "oee_snapshot",
  "downtime_reason",
] as const;

export type MesEventType = (typeof MES_EVENT_TYPES)[number];

export interface MesContractPayload {
  status: "stub";
  contract_version: string;
  capabilities: MesCapability[];
  endpoints: {
    contract: string;
    ingest_events: string;
    list_events: string;
  };
  event_types: MesEventType[];
  sample_event: Record<string, unknown>;
  sample_responses: {
    ingest_accepted: Record<string, unknown>;
    ingest_rejected: Record<string, unknown>;
  };
  notes: string[];
}

export function buildMesContract(): MesContractPayload {
  const base = `/${API_VERSION}/integrations/mes`;
  return {
    status: "stub",
    contract_version: MES_CONTRACT_VERSION,
    capabilities: [...MES_CAPABILITIES],
    endpoints: {
      contract: `GET ${base}`,
      ingest_events: `POST ${base}/events`,
      list_events: `GET ${base}/events?factory_id={uuid}&limit=50`,
    },
    event_types: [...MES_EVENT_TYPES],
    sample_event: {
      factory_id: "00000000-0000-4000-8000-000000000001",
      line_code: "LINE-A",
      event_type: "production_stop",
      external_id: "mes-stop-20250520-001",
      occurred_at: "2025-05-20T14:30:00.000Z",
      payload: {
        duration_minutes: 45,
        reason_code: "changeover",
        reason_label: "Grade change",
      },
    },
    sample_responses: {
      ingest_accepted: {
        id: "00000000-0000-4000-8000-000000000099",
        status: "accepted",
        message: "Event stored; processing deferred to future MES connector.",
      },
      ingest_rejected: {
        error: "invalid_event_type",
        allowed: [...MES_EVENT_TYPES],
      },
    },
    notes: [
      "MES connector is stub-only: events are persisted but not applied to KPI facts.",
      "Requires Bearer token and factory membership.",
      "Idempotent when external_id is reused for the same factory and source.",
    ],
  };
}

export function isMesEventType(value: string): value is MesEventType {
  return (MES_EVENT_TYPES as readonly string[]).includes(value);
}
