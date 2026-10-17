"use client";

import { useParams } from "next/navigation";
import { useMock } from "@/lib/mock/store";

/** Current project for /projects/[projectId]/*, or null when it doesn't exist or the viewer isn't a member. */
export function useProject() {
  const { projectId } = useParams<{ projectId: string }>();
  const mock = useMock();
  const project = mock.state.projects.find((p) => p.id === projectId);
  const role = project ? mock.roleIn(project.id) : null;
  if (!project || !role) return null;
  const client = mock.state.clients.find((c) => c.id === project.clientId)!;
  return { project, client, role, ...mock };
}
