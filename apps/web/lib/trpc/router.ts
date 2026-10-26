import "server-only";
import { CONTEXT_KINDS, MappingConfig } from "@nora/contracts";
import { z } from "zod";
import { getMap, getRun, CASE_SORTS, listCases, listRuns, listVariants, requestAnalysis, caseTimeline } from "@/lib/lite/analysis";
import { correctAssessment, createSpec, evaluateGoldSet, findingAssessments, getAssessment, goldSet, listSpecs, requestAssessmentRun } from "@/lib/lite/assessments";
import { activate, clearSessionCookie, login, revokeSession, sessionCookie, setupAdmin } from "@/lib/lite/auth";
import {
  approveBpmn, contextSummary, createDocument, freezeAndActivate, getBpmnXml, importCatalog, listBpmn, listDocuments, listItems, listPackages, previewRule,
  saveBpmnMapping, saveItem, transitionItem, uploadBpmn,
} from "@/lib/lite/context";
import { getDashboard, getSettings, listBottlenecks, listRunFindings, saveSettings } from "@/lib/lite/dashboard";
import {
  completeUpload, createMapping, createSource, createUpload, getDataset, getSnapshot, listDatasets, listMappings, listSources, prepareDataset, previewMapping,
  publishDataset, reviewSnapshot,
} from "@/lib/lite/data";
import { db } from "@/lib/lite/db";
import { getFinding, listFindingCases, listFindings } from "@/lib/lite/findings";
import { getBundle, graphNeighborhood, graphStatus, graphStatusFor, listBundles, requestRebuild } from "@/lib/lite/graph";
import { badRequest } from "@/lib/lite/http";
import {
  acceptInterpretation, createPromptTemplate, flagInterpretation, getInterpretation, listInterpretations, listPromptTemplates, regenerateInterpretation, requestInterpretation,
} from "@/lib/lite/interpretations";
import { findingLineage } from "@/lib/lite/lineage";
import {
  addMember, can, changeStatus, createClient, createProject, getProject, listAudit, listClients, listMembers, listProjects, removeMember, updateProject,
} from "@/lib/lite/projects";
import { loadReadiness } from "@/lib/lite/readiness";
import { addAnalystCandidate, compareCandidates, findingRecommendations, getCandidate, getPolicy, refreshRecommendations, savePolicy } from "@/lib/lite/recommendations";
import { ActivateInput, ClientInput, LoginInput, MemberInput, ProjectInput, ProjectPatch, SetupInput, StatusInput } from "@/lib/lite/schemas";
import { projectProcedure, protectedProcedure, publicProcedure, router } from "./init";

const uuidLike = /^[0-9a-f-]{36}$/i;
const runInput = z.object({ runId: z.string() });
const findingInput = z.object({ findingId: z.string() });
const interpretationInput = z.object({ interpretationId: z.string() });
const list = (s: string | undefined) => s?.split(",").filter(Boolean);

const auth = router({
  /** Creates the first administrator; refused once any account exists. */
  setup: publicProcedure.input(SetupInput).mutation(async ({ ctx, input }) => {
    const s = await setupAdmin(input, ctx.correlationId);
    ctx.resHeaders.append("set-cookie", sessionCookie(s.token, s.expiresAt));
    return { ok: true };
  }),
  login: publicProcedure.input(LoginInput).mutation(async ({ ctx, input }) => {
    const s = await login(input);
    ctx.resHeaders.append("set-cookie", sessionCookie(s.token, s.expiresAt));
    return { ok: true };
  }),
  logout: publicProcedure.mutation(async ({ ctx }) => {
    await revokeSession(ctx.req);
    ctx.resHeaders.append("set-cookie", clearSessionCookie());
    return { ok: true };
  }),
  activate: publicProcedure.input(ActivateInput).mutation(async ({ ctx, input }) => {
    const s = await activate(input, ctx.correlationId);
    ctx.resHeaders.append("set-cookie", sessionCookie(s.token, s.expiresAt));
    return { ok: true };
  }),
});

const clients = router({
  list: protectedProcedure.query(async ({ ctx }) => ({ clients: await listClients(ctx.viewer) })),
  create: protectedProcedure.input(ClientInput).mutation(({ ctx, input }) => createClient(ctx.viewer, input, ctx.correlationId)),
});

