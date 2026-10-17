"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { can as canRole, type UiAction } from "./permissions";
import { initialState, reduce, viewerRole, type MockAction } from "./reducer";
import type { MockState, Role, User } from "./types";

interface MockContext {
  state: MockState;
  /** Applies an action; returns an error message when the mock rules reject it. */
  dispatch: (action: MockAction) => string | undefined;
  viewer: User;
  /** Role of the viewer in a project, or their preview role when no project is given. */
  roleIn: (projectId?: string) => Role | null;
  can: (action: UiAction, projectId?: string) => boolean;
}

const Ctx = createContext<MockContext | null>(null);

// Preview persona -> role used for org-level actions (create client/project).
const PERSONA_ROLE: Record<NonNullable<User["persona"]>, Role> = { rina: "administrator", dimas: "analis", sari: "pemilik_proses" };

export function MockStoreProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<MockState>(initialState);
  const ref = useRef(state);
  ref.current = state;

  const dispatch = useCallback((action: MockAction) => {
    const { state: next, error } = reduce(ref.current, action);
    ref.current = next;
    setState(next);
    return error;
  }, []);

  const value = useMemo<MockContext>(() => {
    const viewer = state.users.find((u) => u.id === state.viewerId)!;
    const roleIn = (projectId?: string) =>
      projectId ? viewerRole(state, projectId) : viewer.persona ? PERSONA_ROLE[viewer.persona] : null;
    return { state, dispatch, viewer, roleIn, can: (action, projectId) => canRole(roleIn(projectId), action) };
  }, [state, dispatch]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useMock(): MockContext {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useMock must be used inside MockStoreProvider");
  return ctx;
}
