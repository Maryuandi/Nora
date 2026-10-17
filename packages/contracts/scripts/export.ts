import { writeFileSync } from "node:fs";
import { exportSchemas } from "../src/index.js";

for (const [name, schema] of Object.entries(exportSchemas())) {
  writeFileSync(new URL(`../schemas/${name}.json`, import.meta.url), JSON.stringify(schema, null, 2) + "\n");
}
