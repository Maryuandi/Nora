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
  "interpretation.view": ["administrator", "analis", "pemilik_proses"],
  "interpretation.request": ["analis"],
  "interpretation.override": ["analis"],
  "investigation.view": ["administrator", "analis", "pemilik_proses"],
  "investigation.create": ["analis"],
  "investigation.link": ["analis"],
  "investigation.status": ["analis"],
  "note.add": ["analis"],
  "note.add.field": ["analis", "pemilik_proses"],
  "comment.add": ["analis", "pemilik_proses"],
  "review.jev": ["analis"],
  "review.draft": ["analis"],
  "decision.analytic": ["analis"],
  "decision.select": ["pemilik_proses"],
  "proposal.create": ["analis", "pemilik_proses"],
  "monitoring.view": ["administrator", "analis", "pemilik_proses"],
  "monitoring.run": ["analis"],
  "monitoring.configure": ["analis"],
  "analysis.view": ["administrator", "analis", "pemilik_proses"],
  "quality.view": ["administrator", "analis", "pemilik_proses"],
  "repair.edit": ["administrator", "analis"],
  "dataset.publish": ["analis"],
  "view.save": ["administrator", "analis"],
};

describe("can", () => {
  for (const [action, allowed] of Object.entries(EXPECTED) as [UiAction, Role[]][]) {
    for (const role of ROLES) {
      it(`${role} ${allowed.includes(role) ? "may" : "may not"} ${action}`, () => {
        expect(can(role, action)).toBe(allowed.includes(role));
      });
    }
  }
});

describe("can with null role", () => {
  for (const action of Object.keys(EXPECTED) as UiAction[]) {
    it(`denies ${action}`, () => expect(can(null, action)).toBe(false));
  }
});

describe("acceptsData", () => {
  it("is true only for aktif", () => {
    expect(acceptsData("aktif")).toBe(true);
    for (const s of ["draft", "ditangguhkan", "berakhir", "diarsipkan"] as const) expect(acceptsData(s)).toBe(false);
  });
});
