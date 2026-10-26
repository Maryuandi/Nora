import { authorize, type Action } from "@nora/authz";
import { createPrisma, membership, type Db, type Prisma, type PrismaClient, type Tx } from "@nora/db";

let client: PrismaClient | undefined;
export const db = (): PrismaClient => (client ??= createPrisma());

/** Runs fn in one transaction: an audit write that fails rolls the change back with it. */
export const withTx = <T>(fn: (tx: Tx) => Promise<T>) => db().$transaction(fn);

/** Re-checks membership and project status inside the worker (no cache). */
export const authorizeUser = (userId: string, action: Action, projectId: string) =>
  authorize((u, p) => membership(db(), u, p), userId, action, projectId);

export async function audit(q: Db, e: { projectId: string; actorId?: string | null; action: string; objectType: string; objectId: string; result?: string; correlationId: string; metadata?: Prisma.InputJsonObject }) {
  await q.auditEvent.create({
    data: {
      projectId: e.projectId, actorId: e.actorId ?? null, action: e.action, objectType: e.objectType, objectId: e.objectId, result: e.result ?? "success",
      correlationId: e.correlationId, metadataJson: e.metadata ?? {},
    },
  });
}

/** Unprojected outbox events older than this make the graph (and so the evidence) possibly stale. */
const STALE_AFTER_SECONDS = 30;

/** Raw: measured on the database clock, the same clock that stamped occurred_at. */
export async function staleOutboxEvents(q: Db, projectId: string, exclude: string[] = []): Promise<number> {
  const [{ n }] = await q.$queryRaw<[{ n: bigint }]>`
    SELECT count(*) AS n FROM outbox_events
     WHERE project_id = ${projectId}::uuid AND projected_at IS NULL AND NOT dead_letter AND aggregate_type <> ALL(${exclude}::text[])
       AND occurred_at < now() - make_interval(secs => ${STALE_AFTER_SECONDS})`;
  return Number(n);
}

/** Start of the current UTC day; the daily model budgets count calls since then. */
export const startOfDay = () => new Date(new Date().toISOString().slice(0, 10));
