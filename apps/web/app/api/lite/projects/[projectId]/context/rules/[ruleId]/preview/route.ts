import { z } from "zod";
import { requireViewer } from "@/lib/lite/auth";
import { previewRule } from "@/lib/lite/context";
import { parseJson, route } from "@/lib/lite/http";

/** Evaluates the rule on up to 5,000 cases of the latest published dataset. `ruleId = draft` uses body.rule. */
export const POST = route<{ projectId: string; ruleId: string }>(async ({ req, params }) => {
  const viewer = await requireViewer(req);
  const body = await parseJson(req, z.object({ rule: z.unknown().optional() }));
  return Response.json(await previewRule(viewer, params.projectId, params.ruleId === "draft" ? null : params.ruleId, params.ruleId === "draft" ? body.rule : undefined));
});
