import type { ContextKind } from "@nora/contracts";
import { itemRoutes } from "@/lib/lite/context-routes";

const TYPES: Record<string, ContextKind> = { hypotheses: "hypothesis", interventions: "intervention", rubrics: "rubric" };

export const { GET, POST, PATCH } = itemRoutes((p) => (TYPES[p.type!] ? [TYPES[p.type!]!] : []));
