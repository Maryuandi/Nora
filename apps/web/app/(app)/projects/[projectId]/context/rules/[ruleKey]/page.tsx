"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, CheckCircle } from "@phosphor-icons/react";
import { Table } from "@/components/application/table/table";
import { Button } from "@/components/base/buttons/button";
import { Banner } from "@/components/nora/banner";
import { Pill, STATUS_META } from "@/components/nora/badges";
import { Card } from "@/components/nora/card";
import { NoraModal } from "@/components/nora/modal";
import { NotFoundPanel } from "@/components/not-found-panel";
import { ContextTabs } from "@/components/project/context-tabs";
import { RulePreviewCard } from "@/components/project/rule-preview";
import { RuleStatusBadge } from "@/components/project/rule-status";
import { useProject } from "@/components/project/use-project";
import { formatDate, formatDateTime } from "@/lib/format";
import { acceptsData } from "@/lib/mock/permissions";
import { ruleVersions } from "@/lib/mock/reducer";
import { RULE_TYPE_LABEL, nextStatuses, previewDataset, previewRule, projectCanonicalLabels, ruleSummary } from "@/lib/mock/rules";
import type { RuleParams, RuleStatus } from "@/lib/mock/types";

function paramRows(p: RuleParams): [string, string][] {
  switch (p.type) {
    case "sla": return [["Aktivitas awal", p.from], ["Aktivitas akhir", p.to], ["Batas durasi", `${p.limit} hari ${p.unit === "kerja" ? "kerja" : "kalender"}`]];
    case "urutan": return [["Aktivitas lebih dulu", p.before], ["Aktivitas sesudahnya", p.after]];
    case "wajib": case "terlarang": return [["Aktivitas", p.activity]];
    case "pemisahan_tugas": return [["Aktivitas A", p.activityA], ["Aktivitas B", p.activityB]];
    default: return [];
  }
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <h3 className="border-b border-line px-4 py-3 text-sm font-semibold text-ink">{title}</h3>
      {children}
    </Card>
  );
}

const Fact = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="min-w-0">
    <dt className="text-xs text-ink-3">{label}</dt>
    <dd className="mt-0.5 text-sm break-words text-ink">{children}</dd>
  </div>
);

export default function RuleDetailPage() {
  const { ruleKey } = useParams<{ ruleKey: string }>();
  return <RuleDetail key={ruleKey} ruleKey={ruleKey} />;
}

