import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { AuthzError, roleCan, type Action } from "@nora/authz";
import { currentViewer, type Viewer } from "./auth";
import { HttpError, newCorrelationId } from "./http";
import { getProject, type ProjectRow } from "./projects";

/** Maps "not a member"/"no such object" to the 404 page; other errors propagate to the error boundary. */
export async function orNotFound<T>(p: Promise<T>): Promise<T> {
  try {
    return await p;
  } catch (err) {
    if ((err instanceof AuthzError && err.code !== "project_inactive") || (err instanceof HttpError && (err.status === 404 || err.status === 403))) notFound();
    throw err;
  }
}

export const requirePageViewer = cache(async (): Promise<Viewer> => {
  const viewer = await currentViewer();
  if (!viewer) redirect("/login");
  return viewer;
});

/** Cached per request, so layout and page share one membership check and one query. */
export const loadPageProject = cache(async (projectId: string): Promise<{ viewer: Viewer; project: ProjectRow; may: (a: Action) => boolean }> => {
  const viewer = await requirePageViewer();
  const project = await orNotFound(getProject(viewer, projectId, newCorrelationId()));
  return { viewer, project, may: (a) => roleCan(project.role, a) };
});
