// Demo data for local testing, created through the running app (tRPC + workers), so every derived record is real:
// accounts and roles, a published dataset, full context with BPMN, analysis and findings, graph, assessments,
// recommendations with a comparison, and interpretations. Needs `pnpm dev` running; existing data is left untouched.
//
//   pnpm seed                 (SEED_URL defaults to http://localhost:3000)
import { createPrisma } from "@nora/db";
import { hashPassword } from "../lib/lite/password.ts";
import {
  activateContext, approveCatalog, Client, must, P2P_CONFIG, p2pCsv, publishCsv, waitFor, waitRun,
} from "./smoke/harness.ts";

const BASE = process.env.SEED_URL ?? "http://localhost:3000";

/** Demo accounts (local test data only). */
export const ACCOUNTS = {
  admin: { name: "Admin Nora", email: "admin@nora.test", password: "admin-demo-123" },
  analyst: { name: "Ana Analis", email: "analis@nora.test", password: "analis-demo-123" },
  owner: { name: "Pemilik Proses", email: "pemilik@nora.test", password: "pemilik-demo-123" },
};

const BPMN = `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="d" targetNamespace="nora-demo">
  <process id="p2p" isExecutable="false">
    <startEvent id="s"/>
    <task id="t1" name="Create PO"/><task id="t2" name="Approve PO"/><task id="t3" name="Receive Goods"/><task id="t4" name="Pay Invoice"/>
    <endEvent id="e"/>
    <sequenceFlow id="f1" sourceRef="s" targetRef="t1"/><sequenceFlow id="f2" sourceRef="t1" targetRef="t2"/>
    <sequenceFlow id="f3" sourceRef="t2" targetRef="t3"/><sequenceFlow id="f4" sourceRef="t3" targetRef="t4"/><sequenceFlow id="f5" sourceRef="t4" targetRef="e"/>
  </process>
  <bpmndi:BPMNDiagram id="dg"><bpmndi:BPMNPlane id="pl" bpmnElement="p2p">
    <bpmndi:BPMNShape id="s_di" bpmnElement="s"><dc:Bounds x="40" y="80" width="36" height="36"/></bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="t1_di" bpmnElement="t1"><dc:Bounds x="120" y="58" width="100" height="80"/></bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="t2_di" bpmnElement="t2"><dc:Bounds x="260" y="58" width="100" height="80"/></bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="t3_di" bpmnElement="t3"><dc:Bounds x="400" y="58" width="100" height="80"/></bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="t4_di" bpmnElement="t4"><dc:Bounds x="540" y="58" width="100" height="80"/></bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="e_di" bpmnElement="e"><dc:Bounds x="680" y="80" width="36" height="36"/></bpmndi:BPMNShape>
    <bpmndi:BPMNEdge id="f1_di" bpmnElement="f1"><di:waypoint x="76" y="98"/><di:waypoint x="120" y="98"/></bpmndi:BPMNEdge>
    <bpmndi:BPMNEdge id="f2_di" bpmnElement="f2"><di:waypoint x="220" y="98"/><di:waypoint x="260" y="98"/></bpmndi:BPMNEdge>
    <bpmndi:BPMNEdge id="f3_di" bpmnElement="f3"><di:waypoint x="360" y="98"/><di:waypoint x="400" y="98"/></bpmndi:BPMNEdge>
    <bpmndi:BPMNEdge id="f4_di" bpmnElement="f4"><di:waypoint x="500" y="98"/><di:waypoint x="540" y="98"/></bpmndi:BPMNEdge>
    <bpmndi:BPMNEdge id="f5_di" bpmnElement="f5"><di:waypoint x="640" y="98"/><di:waypoint x="680" y="98"/></bpmndi:BPMNEdge>
  </bpmndi:BPMNPlane></bpmndi:BPMNDiagram>
</definitions>`;

const SCALE = [{ value: 0, label: "Tidak", definition: "Tidak terpenuhi" }, { value: 2, label: "Sebagian", definition: "Sebagian terpenuhi" }, { value: 4, label: "Ya", definition: "Terpenuhi" }];

const step = (label: string) => console.log(`• ${label}`);
const today = new Date().toISOString().slice(0, 10);
const nextYear = `${Number(today.slice(0, 4)) + 1}${today.slice(4)}`;

