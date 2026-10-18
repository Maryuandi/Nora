import { checkAll } from "@/lib/health";

export const dynamic = "force-dynamic";

/** Probe for Postgres, Neo4j, object storage and Temporal; 503 when any of them is down. */
export async function GET() {
  const services = await checkAll();
  const ok = services.every((s) => s.ok);
  return Response.json({ ok, services }, { status: ok ? 200 : 503 });
}
