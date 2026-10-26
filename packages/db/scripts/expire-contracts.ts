import { randomUUID } from "node:crypto";
import { createPrisma } from "../src/index.ts";
import { expireContracts } from "../src/expire.ts";

const db = createPrisma();
try {
  const ended = await expireContracts(db, `cron-${randomUUID()}`);
  console.log(`${ended.length} project(s) moved to ended`);
} finally {
  await db.$disconnect();
}
