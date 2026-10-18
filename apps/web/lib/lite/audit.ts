import "server-only";
import type { Db, Prisma } from "@nora/db";

export interface AuditInput {
  projectId: string | null;
  actorId: string | null;
  action: string;
  objectType: string;
  objectId?: string | null;
  result?: "success" | "denied" | "failed";
  correlationId: string;
  metadata?: Prisma.InputJsonObject;
}

/** Call inside the mutation's transaction: if this insert fails, the mutation is rolled back too. */
export async function audit(db: Db, e: AuditInput): Promise<void> {
  const result = e.result ?? "success";
  await db.auditEvent.create({
    data: {
      projectId: e.projectId, actorId: e.actorId, action: e.action, objectType: e.objectType, objectId: e.objectId ?? null,
      result, correlationId: e.correlationId, metadataJson: e.metadata ?? {},
    },
  });
  if (e.projectId && result === "success") await db.project.updateMany({ where: { id: e.projectId }, data: { lastActivityAt: new Date() } });
}
