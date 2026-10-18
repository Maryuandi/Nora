"use client";

import { createContext, useContext, useMemo, useState } from "react";
import type { FilterSpec } from "@/lib/mock/analysis";

export type AnalysisMode = "frekuensi" | "performa";
export type AnalysisSelection = { kind: "node" | "edge" | "variant"; id: string } | null;
export type SimplifyPct = { activityPct: number; transitionPct: number };

interface AnalysisState {
  filter: FilterSpec; setFilter: (f: FilterSpec) => void; resetFilter: () => void;
  mode: AnalysisMode; setMode: (m: AnalysisMode) => void;
  selection: AnalysisSelection; setSelection: (s: AnalysisSelection) => void;
  /** undefined = the map's default for the current data. */
  activityPct?: number; transitionPct?: number; setPct: (p: SimplifyPct | undefined) => void;
}

const Ctx = createContext<AnalysisState | null>(null);

/** Filter, map mode, selection and simplify sliders shared by the Analisis sub-pages (reset when the project changes). */
export function AnalysisProvider({ children }: { children: React.ReactNode }) {
  const [filter, setFilter] = useState<FilterSpec>({});
  const [mode, setMode] = useState<AnalysisMode>("frekuensi");
  const [selection, setSelection] = useState<AnalysisSelection>(null);
  const [pct, setPct] = useState<SimplifyPct | undefined>();
  const value = useMemo<AnalysisState>(() => ({
    filter, setFilter, resetFilter: () => setFilter({}), mode, setMode, selection, setSelection,
    activityPct: pct?.activityPct, transitionPct: pct?.transitionPct, setPct,
  }), [filter, mode, selection, pct]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAnalysis(): AnalysisState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAnalysis must be used inside AnalysisProvider");
  return v;
}
