import type { Pool } from "pg";

export type NotificationKind =
  | "ingestion_completed"
  | "validation_errors"
  | "below_target_alert"
  | "password_changed"
  | "improvement_action"
  | "insight_alert"
  | "system";

export type NotificationSeverity = "info" | "warning" | "critical";

export interface NotificationInsert {
  kind: NotificationKind;
  severity?: NotificationSeverity;
  title: string;
  body?: string | null;
  href?: string | null;
  metadata?: Record<string, unknown>;
}

export async function insertUserNotification(
  pool: Pool,
  userId: string,
  notification: NotificationInsert,
  factoryId?: string | null,
): Promise<void> {
  await pool.query(
    `INSERT INTO user_notifications (
       user_id,
       factory_id,
       kind,
       severity,
       title,
       body,
       href,
       metadata
     )
     VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8::jsonb)`,
    [
      userId,
      factoryId ?? null,
      notification.kind,
      notification.severity ?? "info",
      notification.title,
      notification.body ?? null,
      notification.href ?? null,
      JSON.stringify(notification.metadata ?? {}),
    ],
  );
}

export async function notifyFactoryMembers(
  pool: Pool,
  factoryId: string,
  notification: NotificationInsert,
  options?: { excludeUserIds?: string[] },
): Promise<void> {
  const exclude = options?.excludeUserIds ?? [];
  await pool.query(
    `INSERT INTO user_notifications (
       user_id,
       factory_id,
       kind,
       severity,
       title,
       body,
       href,
       metadata
     )
     SELECT
       m.user_id,
       $1::uuid,
       $2,
       $3,
       $4,
       $5,
       $6,
       $7::jsonb
     FROM user_factory_memberships m
     WHERE m.factory_id = $1::uuid
       AND (
         cardinality($8::uuid[]) = 0
         OR NOT (m.user_id = ANY($8::uuid[]))
       )`,
    [
      factoryId,
      notification.kind,
      notification.severity ?? "info",
      notification.title,
      notification.body ?? null,
      notification.href ?? null,
      JSON.stringify(notification.metadata ?? {}),
      exclude,
    ],
  );
}
