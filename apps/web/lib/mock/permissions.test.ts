import { describe, expect, it } from "vitest";
import { acceptsData, can, type UiAction } from "./permissions";
import type { Role } from "./types";

const ROLES: Role[] = ["administrator", "analis", "pemilik_proses"];
const EXPECTED: Record<UiAction, Role[]> = {
  "client.create": ["administrator"],
  "project.create": ["administrator"],
  "project.status": ["administrator"],
  "member.manage": ["administrator"],
  "member.view": ["administrator", "analis", "pemilik_proses"],
  "audit.view": ["administrator", "analis", "pemilik_proses"],
  "source.view": ["administrator", "analis", "pemilik_proses"],
  "source.create": ["administrator", "analis"],
  "snapshot.upload": ["administrator", "analis"],
  "snapshot.confirm": ["administrator", "analis"],
  "snapshot.cancel": ["administrator", "analis"],
  "mapping.view": ["administrator", "analis", "pemilik_proses"],
  "mapping.edit": ["administrator", "analis"],
  "rule.view": ["administrator", "analis", "pemilik_proses"],
  "rule.edit": ["analis"],
  "rule.confirm": ["pemilik_proses"],
  "trace.view": ["administrator", "analis", "pemilik_proses"],
  "graph.rebuild": ["administrator"],
};

describe("can", () => {
  for (const [action, allowed] of Object.entries(EXPECTED) as [UiAction, Role[]][]) {
    for (const role of ROLES) {
      it(`${role} ${allowed.includes(role) ? "may" : "may not"} ${action}`, () => {
        expect(can(role, action)).toBe(allowed.includes(role));
      });
    }
  }

  it("trace.view for every role, graph.rebuild only administrator", () => {
    expect(can("administrator", "trace.view")).toBe(true);
    expect(can("analis", "trace.view")).toBe(true);
    expect(can("pemilik_proses", "trace.view")).toBe(true);
    expect(can("administrator", "graph.rebuild")).toBe(true);
    expect(can("analis", "graph.rebuild")).toBe(false);
    expect(can("pemilik_proses", "graph.rebuild")).toBe(false);
    expect(can(null, "trace.view")).toBe(false);
  });
});

describe("acceptsData", () => {
  it("is true only for aktif", () => {
    expect(acceptsData("aktif")).toBe(true);
    for (const s of ["draft", "ditangguhkan", "berakhir", "diarsipkan"] as const) expect(acceptsData(s)).toBe(false);
  });
});