async function activatedMember(admin: Client, projectId: string, who: typeof ACCOUNTS.analyst, role: "analyst" | "process_owner") {
  const invite = must(await admin.call((t) => t.members.add.mutate({ projectId, email: who.email, name: who.name, role })), `invite ${who.email}`);
  const c = new Client(BASE);
  const token = new URL(invite.activationUrl!).searchParams.get("token")!;
  must(await c.call((t) => t.auth.activate.mutate({ token, name: who.name, password: who.password })), `activate ${who.email}`);
  return c;
}

const db = createPrisma();
const admin = new Client(BASE);
const setup = await admin.call((t) => t.auth.setup.mutate(ACCOUNTS.admin));
if (setup.status === 409) {
  // First-time setup was already done by someone else: add the demo admin next to the existing accounts.
  const { name, email, password } = ACCOUNTS.admin;
  if (!(await db.user.findUnique({ where: { email } }))) {
    await db.user.create({ data: { name, email, passwordHash: await hashPassword(password), globalRole: "admin", status: "active" } });
  }
  must(await admin.call((t) => t.auth.login.mutate({ email, password })), "demo admin login");
  if (must(await admin.call((t) => t.projects.list.query()), "projects").projects.some((p) => p.name === "Pengadaan 2026")) {
    console.log("Demo data is already there; nothing to do.");
    process.exit(0);
  }
} else {
  must(setup, "setup");
}
step("demo admin account");

/** Existing admins (e.g. your own account) become administrators of the demo projects, so they see them too. */
async function shareWithOtherAdmins(projectId: string) {
  const others = await db.user.findMany({ where: { globalRole: "admin", status: "active", email: { not: ACCOUNTS.admin.email } }, select: { email: true } });
  for (const { email } of others) must(await admin.call((t) => t.members.add.mutate({ projectId, email, role: "administrator" })), `share with ${email}`);
}

// ---------------------------------------------------------------- clients, projects, members
const client = must(await admin.call((t) => t.clients.create.mutate({ name: "PT Sumber Makmur", sector: "Manufaktur", contact: "Budi (budi@sumbermakmur.test)" })), "client");
const projectId = must(await admin.call((t) => t.projects.create.mutate({
  clientId: client.id, name: "Pengadaan 2026", description: "Analisis proses purchase-to-pay cabang Jakarta dan Bandung.", processName: "Purchase-to-Pay",
  timezone: "Asia/Jakarta", contractStart: today, contractEnd: nextYear, retentionPolicy: "Hapus 2 tahun setelah kontrak berakhir",
})), "project").id;
must(await admin.call((t) => t.projects.setStatus.mutate({ projectId, status: "active", reason: "Kontrak ditandatangani" })), "activate project");
await shareWithOtherAdmins(projectId);
const analyst = await activatedMember(admin, projectId, ACCOUNTS.analyst, "analyst");
await activatedMember(admin, projectId, ACCOUNTS.owner, "process_owner");
step("client, active project, analyst and process owner");

// A second client with a draft project, to see the draft state and the project list.
const client2 = must(await admin.call((t) => t.clients.create.mutate({ name: "CV Laju Logistik", sector: "Logistik", contact: "" })), "client 2");
const draftId = must(await admin.call((t) => t.projects.create.mutate({
  clientId: client2.id, name: "Order-to-Cash", processName: "Order-to-Cash", contractStart: today, contractEnd: nextYear, retentionPolicy: "Hapus 1 tahun setelah kontrak berakhir",
})), "draft project").id;
await shareWithOtherAdmins(draftId);
step("second client with a draft project");

// ---------------------------------------------------------------- data
const dataset = await publishCsv(analyst, projectId, p2pCsv(160), P2P_CONFIG, "ERP Pengadaan");
step(`published dataset ${dataset.name} (${dataset.caseCount} kasus, ${dataset.eventCount} event)`);

