"use client";

import { AnalysisProvider } from "@/components/project/analysis-filter";

// Non-members never get here: the project layout above already renders NotFoundPanel for them.
export default function AnalysisLayout({ children }: { children: React.ReactNode }) {
  return <AnalysisProvider>{children}</AnalysisProvider>;
}
