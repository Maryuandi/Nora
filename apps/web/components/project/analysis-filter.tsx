"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { FilterSpec } from "@/lib/mock/analysis";
import type { SavedView } from "@/lib/mock/types";

export type AnalysisMode = "frekuensi" | "performa";
export type AnalysisSelection = { kind: "node" | "edge" | "variant"; id: string } | null;
export type SimplifyPct = { activityPct: number; transitionPct: number };

interface AnalysisState {
  filter: FilterSpec; setFilter: (f: FilterSpec) => void; resetFilter: () => void;
  mode: AnalysisMode; setMode: (m: AnalysisMode) => void;
  selection: AnalysisSelection; setSelection: (s: AnalysisSelection) => void;
  /** undefined = the map's default for the current data. */
  activityPct?: number; transitionPct?: number; setPct: (p: SimplifyPct | undefined) => void;
  /** Restores filter, mode, selection and sliders from a saved view. */
  load: (view: SavedView) => void;
}

const Ctx = createContext<AnalysisState | null>(null);

/** Filter, map mode, selection and simplify sliders shared by the Analisis sub-pages (reset when the project changes). */
export function AnalysisProvider({ children }: { children: React.ReactNode }) {
  const [filter, setFilter] = useState<FilterSpec>({});
  const [mode, setMode] = useState<AnalysisMode>("frekuensi");
  const [selection, setSelection] = useState<AnalysisSelection>(null);
  const [pct, setPct] = useState<SimplifyPct | undefined>();
  const load = useCallback((v: SavedView) => {
    setFilter(v.filter); setMode(v.mode); setSelection(v.selection); setPct({ activityPct: v.activityPct, transitionPct: v.transitionPct });
  }, []);
  const value = useMemo<AnalysisState>(() => ({
    filter, setFilter, resetFilter: () => setFilter({}), mode, setMode, selection, setSelection,
    activityPct: pct?.activityPct, transitionPct: pct?.transitionPct, setPct, load,
  }), [filter, mode, selection, pct]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAnalysis(): AnalysisState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAnalysis must be used inside AnalysisProvider");
  return v;
}
