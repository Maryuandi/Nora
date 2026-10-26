import neo4j, { type Driver } from "neo4j-driver";

/**
 * Neo4j is a derived projection: every node and relation carries projectId, every repository call requires it,
 * and labels/relation types come from fixed whitelists. No caller ever passes Cypher.
 */

export const NODE_TYPES = [
  "Source", "Snapshot", "MappingVersion", "RepairRule", "DatasetVersion",
  "ContextPackage", "Document", "Rule", "BpmnTask", "BpmnModel", "Calendar", "ProcessDefinition", "ReworkDefinition",
  "Activity", "Transition", "Variant", "ObjectRef", "CaseRef",
  "Analysis", "MetricDefinition", "Finding",
  "Hypothesis", "Intervention", "Rubric",
  "EvidenceBundle", "Assessment", "Interpretation", "Candidate", "Comparison",
] as const;
export type NodeType = (typeof NODE_TYPES)[number];

export const RELATIONS = {
  DERIVED_FROM: "lineage", USES_MAPPING: "lineage", COMPUTED_WITH: "lineage", EVALUATED_AGAINST: "lineage", CITES: "lineage",
  OBSERVED_AT: "observation", SUPPORTED_BY_CASE: "observation", CO_OCCURS_WITH: "observation",
  MAY_EXPLAIN: "hypothesis", SUPPORTS: "hypothesis", CONTRADICTS: "hypothesis",
  REVIEWED: "review", SUPERSEDES: "review",
} as const;
export type Relation = keyof typeof RELATIONS;
export type RelationCategory = (typeof RELATIONS)[Relation];

export interface NodeRef { type: NodeType; id: string }
export interface GraphNode extends NodeRef { label: string; props: Record<string, unknown> }
export interface GraphEdge { type: Relation; category: RelationCategory; from: string; to: string; props: Record<string, unknown> }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const key = (projectId: string, n: NodeRef) => `${projectId}:${n.type}:${n.id}`;

function assertProject(projectId: string) {
  if (!UUID.test(projectId)) throw new Error("graph repository requires a project id");
}
function assertNode(n: NodeRef) {
  if (!(NODE_TYPES as readonly string[]).includes(n.type)) throw new Error(`unknown node type ${n.type}`);
}

let driver: Driver | undefined;
export function graphDriver(): Driver {
  driver ??= neo4j.driver(process.env.NEO4J_URI ?? "bolt://localhost:7687", neo4j.auth.basic(process.env.NEO4J_USER ?? "neo4j", process.env.NEO4J_PASSWORD ?? ""), { connectionTimeout: 5000 });
  return driver;
}

export async function ensureSchema(): Promise<void> {
  const s = graphDriver().session();
  try {
    await s.run("CREATE CONSTRAINT nora_node_key IF NOT EXISTS FOR (n:NoraNode) REQUIRE n.key IS UNIQUE");
    await s.run("CREATE INDEX nora_node_project IF NOT EXISTS FOR (n:NoraNode) ON (n.projectId)");
  } finally {
    await s.close();
  }
}

/** Primitive props only (Neo4j cannot store nested maps); objects are stored as JSON strings. */
const RESERVED = new Set(["key", "projectId", "type", "id", "label", "category"]);

function clean(props: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null) continue;
    if (RESERVED.has(k)) throw new Error(`property ${k} is reserved for the projection`);
    // Timestamps are stored as ISO strings and bigints as numbers, the way PostgreSQL rows used to arrive.
    out[k] = v instanceof Date ? v.toISOString() : typeof v === "bigint" ? Number(v)
      : typeof v === "object" && !Array.isArray(v) ? JSON.stringify(v) : Array.isArray(v) ? v.map(String) : v;
  }
  return out;
}

export interface Writer {
  node(n: NodeRef, label: string, props?: Record<string, unknown>): Promise<void>;
  rel(type: Relation, from: NodeRef, to: NodeRef, props?: Record<string, unknown>): Promise<void>;
}

