import { requireViewer } from "@/lib/lite/auth";
import { evaluateGoldSet, goldSet } from "@/lib/lite/assessments";
import { route } from "@/lib/lite/http";

type P = { projectId: string };

export const GET = route<P>(async ({ req, params }) => Response.json(await goldSet(await requireViewer(req), params.projectId)));

/** Runs an evaluation over the current gold set (accuracy and Brier score). */
export const POST = route<P>(async ({ req, params, correlationId }) => Response.json(await evaluateGoldSet(await requireViewer(req), params.projectId, correlationId), { status: 201 }));
