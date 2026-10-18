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
  "trace.view": ["administrator", "analis", "pemilik_proses"],
  "graph.rebuild": ["administrator"],
  "assessment.view": ["administrator", "analis", "pemilik_proses"],
  "assessment.run": ["analis"],
  "assessment.correct": ["analis"],
  "classify.view": ["administrator", "analis", "pemilik_proses"],
  "classify.run": ["analis"],
  "classify.correct": ["analis"],
  "gold.view": ["administrator", "analis", "pemilik_proses"],
  "gold.edit": ["analis"],
  "evaluation.view": ["administrator", "analis", "pemilik_proses"],
  "evaluation.run": ["analis"],
  "spec.view": ["administrator", "analis", "pemilik_proses"],
  "spec.edit": ["analis"],
  "rec.view": ["administrator", "analis", "pemilik_proses"],
  "rec.edit": ["analis"],
  "doc.view": ["administrator", "analis", "pemilik_proses"],
  "doc.upload": ["administrator", "analis"],
  "calendar.edit": ["administrator", "analis"],
  "config.view": ["administrator", "analis", "pemilik_proses"],
  "config.edit": ["analis"],
  "config.confirm": ["pemilik_proses"],
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

describe("can with null role", () => {
  for (const action of Object.keys(EXPECTED) as UiAction[]) {
    it(`denies ${action}`, () => expect(can(null, action)).toBe(false));
  }
});

describe("assessment.view", () => {
  it("is denied without a role", () => expect(can(null, "assessment.view")).toBe(false));
});

describe("acceptsData", () => {
  it("is true only for aktif", () => {
    expect(acceptsData("aktif")).toBe(true);
    for (const s of ["draft", "ditangguhkan", "berakhir", "diarsipkan"] as const) expect(acceptsData(s)).toBe(false);
  });
});