/** Idempotent MERGE writes inside one transaction for one projection event. */
export async function writeProjection(projectId: string, fn: (w: Writer) => Promise<void>): Promise<void> {
  assertProject(projectId);
  const s = graphDriver().session();
  try {
    await s.executeWrite(async (tx) => {
      await fn({
        async node(n, label, props = {}) {
          assertNode(n);
          await tx.run(`MERGE (x:NoraNode {key: $key}) SET x:${n.type}, x += $props, x.projectId = $projectId, x.type = $type, x.id = $id, x.label = $label`,
            { key: key(projectId, n), props: clean(props), projectId, type: n.type, id: n.id, label });
        },
        async rel(type, from, to, props = {}) {
          assertNode(from);
          assertNode(to);
          if (!(type in RELATIONS)) throw new Error(`unknown relation ${type}`);
          // Both ends must already exist in this project; MATCH (not MERGE) keeps dangling refs out.
          await tx.run(
            `MATCH (a:NoraNode {key: $from, projectId: $projectId}), (b:NoraNode {key: $to, projectId: $projectId})
             MERGE (a)-[r:${type}]->(b) SET r += $props, r.projectId = $projectId, r.category = $category`,
            { from: key(projectId, from), to: key(projectId, to), projectId, props: clean(props), category: RELATIONS[type] },
          );
        },
      });
    });
  } finally {
    await s.close();
  }
}

/** Bounded neighborhood around one node of one project. */
export async function neighborhood(projectId: string, start: NodeRef, depth = 2, limit = 150): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }> {
  assertProject(projectId);
  assertNode(start);
  const d = Math.min(Math.max(depth, 1), 3);
  const s = graphDriver().session({ defaultAccessMode: neo4j.session.READ });
  try {
    const res = await s.run(
      `MATCH (start:NoraNode {key: $key, projectId: $projectId})
       OPTIONAL MATCH p = (start)-[*1..${d}]-(m:NoraNode {projectId: $projectId})
       WHERE all(r IN relationships(p) WHERE r.projectId = $projectId)
       WITH start, p LIMIT $limit
       RETURN start, collect(p) AS paths`,
      { key: key(projectId, start), projectId, limit: neo4j.int(limit) },
    );
    const row = res.records[0];
    if (!row) return { nodes: [], edges: [] };
    const nodes = new Map<string, GraphNode>();
    const edges = new Map<string, GraphEdge>();
    const addNode = (n: { properties: Record<string, unknown> }) => {
      const p = n.properties;
      if (p.projectId !== projectId) return;
      const { projectId: _p, key: k, type, id, label, ...props } = p as Record<string, unknown>;
      nodes.set(String(k), { type: type as NodeType, id: String(id), label: String(label), props });
    };
    addNode(row.get("start"));
    for (const path of row.get("paths") as { segments: { start: { properties: Record<string, unknown> }; end: { properties: Record<string, unknown> }; relationship: { type: string; properties: Record<string, unknown> } }[] }[]) {
      for (const seg of path.segments) {
        addNode(seg.start);
        addNode(seg.end);
        const { projectId: _p, category, ...props } = seg.relationship.properties;
        const from = String(seg.start.properties.key), to = String(seg.end.properties.key);
        edges.set(`${from}|${seg.relationship.type}|${to}`, { type: seg.relationship.type as Relation, category: category as RelationCategory, from, to, props });
      }
    }
    // Keys are internal; expose type:id references only.
    const strip = (k: string) => k.slice(projectId.length + 1);
    return {
      nodes: [...nodes.entries()].map(([, n]) => n),
      edges: [...edges.values()].map((e) => ({ ...e, from: strip(e.from), to: strip(e.to) })),
    };
  } finally {
    await s.close();
  }
}

export async function projectCounts(projectId: string): Promise<{ nodes: number; relations: number }> {
  assertProject(projectId);
  const s = graphDriver().session({ defaultAccessMode: neo4j.session.READ });
  try {
    const n = await s.run("MATCH (n:NoraNode {projectId: $projectId}) RETURN count(n) AS c", { projectId });
    const r = await s.run("MATCH (:NoraNode {projectId: $projectId})-[r]->(:NoraNode {projectId: $projectId}) RETURN count(r) AS c", { projectId });
    return { nodes: n.records[0]!.get("c").toNumber(), relations: r.records[0]!.get("c").toNumber() };
  } finally {
    await s.close();
  }
}

/** Removes the project's projection only; authoritative data in PostgreSQL/object storage is untouched. */
export async function deleteProjectGraph(projectId: string): Promise<void> {
  assertProject(projectId);
  const s = graphDriver().session();
  try {
    await s.run("MATCH (n:NoraNode {projectId: $projectId}) CALL { WITH n DETACH DELETE n } IN TRANSACTIONS OF 1000 ROWS", { projectId });
  } finally {
    await s.close();
  }
}

export async function closeGraph(): Promise<void> {
  await driver?.close();
  driver = undefined;
}