const projects = router({
  list: protectedProcedure.query(async ({ ctx }) => ({ projects: await listProjects(ctx.viewer, ctx.correlationId) })),
  create: protectedProcedure.input(ProjectInput).mutation(({ ctx, input }) => createProject(ctx.viewer, input, ctx.correlationId)),
  get: projectProcedure.query(({ ctx, input }) => getProject(ctx.viewer, input.projectId, ctx.correlationId)),
  update: projectProcedure.input(ProjectPatch).mutation(({ ctx, input: { projectId, ...patch } }) => updateProject(ctx.viewer, projectId, patch, ctx.correlationId)),
  setStatus: projectProcedure.input(StatusInput).mutation(({ ctx, input: { projectId, ...status } }) => changeStatus(ctx.viewer, projectId, status, ctx.correlationId)),
  readiness: projectProcedure.query(({ ctx, input }) => loadReadiness(ctx.viewer, input.projectId)),
  audit: projectProcedure.input(z.object({ before: z.number().int().positive().optional() })).query(async ({ ctx, input }) => ({
    events: await listAudit(ctx.viewer, input.projectId, { before: input.before }),
  })),
});

const members = router({
  list: projectProcedure.query(async ({ ctx, input }) => ({ members: await listMembers(ctx.viewer, input.projectId) })),
  add: projectProcedure.input(MemberInput).mutation(async ({ ctx, input: { projectId, ...member } }) => {
    const res = await addMember(ctx.viewer, projectId, member, ctx.correlationId);
    const activationUrl = res.activationToken ? `${new URL(ctx.req.url).origin}/lite/activate?token=${res.activationToken}` : null;
    return { userId: res.userId, activationUrl };
  }),
  remove: projectProcedure.input(z.object({ userId: z.string().min(1, "userId wajib diisi") })).mutation(async ({ ctx, input }) => {
    await removeMember(ctx.viewer, input.projectId, input.userId, ctx.correlationId);
    return { ok: true };
  }),
});

const sources = router({
  list: projectProcedure.query(async ({ ctx, input }) => ({ sources: await listSources(ctx.viewer, input.projectId) })),
  create: projectProcedure.input(z.object({ name: z.string().trim().min(1, "Nama sumber wajib diisi").max(160) }))
    .mutation(({ ctx, input }) => createSource(ctx.viewer, input.projectId, input.name, ctx.correlationId)),
  /** Returns a 15-minute signed PUT; the browser sends the file straight to object storage, never through Next.js. */
  createUpload: projectProcedure.input(z.object({ sourceId: z.string(), fileName: z.string().trim().min(1).max(260), size: z.number().int().positive() }))
    .mutation(({ ctx, input }) => createUpload(ctx.viewer, input.projectId, input.sourceId, input.fileName, input.size, ctx.correlationId)),
});

const snapshotInput = z.object({ snapshotId: z.string() });
const snapshots = router({
  get: projectProcedure.input(snapshotInput).query(({ ctx, input }) => getSnapshot(ctx.viewer, input.projectId, input.snapshotId)),
  complete: projectProcedure.input(snapshotInput).mutation(async ({ ctx, input }) => {
    const res = await completeUpload(ctx.viewer, input.projectId, input.snapshotId, ctx.correlationId);
    return { snapshotId: res.snapshotId, status: "validating" };
  }),
  review: projectProcedure.input(snapshotInput.extend({ action: z.enum(["approve", "cancel"]) }))
    .mutation(({ ctx, input }) => reviewSnapshot(ctx.viewer, input.projectId, input.snapshotId, input.action, ctx.correlationId)),
});

const mappings = router({
  list: projectProcedure.input(z.object({ sourceId: z.string().optional() })).query(async ({ ctx, input }) => ({
    mappings: await listMappings(ctx.viewer, input.projectId, input.sourceId),
  })),
  create: projectProcedure.input(z.object({ sourceId: z.uuid(), config: MappingConfig, note: z.string().max(500).default("") }))
    .mutation(({ ctx, input }) => createMapping(ctx.viewer, input.projectId, input.sourceId, input.config, input.note, ctx.correlationId)),
  /** Preview of 50 mapped events. `mappingId = draft` previews an unsaved config. */
  preview: projectProcedure.input(z.object({ mappingId: z.string(), snapshotId: z.uuid(), config: MappingConfig.optional() })).mutation(({ ctx, input }) => {
    if (input.mappingId === "draft" && !input.config) throw badRequest("config wajib untuk pratinjau draft");
    return previewMapping(ctx.viewer, input.projectId, input.mappingId, input.snapshotId, input.mappingId === "draft" ? input.config : undefined);
  }),
});

