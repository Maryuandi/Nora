import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { exportSchemas } from "./index.js";

describe("committed JSON Schemas", () => {
  for (const [name, schema] of Object.entries(exportSchemas())) {
    it(`${name}.json is up to date`, () => {
      const file = new URL(`../schemas/${name}.json`, import.meta.url);
      expect(
        readFileSync(file, "utf8"),
        `schemas/${name}.json is stale; run pnpm contracts:export`,
      ).toBe(JSON.stringify(schema, null, 2) + "\n");
    });
  }
});
