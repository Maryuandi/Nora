import { randomUUID } from "node:crypto";
import { createPool } from "../src/index.ts";
import { expireContracts } from "../src/expire.ts";

const pool = createPool();
try {
  const ended = await expireContracts(pool, `cron-${randomUUID()}`);
  console.log(`${ended.length} project(s) moved to ended`);
} finally {
  await pool.end();
}
