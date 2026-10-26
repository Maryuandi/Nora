import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "./generated/prisma/client.ts";

export { Prisma, PrismaClient };
export type Tx = Prisma.TransactionClient;
/** Anything that runs queries: the client itself or an interactive transaction. */
export type Db = PrismaClient | Tx;

export function createPrisma(connectionString = process.env.DATABASE_URL, pool: { max?: number; connectionTimeoutMillis?: number } = {}): PrismaClient {
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString, max: 10, ...pool }),
    // Result writes (thousands of case rows) share a transaction with their status update; the 5 s default is too short.
    transactionOptions: { maxWait: 10_000, timeout: 120_000 },
  });
}

/** API/JSON form of a value: Date → ISO string, bigint/Decimal → number, as the former pg type parsers returned them. */
export type Plain<T> = T extends Date ? string
  : T extends bigint | Prisma.Decimal ? number
  : T extends readonly (infer U)[] ? Plain<U>[]
  : T extends object ? { [K in keyof T]: Plain<T[K]> }
  : T;

export function plain<T>(v: T): Plain<T>;
export function plain(v: unknown): unknown {
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "bigint") return Number(v);
  if (Prisma.Decimal.isDecimal(v)) return (v as Prisma.Decimal).toNumber();
  if (Array.isArray(v)) return v.map(plain);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, plain(x)]));
  return v;
}

/** A `date` column as the YYYY-MM-DD string it stores (plain() would give a midnight timestamp). */
export const day = (d: Date) => d.toISOString().slice(0, 10);

/** JSON columns hold documents the app wrote; the caller names the shape it wrote there. */
export const jsonAs = <T>(v: Prisma.JsonValue): T => v as T;

/** A document for a non-null JSON column, normalised as JSON.stringify would (undefined fields dropped). */
export const toJson = (v: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(v ?? null)) ?? {};

/** A document for a nullable JSON column; null/undefined become SQL NULL. */
export const dbJson = (v: unknown): Prisma.InputJsonValue | typeof Prisma.DbNull => (v == null ? Prisma.DbNull : (v as Prisma.InputJsonValue));

/** Unique violation from a model operation (P2002) or a raw query (SQLSTATE 23505). */
export function isUniqueViolation(err: unknown): boolean {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError)) return false;
  const meta = err.meta as { driverAdapterError?: { cause?: { originalCode?: string } } } | undefined;
  return err.code === "P2002" || meta?.driverAdapterError?.cause?.originalCode === "23505";
}

/** Transaction-scoped advisory lock on an app-level key; serialises "read max version, insert next" sequences. */
export async function advisoryLock(tx: Tx, key: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
}

/** Membership of an active user, as @nora/authz expects it. */
export async function membership(db: Db, userId: string, projectId: string): Promise<{ role: string; status: string } | null> {
  const m = await db.membership.findFirst({ where: { userId, projectId, user: { status: "active" } }, select: { role: true, project: { select: { status: true } } } });
  return m && { role: m.role, status: m.project.status };
}

export { expireContracts } from "./expire.ts";