// ---------------------------------------------------------------- context
const doc = must(await analyst.call((t) => t.context.createDocument.mutate({
  projectId, title: "SOP Pengadaan", reference: "SOP-PRC-01", version: "3", excerpt: "PO wajib disetujui paling lambat 24 jam setelah dibuat. Pembayaran tidak boleh dilakukan oleh penyetuju PO.",
})), "document");
const saveApproved = async (input: Parameters<Client["api"]["context"]["save"]["mutate"]>[0]) => {
  const item = must(await analyst.call((t) => t.context.save.mutate(input)), `context ${input.kind}`);
  must(await analyst.call((t) => t.context.transition.mutate({ projectId, kind: input.kind, id: item.id, to: "approved" })), `approve ${input.kind}`);
};
await saveApproved({ projectId, kind: "calendar", payload: { timezone: "Asia/Jakarta", workingDays: [1, 2, 3, 4, 5], workStart: "08:00", workEnd: "17:00", holidays: [`${today.slice(0, 4)}-12-25`] } });
await saveApproved({ projectId, kind: "rule", key: "sla-approve", payload: { name: "Approve PO ≤ 24 jam", params: { type: "sla_duration", fromActivity: "Create PO", toActivity: "Approve PO", maxHours: 24 } }, sourceDocumentId: doc.id, sourceReference: "SOP-PRC-01 §3" });
await saveApproved({ projectId, kind: "rule", key: "sod", payload: { name: "Penyetuju tidak membayar", params: { type: "separation_of_duties", activityA: "Approve PO", activityB: "Pay Invoice" } }, sourceDocumentId: doc.id, sourceReference: "SOP-PRC-01 §5" });
step("document, calendar and two approved rules");

const bpmn = must(await analyst.call((t) => t.context.uploadBpmn.mutate({ projectId, name: "P2P standar", fileName: "p2p.bpmn", xml: BPMN })), "bpmn");
await waitFor("BPMN validation", async () => {
  const { models } = must(await analyst.call((t) => t.context.bpmnModels.query({ projectId })), "bpmn list");
  return models.find((m) => m.id === bpmn.id && m.validationStatus !== "pending");
});
must(await analyst.call((t) => t.context.saveBpmnMapping.mutate({ projectId, modelId: bpmn.id, mapping: { t1: ["Create PO"], t2: ["Approve PO"], t3: ["Receive Goods"], t4: ["Pay Invoice"] } })), "bpmn mapping");
must(await analyst.call((t) => t.context.approveBpmn.mutate({ projectId, modelId: bpmn.id })), "approve bpmn");
step("BPMN model validated, mapped and approved");

must(await analyst.call((t) => t.context.importCatalog.mutate({ projectId, catalog: {
  hypotheses: [
    { key: "approver-capacity", payload: { statement: "Kapasitas penyetuju PO terbatas pada jam sibuk", findingTypes: ["bottleneck_indication"], activities: ["Approve PO"], symptoms: ["Antrian approval menumpuk"], requiredEvidence: ["P90 tunggu Create PO → Approve PO"] } },
    { key: "unclear-spec", payload: { statement: "Spesifikasi PO tidak lengkap sehingga perlu revisi", findingTypes: ["high_rework"], activities: ["Request Change", "Approve PO"], symptoms: ["Request Change berulang"], requiredEvidence: ["Porsi kasus rework"] } },
  ],
  interventions: [
    { key: "delegation", payload: { action: "Delegasi approval PO bernilai kecil ke supervisor", addressedHypotheses: ["approver-capacity"], findingTypes: ["bottleneck_indication"], activities: ["Approve PO", "Receive Goods", "Pay Invoice", "Create PO"], effort: 2, risk: 2, ownerRole: "Manajer pengadaan", successMetric: "P90 tunggu approval turun 30%", prerequisites: ["Matriks wewenang diperbarui"] } },
    { key: "queue-review", payload: { action: "Pantau antrian approval mingguan", findingTypes: ["bottleneck_indication"] } },
    { key: "po-template", payload: { action: "Template PO wajib dengan isian spesifikasi", addressedHypotheses: ["unclear-spec"], findingTypes: ["high_rework"], effort: 3, risk: 1, ownerRole: "Kepala pengadaan", successMetric: "Porsi rework turun di bawah 10%" } },
  ],
  rubrics: [{ key: "relevansi", payload: { name: "Relevansi kandidat", criteria: [
    { key: "gejala", name: "Menjawab gejala temuan", weight: 0.6, scale: SCALE },
    { key: "bukti", name: "Didukung bukti terukur", weight: 0.4, scale: SCALE },
  ] } }],
} })), "catalog");
await approveCatalog(analyst, projectId);
step("catalog: hypotheses, interventions and rubric approved");

await activateContext(analyst, projectId, { rework: true });
step("process boundary, rework definition and context package active");

