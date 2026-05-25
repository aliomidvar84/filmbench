import type { IncomingMessage, ServerResponse } from "node:http";

import { insertAuditEvent } from "../audit/log.js";
import { roleForFactory } from "../auth/rbac.js";
import { getPool, requirePool } from "../db.js";
import {
  buildMesContract,
  isMesEventType,
  MES_EVENT_TYPES,
} from "../integrations/mes-contract.js";
import { sendJson } from "../http/respond.js";
import { isUuid, readJsonBody, requestUrl } from "../http/util.js";
import { requireAccessFromRequest } from "./auth-handlers.js";

const MAX_EVENTS = 50;

interface MesEventBody {
  factory_id?: string;
  line_code?: string | null;
  line_id?: string | null;
  event_type?: string;
  external_id?: string | null;
  occurred_at?: string;
  payload?: Record<string, unknown>;
}

function parseOccurredAt(raw: string | undefined): Date | null {
  if (!raw?.trim()) return new Date();
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function handleGetMesIntegration(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  let claims;
  try {
    claims = requireAccessFromRequest(req);
  } catch {
    sendJson(res, 401, { error: "unauthorized" });
    return;
  }
  void claims;
  sendJson(res, 200, buildMesContract());
}

export async function handlePostMesEvent(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (!getPool()) {
    sendJson(res, 503, { error: "database_unconfigured" });
    return;
  }
  let claims;
  try {
    claims = requireAccessFromRequest(req);
  } catch {
    sendJson(res, 401, { error: "unauthorized" });
    return;
  }

  let body: MesEventBody;
  try {
    body = await readJsonBody<MesEventBody>(req);
  } catch {
    sendJson(res, 400, { error: "invalid_json" });
    return;
  }

  const factoryId = body.factory_id?.trim() ?? "";
  if (!isUuid(factoryId)) {
    sendJson(res, 400, { error: "factory_id_required" });
    return;
  }
  const role = roleForFactory(claims.memberships, factoryId);
  if (!role) {
    sendJson(res, 403, { error: "forbidden" });
    return;
  }

  const eventType = body.event_type?.trim() ?? "";
  if (!eventType || !isMesEventType(eventType)) {
    sendJson(res, 400, {
      error: "invalid_event_type",
      allowed: [...MES_EVENT_TYPES],
    });
    return;
  }

  const occurredAt = parseOccurredAt(body.occurred_at);
  if (!occurredAt) {
    sendJson(res, 400, { error: "invalid_occurred_at" });
    return;
  }

  const externalId =
    body.external_id === null || body.external_id === undefined
      ? null
      : String(body.external_id).trim() || null;

  const pool = requirePool();

  if (externalId) {
    const dup = await pool.query<{ id: string }>(
      `SELECT id::text FROM integration_events
       WHERE factory_id = $1::uuid AND source = 'mes' AND external_id = $2
       LIMIT 1`,
      [factoryId, externalId],
    );
    const existing = dup.rows[0];
    if (existing) {
      sendJson(res, 200, {
        id: existing.id,
        status: "accepted",
        duplicate: true,
        message: "Event already received (idempotent external_id).",
      });
      return;
    }
  }

  let lineId: string | null = null;
  let lineCode: string | null = null;
  const lineIdRaw = body.line_id?.trim() ?? "";
  const lineCodeRaw = body.line_code?.trim() ?? "";
  if (lineIdRaw && isUuid(lineIdRaw)) {
    const lineRes = await pool.query<{ id: string; line_code: string }>(
      `SELECT id::text, line_code FROM production_lines
       WHERE id = $1::uuid AND factory_id = $2::uuid`,
      [lineIdRaw, factoryId],
    );
    if (!lineRes.rowCount) {
      sendJson(res, 400, { error: "invalid_line_id" });
      return;
    }
    lineId = lineRes.rows[0]?.id ?? null;
    lineCode = lineRes.rows[0]?.line_code ?? null;
  } else if (lineCodeRaw) {
    const lineRes = await pool.query<{ id: string; line_code: string }>(
      `SELECT id::text, line_code FROM production_lines
       WHERE factory_id = $1::uuid AND line_code = $2`,
      [factoryId, lineCodeRaw],
    );
    if (lineRes.rowCount) {
      lineId = lineRes.rows[0]?.id ?? null;
      lineCode = lineRes.rows[0]?.line_code ?? null;
    } else {
      lineCode = lineCodeRaw;
    }
  }

  const payload =
    body.payload && typeof body.payload === "object" && !Array.isArray(body.payload)
      ? body.payload
      : {};

  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO integration_events (
       factory_id,
       source,
       event_type,
       external_id,
       line_id,
       line_code,
       occurred_at,
       payload,
       status,
       received_by_user_id
     )
     VALUES ($1::uuid, 'mes', $2, $3, $4::uuid, $5, $6, $7::jsonb, 'accepted', $8::uuid)
     RETURNING id::text`,
    [
      factoryId,
      eventType,
      externalId,
      lineId,
      lineCode,
      occurredAt.toISOString(),
      JSON.stringify(payload),
      claims.sub,
    ],
  );
  const id = rows[0]?.id;
  if (!id) {
    sendJson(res, 500, { error: "event_insert_failed" });
    return;
  }

  void insertAuditEvent(pool, {
    factoryId,
    actorUserId: claims.sub,
    action: "integration_event.received",
    entityType: "integration_events",
    entityId: id,
    metadata: {
      source: "mes",
      event_type: eventType,
      external_id: externalId,
      line_code: lineCode,
    },
  }).catch(() => {});

  sendJson(res, 202, {
    id,
    status: "accepted",
    message: "Event stored; processing deferred to future MES connector.",
  });
}

export async function handleListMesEvents(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (!getPool()) {
    sendJson(res, 503, { error: "database_unconfigured" });
    return;
  }
  let claims;
  try {
    claims = requireAccessFromRequest(req);
  } catch {
    sendJson(res, 401, { error: "unauthorized" });
    return;
  }

  const url = requestUrl(req);
  const factoryId = url.searchParams.get("factory_id")?.trim() ?? "";
  if (!isUuid(factoryId)) {
    sendJson(res, 400, { error: "factory_id_required" });
    return;
  }
  const role = roleForFactory(claims.memberships, factoryId);
  if (!role) {
    sendJson(res, 403, { error: "forbidden" });
    return;
  }

  const limitRaw = Number(url.searchParams.get("limit") ?? MAX_EVENTS);
  const limit = Number.isFinite(limitRaw)
    ? Math.min(Math.max(1, Math.floor(limitRaw)), MAX_EVENTS)
    : MAX_EVENTS;

  const pool = requirePool();
  const { rows } = await pool.query(
    `SELECT id::text,
            factory_id::text,
            event_type,
            external_id,
            line_code,
            occurred_at::text AS occurred_at,
            received_at::text AS received_at,
            status,
            payload
     FROM integration_events
     WHERE factory_id = $1::uuid AND source = 'mes'
     ORDER BY received_at DESC
     LIMIT $2::int`,
    [factoryId, limit],
  );

  sendJson(res, 200, { events: rows, count: rows.length });
}
