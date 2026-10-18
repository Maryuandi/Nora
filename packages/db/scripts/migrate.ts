import { migrate } from "../src/migrate.ts";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}
const applied = await migrate(url);
console.log(applied.length ? `applied: ${applied.join(", ")}` : "database is up to date");
