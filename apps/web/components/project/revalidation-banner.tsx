"use client";

import Link from "next/link";
import { Banner } from "@/components/nora/banner";
import { useMock } from "@/lib/mock/store";
import { DECISION_LABEL } from "@/lib/mock/investigation";
import { flagsForProject, findingsForProject } from "@/lib/mock/reducer";

export function RevalidationBanner({ projectId }: { projectId: string }) {
  const { state } = useMock();
  const flags = flagsForProject(state, projectId);
  if (!flags.length) return null;
  const evidence = findingsForProject(state, projectId).flatMap((f) => f.evidence);
  return (
    <Banner tone="warning">
      <span className="block font-medium">Perlu ditinjau ulang</span>
      <ul className="mt-1 flex flex-col gap-2">
        {flags.map((f) => {
          const d = state.decisions.find((x) => x.id === f.decisionId);
          const link = d && state.links.find((l) => l.id === d.targetLinkId);
          const title = (link && evidence.find((e) => e.id === link.targetId)?.title) ?? link?.targetId ?? f.decisionId;
          return (
            <li key={f.id}>
              <span className="font-medium">{title}</span>
              {d && <span className="text-ink-2"> - {DECISION_LABEL[d.status]}</span>}
              <ul className="list-disc pl-5 text-ink-2">{f.summary.map((s, i) => <li key={i}>{s}</li>)}</ul>
              {d && <Link href={`/projects/${projectId}/investigations/${d.investigationId}`} className="font-medium text-accent hover:underline">Buka workspace</Link>}
            </li>
          );
        })}
      </ul>
    </Banner>
  );
}