const datasetInput = z.object({ datasetId: z.string() });
const datasets = router({
  list: projectProcedure.query(async ({ ctx, input }) => ({ datasets: await listDatasets(ctx.viewer, input.projectId) })),
  prepare: projectProcedure.input(z.object({ snapshotId: z.uuid(), mappingVersionId: z.uuid() }))
    .mutation(({ ctx, input }) => prepareDataset(ctx.viewer, input.projectId, input.snapshotId, input.mappingVersionId, ctx.correlationId)),
  get: projectProcedure.input(datasetInput).query(({ ctx, input }) => getDataset(ctx.viewer, input.projectId, input.datasetId)),
  publish: projectProcedure.input(datasetInput).mutation(({ ctx, input }) => publishDataset(ctx.viewer, input.projectId, input.datasetId, ctx.correlationId)),
  /** One case only: its events with raw/canonical label, time, resource, attributes, quality flags and source row. */
  caseTimeline: projectProcedure.input(datasetInput.extend({ caseUid: z.string() }))
    .query(({ ctx, input }) => caseTimeline(ctx.viewer, input.projectId, input.datasetId, input.caseUid)),
});

const modelInput = z.object({ modelId: z.string() });
const context = router({
  summary: projectProcedure.query(({ ctx, input }) => contextSummary(ctx.viewer, input.projectId)),
  items: projectProcedure.input(z.object({ kinds: z.array(z.enum(CONTEXT_KINDS)).min(1) })).query(async ({ ctx, input }) => {
    await can(ctx.viewer, "project.read", input.projectId);
    const all = await Promise.all(input.kinds.map((k) => listItems(db(), input.projectId, k)));
    return { items: all.flat() };
  }),
  save: projectProcedure.input(z.object({
    kind: z.enum(CONTEXT_KINDS), key: z.string().max(80).nullish(), payload: z.unknown(), sourceDocumentId: z.uuid().nullish(), sourceReference: z.string().max(300).default(""),
  })).mutation(({ ctx, input: { projectId, kind, ...item } }) => saveItem(ctx.viewer, projectId, kind, item, ctx.correlationId)),
  transition: projectProcedure.input(z.object({ kind: z.enum(CONTEXT_KINDS), id: z.string(), to: z.enum(["reviewed", "approved", "obsolete"]) }))
    .mutation(({ ctx, input }) => transitionItem(ctx.viewer, input.projectId, input.kind, input.id, input.to, ctx.correlationId)),
  documents: projectProcedure.query(async ({ ctx, input }) => ({ documents: await listDocuments(ctx.viewer, input.projectId) })),
  /** Stores a reference and a prepared excerpt only; full confidential documents are never sent to models. */
  createDocument: projectProcedure.input(z.object({
    title: z.string().trim().min(1, "Judul wajib diisi").max(200),
    reference: z.string().trim().max(200).default(""),
    version: z.string().trim().max(40).default("1"),
    excerpt: z.string().trim().max(4000).default(""),
  })).mutation(({ ctx, input: { projectId, ...doc } }) => createDocument(ctx.viewer, projectId, doc, ctx.correlationId)),
  bpmnModels: projectProcedure.query(async ({ ctx, input }) => ({ models: await listBpmn(ctx.viewer, input.projectId) })),
  uploadBpmn: projectProcedure.input(z.object({ name: z.string().trim().min(1).max(160), fileName: z.string().trim().min(1).max(260), xml: z.string().min(20) }))
    .mutation(({ ctx, input: { projectId, ...file } }) => uploadBpmn(ctx.viewer, projectId, file, ctx.correlationId)),
  /** Raw BPMN XML for the read-only viewer, as text (never rendered as HTML). */
  bpmnXml: projectProcedure.input(modelInput).query(({ ctx, input }) => getBpmnXml(ctx.viewer, input.projectId, input.modelId)),
  approveBpmn: projectProcedure.input(modelInput).mutation(({ ctx, input }) => approveBpmn(ctx.viewer, input.projectId, input.modelId, ctx.correlationId)),
  saveBpmnMapping: projectProcedure.input(modelInput.extend({ mapping: z.record(z.string(), z.array(z.string().max(200)).max(20)) }))
    .mutation(({ ctx, input }) => saveBpmnMapping(ctx.viewer, input.projectId, input.modelId, input.mapping, ctx.correlationId)),
  packages: projectProcedure.query(async ({ ctx, input }) => ({ packages: await listPackages(ctx.viewer, input.projectId) })),
  /** Freezes the approved configuration into an immutable package and activates it. */
  activatePackage: projectProcedure.mutation(({ ctx, input }) => freezeAndActivate(ctx.viewer, input.projectId, ctx.correlationId)),
  /** Evaluates the rule on up to 5,000 cases of the latest published dataset. `ruleId = draft` uses `rule`. */
  previewRule: projectProcedure.input(z.object({ ruleId: z.string(), rule: z.unknown().optional() })).mutation(({ ctx, input }) =>
    previewRule(ctx.viewer, input.projectId, input.ruleId === "draft" ? null : input.ruleId, input.ruleId === "draft" ? input.rule : undefined)),
  /** Imports a user-supplied reference catalog (JSON). Imported items start as drafts for review. */
  importCatalog: projectProcedure.input(z.object({ catalog: z.unknown() })).mutation(({ ctx, input }) => importCatalog(ctx.viewer, input.projectId, input.catalog, ctx.correlationId)),
});