function RuleDetail({ ruleKey }: { ruleKey: string }) {
  const ctx = useProject();
  const [openId, setOpenId] = useState<string | null>(null);
  const [retiring, setRetiring] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const versions = ctx ? ruleVersions(ctx.state, ruleKey) : [];
  const latest = versions[0];
  if (!ctx || !latest || latest.projectId !== ctx.project.id) return <NotFoundPanel />;
  const { project, state, can, dispatch } = ctx;
  const base = `/projects/${project.id}`;
  const shown = versions.find((v) => v.id === openId) ?? latest;
  const isLatest = shown.id === latest.id;
  const open = acceptsData(project.status);
  const mayEdit = can("rule.edit", project.id);
  const mayConfirm = can("rule.confirm", project.id);
  const next = nextStatuses(latest.status);
  const user = (id?: string) => (id && state.users.find((u) => u.id === id)?.name) || "-";

  const labels = projectCanonicalLabels(state, project.id);
  const missing = paramRows(shown.params).filter(([k]) => k.startsWith("Aktivitas")).map(([, v]) => v).filter((a) => !labels.includes(a));
  const dataset = previewDataset(state, project.id);
  const preview = previewRule(shown, dataset);
  const sourceLabel = dataset ? (state.sources.find((s) => s.id === dataset.sourceId)?.name ?? null) : null;

  const move = (to: RuleStatus) => setError(dispatch({ type: "changeRuleStatus", ruleId: latest.id, to }));
  const retire = () => { move("usang"); setRetiring(false); };
  const showEditButtons = isLatest && mayEdit && open;
  const canConfirm = isLatest && mayConfirm && open && (latest.status === "ditinjau" || latest.status === "disetujui") && !latest.clientConfirmed;
  const blocked = isLatest && !open && (mayEdit || mayConfirm);
  const ACTIONS: { to: RuleStatus; label: string }[] = [
    { to: "ditinjau", label: "Ajukan tinjauan" }, { to: "draf", label: "Kembalikan ke draf" }, { to: "disetujui", label: "Setujui" },
  ];

  return (
    <div className="flex flex-col gap-4">
      <ContextTabs active="/context/rules" />
      <Link href={`${base}/context/rules`} className="inline-flex items-center gap-1 self-start text-sm text-ink-2 hover:text-ink">
        <ArrowLeft size={14} aria-hidden className="shrink-0" /> Aturan
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <h2 className="min-w-0 truncate text-[20px] leading-7 font-semibold tracking-[-0.02em]" title={shown.name}>{shown.name}</h2>
          <RuleStatusBadge status={shown.status} />
          <span className="text-sm text-ink-2">v{shown.version}</span>
          {shown.clientConfirmed && <Pill><CheckCircle size={14} weight="fill" className="text-status-active" aria-hidden />Dikonfirmasi klien</Pill>}
          <span className="text-sm text-ink-3">{RULE_TYPE_LABEL[shown.params.type]}</span>
        </div>
        {showEditButtons && (
          <div className="flex flex-wrap gap-2">
            {ACTIONS.filter((a) => next.includes(a.to)).map((a) => (
              <Button key={a.to} color={a.to === "ditinjau" || a.to === "disetujui" ? "primary" : "secondary"} size="xs" onClick={() => move(a.to)}>{a.label}</Button>
            ))}
            {next.includes("usang") && <Button color="secondary-destructive" size="xs" onClick={() => setRetiring(true)}>Tandai usang</Button>}
            {latest.status !== "usang" && (
              <Link href={`${base}/context/rules/${ruleKey}/edit`}><Button color="secondary" size="xs">Ubah</Button></Link>
            )}
          </div>
        )}
        {canConfirm && <Button color="primary" size="xs" onClick={() => setError(dispatch({ type: "confirmRuleClient", ruleId: latest.id }))}>Konfirmasi klien</Button>}
      </div>

      {error && <Banner tone="warning">{error}</Banner>}
      {blocked && <p className="text-sm text-ink-3">Proyek berstatus {STATUS_META[project.status].label}; perubahan aturan dinonaktifkan</p>}
      {!isLatest && <Banner>Versi lama (hanya baca). <button type="button" className="font-medium text-accent hover:underline" onClick={() => { setOpenId(null); setError(undefined); }}>Lihat versi terbaru</button></Banner>}
      {missing.map((a) => <Banner key={a} tone="warning">Aktivitas {a} tidak lagi ada di label kanonis; ubah aturan</Banner>)}

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex flex-col gap-4">
          <Section title="Aturan">
            <div className="flex flex-col gap-4 px-4 py-4">
              <p className="text-sm break-words text-ink">{ruleSummary(shown.params)}</p>
              {shown.description && <p className="text-sm break-words text-ink-2">{shown.description}</p>}
              <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
                {paramRows(shown.params).map(([k, v]) => <Fact key={k} label={k}>{v}</Fact>)}
                <Fact label="Cakupan">{shown.scope ? `${shown.scope.attribute} ${shown.scope.op} ${shown.scope.value}` : "Semua kasus"}</Fact>
                <Fact label="Masa berlaku">{shown.effectiveTo ? `${formatDate(shown.effectiveFrom)} - ${formatDate(shown.effectiveTo)}` : `mulai ${formatDate(shown.effectiveFrom)}`}</Fact>
              </dl>
            </div>
          </Section>
          <Section title="Rujukan sumber">
            <div className="flex flex-col gap-3 px-4 py-4">
              <p className="text-sm break-words text-ink">{shown.source.docTitle || "-"} · {shown.source.section || "-"}</p>
              {shown.source.quote
                ? <blockquote className="rounded-md border-l-2 border-line bg-canvas px-3 py-2 text-sm break-words whitespace-pre-wrap text-ink-2">{shown.source.quote}</blockquote>
                : <p className="text-sm text-ink-3">Belum ada kutipan</p>}
            </div>
          </Section>
        </div>
        <RulePreviewCard preview={preview} sourceLabel={sourceLabel} />
      </div>

      <Section title="Riwayat versi">
        <Table aria-label="Riwayat versi aturan" size="sm">
          <Table.Header>
            <Table.Head id="v" isRowHeader label="VERSI" />
            <Table.Head id="st" label="STATUS" />
            <Table.Head id="at" label="TANGGAL" />
            <Table.Head id="by" label="PEMBUAT" />
            <Table.Head id="ap" label="DISETUJUI OLEH" className="w-full" />
          </Table.Header>
          <Table.Body>
            {versions.map((v) => (
              <Table.Row key={v.id} id={v.id}>
                <Table.Cell className="px-6 text-sm font-medium whitespace-nowrap text-ink">
                  <button type="button" aria-pressed={v.id === shown.id} aria-label={`Lihat aturan v${v.version}`} onClick={() => { setOpenId(v.id === latest.id ? null : v.id); setError(undefined); }}
                    className="cursor-pointer text-accent hover:underline">v{v.version}</button>
                </Table.Cell>
                <Table.Cell className="px-6"><RuleStatusBadge status={v.status} /></Table.Cell>
                <Table.Cell className="px-6 text-sm whitespace-nowrap text-ink-2">{formatDateTime(v.createdAt)}</Table.Cell>
                <Table.Cell className="px-6 text-sm whitespace-nowrap text-ink-2">{user(v.createdBy)}</Table.Cell>
                <Table.Cell className="px-6 text-sm whitespace-nowrap text-ink-2">{user(v.approvedBy)}</Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      </Section>

      {showEditButtons && next.includes("usang") && (
        <NoraModal open={retiring} onClose={() => setRetiring(false)} title="Tandai aturan usang?" description="Aturan usang tidak dapat diubah lagi dan tidak dipakai untuk evaluasi."
          footer={<>
            <Button color="secondary" size="xs" onClick={() => setRetiring(false)}>Kembali</Button>
            <Button color="primary-destructive" size="xs" onClick={retire}>Tandai usang</Button>
          </>} />
      )}
    </div>
  );
}
