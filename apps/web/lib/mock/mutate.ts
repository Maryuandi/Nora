import { MOCK_TODAY } from "./data";
import type { AuditEvent, MockState } from "./types";

// Fixed clock so the demo looks the same every time.
export const now = () => `${MOCK_TODAY}T09:30:00Z`;
let seq = 0;
export const id = (prefix: string) => `${prefix}-${Date.now().toString(36)}${(seq++).toString(36)}`;

export const withAudit = (state: MockState, e: Omit<AuditEvent, "id" | "at" | "actorId" | "result">): MockState => ({
  ...state,
  audit: [{ id: id("a"), at: now(), actorId: state.viewerId, result: "sukses", ...e }, ...state.audit],
});