const analyses = router({
  list: projectProcedure.query(async ({ ctx, input }) => ({ runs: await listRuns(ctx.viewer, input.projectId) })),
  /** A run with the same analysis key is reused (`reused: true`). */
  request: projectProcedure.input(z.object({ filterSpec: z.unknown().optional(), datasetVersionId: z.uuid().optional(), contextPackageId: z.uuid().optional() }))
    .mutation(({ ctx, input: { projectId, ...req } }) => requestAnalysis(ctx.viewer, projectId, req, ctx.correlationId)),
  get: projectProcedure.input(runInput).query(({ ctx, input }) => getRun(ctx.viewer, input.projectId, input.runId)),
  map: projectProcedure.input(runInput).query(({ ctx, input }) => getMap(ctx.viewer, input.projectId, input.runId)),
  variants: projectProcedure.input(runInput).query(async ({ ctx, input }) => ({ variants: await listVariants(ctx.viewer, input.projectId, input.runId) })),
  /** node=A or from=A&to=B (with __start/__end markers); size ≤ 100. */
  cases: projectProcedure.input(runInput.extend({
    node: z.string().nullish(), from: z.string().nullish(), to: z.string().nullish(), sort: z.string().nullish(), dir: z.string().nullish(),
    page: z.number().int().nullish(), size: z.number().int().nullish(),
  })).query(({ ctx, input }) => listCases(ctx.viewer, input.projectId, input.runId, {
    node: input.node, from: input.from, to: input.to, sort: input.sort && input.sort in CASE_SORTS ? (input.sort as keyof typeof CASE_SORTS) : undefined,
    dir: input.dir === "asc" ? "asc" : "desc", page: input.page || 1, size: input.size || 25,
  })),
  /** Transitions ranked by total wait contribution, with the bottleneck flag from the run's thresholds. */
  bottlenecks: projectProcedure.input(runInput).query(async ({ ctx, input }) => ({ transitions: await listBottlenecks(ctx.viewer, input.projectId, input.runId) })),
  dashboard: projectProcedure.input(runInput).query(({ ctx, input }) => getDashboard(ctx.viewer, input.projectId, input.runId)),
  /** BPMN token-replay result and rule evaluations for the run. */
  conformance: projectProcedure.input(runInput).query(async ({ ctx, input }) => {
    const d = await getDashboard(ctx.viewer, input.projectId, input.runId);
    return { bpmn: d.conformance, rules: d.rules };
  }),
  rework: projectProcedure.input(runInput).query(async ({ ctx, input }) => {
    const d = await getDashboard(ctx.viewer, input.projectId, input.runId);
    return { rework: d.rework, metrics: { share: d.metrics.rework_case_share ?? null, repetitions: d.metrics.rework_repetitions ?? null } };
  }),
  findings: projectProcedure.input(runInput).query(async ({ ctx, input }) => ({ findings: await listRunFindings(ctx.viewer, input.projectId, input.runId) })),
  settings: projectProcedure.query(({ ctx, input }) => getSettings(ctx.viewer, input.projectId)),
  saveSettings: projectProcedure.input(z.object({ config: z.unknown() })).mutation(({ ctx, input }) => saveSettings(ctx.viewer, input.projectId, input.config, ctx.correlationId)),
});

