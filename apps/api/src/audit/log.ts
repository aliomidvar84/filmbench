import type { Pool } from "pg";

export interface AuditInsert {
  factoryId: string;
  actorUserId: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
}

export async function insertAuditEvent(pool: Pool, row: AuditInsert): Promise<void> {
  await pool.query(
    `INSERT INTO audit_events (
       factory_id,
       actor_user_id,
       action,
       entity_type,
       entity_id,
       metadata
     )
     VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6::jsonb)`,
    [
      row.factoryId,
      row.actorUserId,
      row.action,
      row.entityType,
      row.entityId ?? null,
      JSON.stringify(row.metadata ?? {}),
    ],
  );
}
