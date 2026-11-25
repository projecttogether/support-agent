import type { DbOrTx } from "../db/client";
import { auditLog } from "../db/schema";
import { isOperator, type Actor } from "../auth/principal";

/**
 * Records a change made in the admin interface or with the operator command.
 * The command shows as the actor `operator`, its command after the summary.
 * `summary` must never contain secrets.
 */
export async function audit(
  db: DbOrTx,
  actor: Actor | null,
  entry: { action: string; entityType: string; entityId?: string | null; summary: string },
) {
  const operator = isOperator(actor) ? actor : null;
  const user = actor && !isOperator(actor) ? actor : null;
  await db.insert(auditLog).values({
    actorUserId: user?.id ?? null,
    actorEmail: user?.email ?? (operator ? "operator" : null),
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId ?? null,
    summary: (operator ? `${entry.summary} (${operator.command})` : entry.summary).slice(0, 500),
  });
}
