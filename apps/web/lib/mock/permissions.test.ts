import { describe, expect, it } from "vitest";
import { can, type UiAction } from "./permissions";
import type { Role } from "./types";

const ROLES: Role[] = ["administrator", "analis", "pemilik_proses"];
const EXPECTED: Record<UiAction, Role[]> = {
  "client.create": ["administrator"],
  "project.create": ["administrator"],
  "project.status": ["administrator"],
  "member.manage": ["administrator"],
  "member.view": ["administrator", "analis", "pemilik_proses"],
  "audit.view": ["administrator", "analis", "pemilik_proses"],
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
