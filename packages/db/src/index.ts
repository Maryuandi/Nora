import pg from "pg";

export type Queryable = Pick<pg.Pool | pg.PoolClient, "query">;
export type Tx = pg.PoolClient;

// timestamptz/date come back as strings so API JSON and Temporal payloads are stable.
pg.types.setTypeParser(1184, (v) => new Date(v).toISOString());
pg.types.setTypeParser(1082, (v) => v);
// bigint counts (COUNT(*), bigserial) fit comfortably in a JS number for this domain.
pg.types.setTypeParser(20, (v) => Number(v));
pg.types.setTypeParser(1700, (v) => Number(v));

export function createPool(connectionString = process.env.DATABASE_URL): pg.Pool {
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  const pool = new pg.Pool({ connectionString, max: 10 });
  pool.on("error", () => {}); // an idle client dropping must not crash the process
  return pool;
}

/** Runs fn in one transaction: an audit write that fails rolls the mutation back with it. */
export async function withTx<T>(pool: pg.Pool, fn: (tx: Tx) => Promise<T>): Promise<T> {
  const tx = await pool.connect();
  try {
    await tx.query("BEGIN");
    const result = await fn(tx);
    await tx.query("COMMIT");
    return result;
  } catch (err) {
    await tx.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    tx.release();
  }
}

export { expireContracts } from "./expire.ts";
