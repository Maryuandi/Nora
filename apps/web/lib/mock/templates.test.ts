import { describe, expect, it } from "vitest";
import { TARGET_KIND_LABEL } from "./interpretation";
import { PROMPT_TEMPLATES } from "./templates";

describe("PROMPT_TEMPLATES", () => {
  it("memuat tepat 10 kombinasi jenis x audiens yang unik dan lengkap", () => {
    expect(PROMPT_TEMPLATES).toHaveLength(10);
    expect(new Set(PROMPT_TEMPLATES.map((t) => `${t.kind}:${t.audience}`)).size).toBe(10);
    expect(new Set(PROMPT_TEMPLATES.map((t) => t.kind))).toEqual(new Set(Object.keys(TARGET_KIND_LABEL)));
    expect(new Set(PROMPT_TEMPLATES.map((t) => t.audience))).toEqual(new Set(["analis", "pemilik_proses"]));
  });
  it("tiap templat punya versi, peran, dan minimal empat aturan tidak kosong", () => {
    for (const t of PROMPT_TEMPLATES) {
      expect(t.version).toBe("tiruan-1");
      expect(t.role.trim()).not.toBe("");
      expect(t.rules.length).toBeGreaterThanOrEqual(4);
      for (const r of t.rules) expect(r.trim()).not.toBe("");
      expect(new Set(t.rules).size).toBe(t.rules.length);
    }
  });
  it("peran berbeda antar audiens dan antar jenis", () => {
    expect(new Set(PROMPT_TEMPLATES.map((t) => t.role)).size).toBe(10);
  });
});
