"use client";

import { useParams } from "next/navigation";
import { AnalysisProvider } from "@/components/project/analysis-filter";

// Non-members never get here: the project layout above already renders NotFoundPanel for them.
// key={projectId}: filter, mode, selection and sliders never leak from one project to another.
export default function AnalysisLayout({ children }: { children: React.ReactNode }) {
  const { projectId } = useParams<{ projectId: string }>();
  return <AnalysisProvider key={projectId}>{children}</AnalysisProvider>;
}