const findings = router({
  /** Default types: bottleneck and rework; sort = severity|contribution|cases|newest. */
  list: projectProcedure.input(z.object({ runId: z.string().nullish(), types: z.string().optional(), sort: z.string().optional() }))
    .query(({ ctx, input }) => listFindings(ctx.viewer, input.projectId, { runId: input.runId, types: list(input.types), sort: input.sort })),
  get: projectProcedure.input(findingInput).query(({ ctx, input }) => getFinding(ctx.viewer, input.projectId, input.findingId)),
  /** sort = support|duration|events|start|additional (rework); size ≤ 100. */
  cases: projectProcedure.input(findingInput.extend({ sort: z.string().optional(), dir: z.string().optional(), page: z.number().int().optional(), size: z.number().int().optional(), search: z.string().max(200).optional() }))
    .query(({ ctx, input }) => listFindingCases(ctx.viewer, input.projectId, input.findingId, { sort: input.sort, dir: input.dir, page: input.page || 1, size: input.size || 25, search: input.search })),
  /** Tree from authoritative records plus the projection status, so the UI can flag a lagging graph. */
  lineage: projectProcedure.input(findingInput).query(async ({ ctx, input }) => {
    const tree = await findingLineage(ctx.viewer, input.projectId, input.findingId);
    const g = await graphStatus(input.projectId);
    return { tree, source: "postgresql", graph: { stale: g.stale, pending: g.pending, lagSeconds: g.lagSeconds, projectedSequence: g.projectedSequence } };
  }),
  assessments: projectProcedure.input(findingInput).query(({ ctx, input }) => findingAssessments(ctx.viewer, input.projectId, input.findingId)),
});

const assessments = router({
  /** Manual trigger; the worker runs preconditions, evidence bundle and Jev calls in the background. */
  requestRun: projectProcedure.input(findingInput).mutation(({ ctx, input }) => requestAssessmentRun(ctx.viewer, input.projectId, input.findingId, ctx.correlationId)),
  /** Detail with criteria, bundle link and raw-response metadata (keys only; provider secrets never leave the worker). */
  get: projectProcedure.input(z.object({ assessmentId: z.string() })).query(({ ctx, input }) => getAssessment(ctx.viewer, input.projectId, input.assessmentId)),
  correct: projectProcedure.input(z.object({
    assessmentId: z.string(), kind: z.enum(["confirm", "correct"]), conclusion: z.string().nullish(), reason: z.string().max(1000), goldCandidate: z.boolean().default(false),
  })).mutation(({ ctx, input: { projectId, assessmentId, ...correction } }) => correctAssessment(ctx.viewer, projectId, assessmentId, correction, ctx.correlationId)),
  specs: projectProcedure.query(async ({ ctx, input }) => ({ specs: await listSpecs(ctx.viewer, input.projectId) })),
  createSpec: projectProcedure.input(z.object({ spec: z.unknown() })).mutation(({ ctx, input }) => createSpec(ctx.viewer, input.projectId, input.spec, ctx.correlationId)),
  goldSet: projectProcedure.query(({ ctx, input }) => goldSet(ctx.viewer, input.projectId)),
  /** Runs an evaluation over the current gold set (accuracy and Brier score). */
  evaluateGoldSet: projectProcedure.mutation(({ ctx, input }) => evaluateGoldSet(ctx.viewer, input.projectId, ctx.correlationId)),
});

