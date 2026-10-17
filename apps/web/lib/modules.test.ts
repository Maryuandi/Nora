import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { MODULES } from "./modules";

const prdDir = fileURLToPath(new URL("../../../docs/prd/", import.meta.url));

describe("MODULES", () => {
  it("has 13 modules with unique sequential ids m01..m13", () => {
    expect(MODULES).toHaveLength(13);
    expect(MODULES.map((m) => m.id)).toEqual(
      Array.from({ length: 13 }, (_, i) => `m${String(i + 1).padStart(2, "0")}`),
    );
  });

  it("points every prdFile at an existing file in docs/prd/", () => {
    for (const m of MODULES) expect(existsSync(prdDir + m.prdFile), m.prdFile).toBe(true);
  });
});
