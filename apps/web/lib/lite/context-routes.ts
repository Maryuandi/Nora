import "server-only";
import { z } from "zod";
import { CONTEXT_KINDS, type ContextKind } from "@nora/contracts";
import { requireViewer } from "./auth";
import { listItems, saveItem, transitionItem } from "./context";
import { db } from "./db";
import { badRequest, parseJson, route } from "./http";
import { can } from "./projects";

const SaveBody = z.object({
  kind: z.enum(CONTEXT_KINDS).optional(),
  key: z.string().max(80).nullish(),
  payload: z.unknown(),
  sourceDocumentId: z.uuid().nullish(),
  sourceReference: z.string().max(300).default(""),
});
const StatusBody = z.object({ id: z.uuid(), to: z.enum(["reviewed", "approved", "obsolete"]) });

type P = { projectId: string };

/** GET/POST/PATCH handlers for a set of context kinds (definitions, rules, catalog types). */
export function itemRoutes(kinds: readonly ContextKind[] | ((params: Record<string, string>) => readonly ContextKind[])) {
  const resolve = (params: Record<string, string>) => {
    const ks = typeof kinds === "function" ? kinds(params) : kinds;
    if (!ks.length) throw badRequest("Jenis konfigurasi tidak dikenal");
    return ks;
  };
  return {
    GET: route<P & Record<string, string>>(async ({ req, params }) => {
      const viewer = await requireViewer(req);
      await can(viewer, "project.read", params.projectId);
      const ks = resolve(params);
      const all = await Promise.all(ks.map((k) => listItems(db(), params.projectId, k)));
      return Response.json({ items: all.flat() });
    }),
    POST: route<P & Record<string, string>>(async ({ req, params, correlationId }) => {
      const viewer = await requireViewer(req);
      const ks = resolve(params);
      const body = await parseJson(req, SaveBody);
      const kind = body.kind ?? (ks.length === 1 ? ks[0]! : undefined);
      if (!kind || !ks.includes(kind)) throw badRequest("kind wajib diisi dan harus sesuai endpoint");
      return Response.json(await saveItem(viewer, params.projectId, kind, body, correlationId), { status: 201 });
    }),
    PATCH: route<P & Record<string, string>>(async ({ req, params, correlationId }) => {
      const viewer = await requireViewer(req);
      const ks = resolve(params);
      const body = await parseJson(req, StatusBody.extend({ kind: z.enum(CONTEXT_KINDS).optional() }));
      const kind = body.kind ?? (ks.length === 1 ? ks[0]! : undefined);
      if (!kind || !ks.includes(kind)) throw badRequest("kind wajib diisi dan harus sesuai endpoint");
      return Response.json(await transitionItem(viewer, params.projectId, kind, body.id, body.to, correlationId));
    }),
  };
}