const recommendations = router({
  forFinding: projectProcedure.input(findingInput.extend({ statuses: z.string().optional() }))
    .query(({ ctx, input }) => findingRecommendations(ctx.viewer, input.projectId, input.findingId, list(input.statuses))),
  refresh: projectProcedure.input(findingInput).mutation(({ ctx, input }) => refreshRecommendations(ctx.viewer, input.projectId, input.findingId, ctx.correlationId)),
  /** Returns (and stores once) an immutable comparison snapshot of 2–4 candidates. */
  compare: projectProcedure.input(findingInput.extend({ ids: z.array(z.string()).max(10) }))
    .mutation(({ ctx, input }) => compareCandidates(ctx.viewer, input.projectId, input.findingId, input.ids, ctx.correlationId)),
  candidate: projectProcedure.input(z.object({ linkId: z.string() })).query(({ ctx, input }) => getCandidate(ctx.viewer, input.projectId, input.linkId)),
  /** Analyst addition; it is checked and assessed on the next refresh like any catalog candidate. */
  addCandidate: projectProcedure.input(z.object({ candidate: z.unknown() })).mutation(({ ctx, input }) => addAnalystCandidate(ctx.viewer, input.projectId, input.candidate, ctx.correlationId)),
  policy: projectProcedure.query(({ ctx, input }) => getPolicy(ctx.viewer, input.projectId)),
  savePolicy: projectProcedure.input(z.object({ weights: z.unknown() })).mutation(({ ctx, input }) => savePolicy(ctx.viewer, input.projectId, input.weights, ctx.correlationId)),
});

const graph = router({
  status: projectProcedure.query(({ ctx, input }) => graphStatusFor(ctx.viewer, input.projectId)),
  rebuild: projectProcedure.mutation(({ ctx, input }) => requestRebuild(ctx.viewer, input.projectId, ctx.correlationId)),
  /** Bounded and project-scoped; no query language is accepted. */
  neighborhood: projectProcedure.input(z.object({ type: z.string(), id: z.string(), depth: z.number().int().optional() }))
    .query(({ ctx, input }) => graphNeighborhood(ctx.viewer, input.projectId, input.type, input.id, input.depth || 2, ctx.correlationId)),
  /** Read-only; bundles are created by the worker's internal retrieval service only. */
  bundles: projectProcedure.input(z.object({ targetId: z.string() })).query(async ({ ctx, input }) => {
    if (!uuidLike.test(input.targetId)) throw badRequest("targetId wajib diisi");
    return { bundles: await listBundles(ctx.viewer, input.projectId, input.targetId) };
  }),
  bundle: projectProcedure.input(z.object({ bundleId: z.string() })).query(({ ctx, input }) => getBundle(ctx.viewer, input.projectId, input.bundleId, ctx.correlationId)),
});

const interpretations = router({
  /** History for one target (finding, assessment, or comparison snapshot), with the project's LLM usage. */
  list: projectProcedure.input(z.object({ targetId: z.string() })).query(({ ctx, input }) => listInterpretations(ctx.viewer, input.projectId, input.targetId)),
  get: projectProcedure.input(interpretationInput).query(({ ctx, input }) => getInterpretation(ctx.viewer, input.projectId, input.interpretationId)),
  /** Queues a draft; generation and checks run on the Temporal worker. */
  request: projectProcedure.input(z.object({ request: z.unknown() })).mutation(({ ctx, input }) => requestInterpretation(ctx.viewer, input.projectId, input.request, ctx.correlationId)),
  regenerate: projectProcedure.input(interpretationInput).mutation(({ ctx, input }) => regenerateInterpretation(ctx.viewer, input.projectId, input.interpretationId, ctx.correlationId)),
  accept: projectProcedure.input(interpretationInput.extend({ note: z.string().max(1000).nullish() }))
    .mutation(({ ctx, input }) => acceptInterpretation(ctx.viewer, input.projectId, input.interpretationId, input.note?.trim() || null, ctx.correlationId)),
  flag: projectProcedure.input(interpretationInput.extend({ reason: z.string().trim().min(3, "Jelaskan masalahnya").max(1000) }))
    .mutation(({ ctx, input }) => flagInterpretation(ctx.viewer, input.projectId, input.interpretationId, input.reason, ctx.correlationId)),
  /** Advanced: versioned prompt templates per target type and audience. */
  templates: projectProcedure.query(({ ctx, input }) => listPromptTemplates(ctx.viewer, input.projectId)),
  createTemplate: projectProcedure.input(z.object({ template: z.unknown() })).mutation(({ ctx, input }) => createPromptTemplate(ctx.viewer, input.projectId, input.template, ctx.correlationId)),
});

export const appRouter = router({
  auth, clients, projects, members, sources, snapshots, mappings, datasets, context, analyses, findings, assessments, recommendations, graph, interpretations,
});
export type AppRouter = typeof appRouter;
