import { z } from "zod";
import { requireViewer } from "@/lib/lite/auth";
import { createDocument, listDocuments } from "@/lib/lite/context";
import { parseJson, route } from "@/lib/lite/http";

type P = { projectId: string };

export const GET = route<P>(async ({ req, params }) => Response.json({ documents: await listDocuments(await requireViewer(req), params.projectId) }));

/** Stores a reference and a prepared excerpt only; full confidential documents are never sent to models. */
export const POST = route<P>(async ({ req, params, correlationId }) => {
  const viewer = await requireViewer(req);
  const input = await parseJson(req, z.object({
    title: z.string().trim().min(1, "Judul wajib diisi").max(200),
    reference: z.string().trim().max(200).default(""),
    version: z.string().trim().max(40).default("1"),
    excerpt: z.string().trim().max(4000).default(""),
  }));
  return Response.json(await createDocument(viewer, params.projectId, input, correlationId), { status: 201 });
});