// ---------------------------------------------------------------- analysis, findings, graph
const run = must(await analyst.call((t) => t.analyses.request.mutate({ projectId })), "analysis");
const done = await waitRun(analyst, projectId, run.id);
if (done.status !== "completed") throw new Error(`analysis ${done.status}: ${done.errorMessage}`);
const { findings } = must(await analyst.call((t) => t.findings.list.query({ projectId, types: "bottleneck_indication,high_rework,rule_non_compliance,bpmn_deviation" })), "findings");
step(`analysis completed with ${findings.length} findings (${[...new Set(findings.map((f) => f.type))].join(", ")})`);
await waitFor("graph projection", async () => must(await admin.call((t) => t.graph.status.query({ projectId })), "graph").pending === 0 || null, 180_000);
step("graph projected to Neo4j");

// ---------------------------------------------------------------- assessments, recommendations, interpretations
const bottleneck = findings.find((f) => f.type === "bottleneck_indication");
if (bottleneck) {
  const findingId = bottleneck.id;
  must(await analyst.call((t) => t.assessments.requestRun.mutate({ projectId, findingId })), "assessment run");
  const assessed = await waitFor("assessments", async () => {
    const r = must(await analyst.call((t) => t.findings.assessments.query({ projectId, findingId })), "assessments");
    return r.run && !["queued", "running"].includes(r.run.status) ? r : null;
  }, 180_000);
  step(`Jev assessments: ${assessed.assessments.map((a) => `${a.candidateKey}=${a.status}`).join(", ")}`);
  const review = assessed.assessments.find((a) => a.status === "needs_review");
  if (review) {
    must(await analyst.call((t) => t.assessments.correct.mutate({ projectId, assessmentId: review.id, kind: "confirm", reason: "Sesuai hasil diskusi dengan tim pengadaan", goldCandidate: false })), "confirm");
    step("one assessment confirmed by the analyst");
  }

  must(await analyst.call((t) => t.recommendations.addCandidate.mutate({ projectId, candidate: {
    findingId, description: "Approval paralel untuk PO di bawah Rp 10 juta", addressedProblem: "Tunggu approval panjang", successMetric: "Median tunggu approval turun",
    sourceReason: "Wawancara tim pengadaan", ownerRole: "Kepala pengadaan", effort: 3, risk: 2,
  } })), "analyst candidate");
  const set = must(await analyst.call((t) => t.recommendations.refresh.mutate({ projectId, findingId })), "refresh");
  const rec = await waitFor("recommendations", async () => {
    const x = must(await analyst.call((t) => t.recommendations.forFinding.query({ projectId, findingId })), "recommendations");
    return x.set && x.set.id === set.id && ["completed", "failed"].includes(x.set.status) ? x : null;
  }, 240_000);
  step(`recommendations: ${rec.candidates.map((c) => `${c.candidateKey}=${c.status}`).join(", ")}`);
  const comparable = rec.candidates.filter((c) => c.validationId).slice(0, 3);
  if (comparable.length >= 2) {
    const cmp = must(await analyst.call((t) => t.recommendations.compare.mutate({ projectId, findingId, ids: comparable.map((c) => c.id) })), "compare");
    step(`comparison of ${comparable.length} candidates`);
    await interpret({ targetType: "candidate_comparison", targetId: cmp.id, audience: "process_owner" });
  }

  const draft = await interpret({ targetType: "finding", targetId: findingId, audience: "analyst" });
  if (draft.status === "passed") {
    must(await analyst.call((t) => t.interpretations.accept.mutate({ projectId, interpretationId: draft.id, note: "Sesuai bukti" })), "accept");
    step("finding interpretation accepted");
  }
  await interpret({ targetType: "finding", targetId: findingId, audience: "process_owner" });
}

async function interpret(request: { targetType: string; targetId: string; audience: string }) {
  const { id } = must(await analyst.call((t) => t.interpretations.request.mutate({ projectId, request })), "interpretation");
  const d = await waitFor("interpretation", async () => {
    const x = must(await analyst.call((t) => t.interpretations.get.query({ projectId, interpretationId: id })), "interpretation");
    return ["passed", "failed_check", "failed", "accepted", "flagged"].includes(x.status) ? x : null;
  }, 180_000);
  step(`interpretation ${request.targetType}/${request.audience}: ${d.status}`);
  return d;
}

await db.$disconnect();
console.log(`\nDone. Open ${BASE}/lite and sign in with an account from ACCOUNTS in apps/web/scripts/seed.ts (or your own admin account).`);
