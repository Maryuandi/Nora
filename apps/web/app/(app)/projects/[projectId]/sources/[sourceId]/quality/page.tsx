"use client";

import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "@phosphor-icons/react";
import { Table } from "@/components/application/table/table";
import { Button } from "@/components/base/buttons/button";
import { STATUS_META } from "@/components/nora/badges";
import { Card } from "@/components/nora/card";
import { NotFoundPanel } from "@/components/not-found-panel";
import { FindingStatusPill, SeverityPill, VerdictPill } from "@/components/project/quality-pills";
import { RepairDialog } from "@/components/project/repair-dialog";
import { SourceTabs } from "@/components/project/source-tabs";
import { useProject } from "@/components/project/use-project";
import { formatDateTime } from "@/lib/format";
import { acceptsData } from "@/lib/mock/permissions";
import { ACTION_LABEL, buildQualityReport, CHECK_META, qualityDataset } from "@/lib/mock/quality";
import { repairRulesForSource } from "@/lib/mock/reducer";
import type { CheckId } from "@/lib/mock/types";

const num = (n: number) => n.toLocaleString("id-ID");
const fmtPct = (n: number) => `${n.toFixed(1).replace(".", ",")}%`;

export default function QualityPage() {
  const { sourceId } = useParams<{ sourceId: string }>();
  const ctx = useProject();
  const [expanded, setExpanded] = useState<CheckId[]>([]);
  const [handling, setHandling] = useState<CheckId | null>(null);
  const [revokeError, setRevokeError] = useState<string | undefined>();
  const state = ctx?.state;
  const dataset = useMemo(() => (state ? qualityDataset(state, sourceId) : null), [state, sourceId]);
  const rules = useMemo(() => (state ? repairRulesForSource(state, sourceId) : []), [state, sourceId]);
  const report = useMemo(() => (dataset ? buildQualityReport(dataset, rules.filter((r) => r.active)) : null), [dataset, rules]);

  const source = state?.sources.find((s) => s.id === sourceId);
  if (!ctx || !state || !source || source.projectId !== ctx.project.id) return <NotFoundPanel />;
  const { project, can, run } = ctx;
  const base = `/projects/${project.id}/sources/${source.id}`;
  const mayRepair = can("repair.edit", project.id);
  const open = acceptsData(project.status);
  const canAct = mayRepair && open;
  const userName = (id: string) => state.users.find((u) => u.id === id)?.name ?? "-";
  const activeRules = rules.filter((r) => r.active);
  const exclusions = activeRules.filter((r) => r.action !== "terima");
  const revoked = rules.filter((r) => !r.active);
  const handlingFinding = report?.findings.find((f) => f.id === handling) ?? null;
  const shown = report?.findings.filter((f) => expanded.includes(f.id)) ?? [];

  const toggle = (id: CheckId) => setExpanded((e) => (e.includes(id) ? e.filter((x) => x !== id) : [...e, id]));
  function revoke(ruleId: string) {
    setRevokeError(run({ type: "revokeRepairRule", ruleId }).error);
  }

  return (
    <div className="flex flex-col gap-4">
      <Link href={`/projects/${project.id}/sources`} className="inline-flex max-w-full min-w-0 items-center gap-1 self-start text-sm text-ink-2 hover:text-ink">
        <ArrowLeft size={14} aria-hidden className="shrink-0" /> Sumber data
      </Link>
      <div className="min-w-0">
        <h2 className="truncate text-[20px] leading-7 font-semibold tracking-[-0.02em]" title={source.name}>{source.name}</h2>
        {dataset && report ? (
          <p className="mt-1 text-sm text-ink-3">
            <span className="break-all" title={dataset.snapshot.fileName}>{dataset.snapshot.fileName}</span> · pemetaan v{dataset.mapping.version}
            {" · "}{num(report.totalEvents)} event · {num(report.totalCases)} kasus
          </p>
        ) : (
          <p className="mt-1 text-sm text-ink-3">Kualitas data sumber.</p>
        )}
      </div>
      <SourceTabs base={base} active="/quality" />

      {mayRepair && !open && <p className="text-sm text-ink-3">Proyek berstatus {STATUS_META[project.status].label}; penanganan temuan dinonaktifkan</p>}
      {!mayRepair && <p className="text-sm text-ink-3">Peranmu hanya dapat melihat laporan kualitas.</p>}

      {!dataset || !report ? (
        <div className="rounded-lg border border-dashed border-line bg-white px-6 py-12 text-center">
          <p className="text-sm font-medium text-ink">Belum ada data yang siap dinilai</p>
          <p className="mt-1 text-sm text-ink-3">Unggah file, lalu simpan pemetaan kolom terlebih dahulu.</p>
          <Link href={`${base}/mapping`} className="mt-3 inline-block text-sm font-medium text-accent hover:underline">Buka Pemetaan</Link>
        </div>
      ) : (
        <>
          <Card className="flex flex-col gap-3 px-4 py-4">
            <div className="flex flex-wrap items-center gap-3">
              <VerdictPill verdict={report.verdict} />
              <span className="text-sm text-ink-2">{num(report.eventsIncluded)} dari {num(report.totalEvents)} event disertakan</span>
            </div>
            {report.reasons.length > 0 && (
              <ul className="list-disc pl-5 text-sm text-ink-2">
                {report.reasons.map((r) => <li key={r} className="break-words">{r}</li>)}
              </ul>
            )}
          </Card>

          <Card>
            <Table aria-label="Temuan kualitas" size="sm">
              <Table.Header>
                <Table.Head id="title" isRowHeader label="PEMERIKSAAN" className="w-full" />
                <Table.Head id="sev" label="KEPARAHAN" />
                <Table.Head id="status" label="STATUS" />
                <Table.Head id="count" label="EVENT / KASUS" />
                <Table.Head id="pct" label="PERSEN" />
                <Table.Head id="act" label="AKSI" />
              </Table.Header>
              <Table.Body>
                {report.findings.map((f) => {
                  const hasActive = activeRules.some((r) => r.check === f.id);
                  const showTangani = (f.status === "ditemukan" || f.status === "tidak_diketahui") && !hasActive && canAct;
                  const counted = f.status === "ditemukan" || f.status === "bersih";
                  return (
                    <Table.Row key={f.id} id={f.id}>
                      <Table.Cell className="max-w-[320px] px-6 text-sm text-ink">
                        <span className="block font-medium break-words">{f.title}</span>
                        <span className="block text-xs text-ink-3 break-words">{f.explanation}</span>
                      </Table.Cell>
                      <Table.Cell className="px-6"><SeverityPill severity={f.severity} /></Table.Cell>
                      <Table.Cell className="px-6"><FindingStatusPill status={f.status} /></Table.Cell>
                      <Table.Cell className="px-6 text-sm whitespace-nowrap text-ink-2">{counted ? `${num(f.affectedEvents)} / ${num(f.affectedCases)}` : "-"}</Table.Cell>
                      <Table.Cell className="px-6 text-sm whitespace-nowrap text-ink-2">{counted ? fmtPct(f.percent) : "-"}</Table.Cell>
                      <Table.Cell className="px-6">
                        <div className="flex items-center gap-2">
                          {f.examples.length > 0 && (
                            <Button color="secondary" size="xs" aria-expanded={expanded.includes(f.id)} aria-label={`Lihat contoh ${f.title}`} onClick={() => toggle(f.id)}>
                              {expanded.includes(f.id) ? "Sembunyikan" : "Lihat contoh"}
                            </Button>
                          )}
                          {showTangani && <Button color="primary" size="xs" aria-label={`Tangani ${f.title}`} onClick={() => setHandling(f.id)}>Tangani</Button>}
                        </div>
                      </Table.Cell>
                    </Table.Row>
                  );
                })}
              </Table.Body>
            </Table>
            {shown.length > 0 && (
              <div className="flex flex-col gap-3 border-t border-line px-4 py-3">
                {shown.map((f) => (
                  <div key={f.id}>
                    <h3 className="text-sm font-medium text-ink">Contoh: {f.title}</h3>
                    <ul className="mt-1 flex flex-col gap-0.5 text-sm text-ink-2">
                      {f.examples.map((ex) => <li key={ex.row} className="break-words">Snapshot {dataset.snapshot.fileName} · {ex.text}</li>)}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card>
            <div className="border-b border-line px-4 py-3">
              <h3 className="text-base font-semibold text-ink">Antrean perbaikan</h3>
            </div>
            {revokeError && <p className="px-4 pt-3 text-sm text-status-ended" role="alert">{revokeError}</p>}
            {activeRules.length ? (
              <Table aria-label="Aturan perbaikan aktif" size="sm">
                <Table.Header>
                  <Table.Head id="check" isRowHeader label="PEMERIKSAAN" className="w-full" />
                  <Table.Head id="action" label="AKSI" />
                  <Table.Head id="reason" label="ALASAN" />
                  <Table.Head id="impact" label="DAMPAK" />
                  <Table.Head id="by" label="PEMBUAT" />
                  <Table.Head id="revoke" label="" />
                </Table.Header>
                <Table.Body>
                  {activeRules.map((r) => (
                    <Table.Row key={r.id} id={r.id}>
                      <Table.Cell className="px-6 text-sm font-medium text-ink">{CHECK_META[r.check].title}</Table.Cell>
                      <Table.Cell className="px-6 text-sm whitespace-nowrap text-ink-2">{ACTION_LABEL[r.action]}</Table.Cell>
                      <Table.Cell className="max-w-[240px] px-6 text-sm text-ink-2"><span className="block truncate" title={r.reason}>{r.reason}</span></Table.Cell>
                      <Table.Cell className="px-6 text-sm whitespace-nowrap text-ink-2">{num(r.impactEvents)} event / {num(r.impactCases)} kasus</Table.Cell>
                      <Table.Cell className="px-6 text-sm whitespace-nowrap text-ink-2">{userName(r.createdBy)}</Table.Cell>
                      <Table.Cell className="px-6">
                        {canAct && <Button color="secondary" size="xs" aria-label={`Cabut aturan ${CHECK_META[r.check].title}`} onClick={() => revoke(r.id)}>Cabut</Button>}
                      </Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table>
            ) : (
              <p className="px-4 py-6 text-sm text-ink-3">Belum ada aturan perbaikan aktif.</p>
            )}
            <div className="border-t border-line px-4 py-3">
              <h4 className="text-sm font-medium text-ink">Dikecualikan</h4>
              {exclusions.length ? (
                <ul className="mt-1 flex flex-col gap-0.5 text-sm text-ink-2">
                  {exclusions.map((r) => (
                    <li key={r.id} className="break-words">
                      {CHECK_META[r.check].title}: {num(r.impactEvents)} event / {num(r.impactCases)} kasus · {r.reason}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-sm text-ink-3">Tidak ada event atau kasus yang dikecualikan.</p>
              )}
            </div>
            {revoked.length > 0 && (
              <div className="border-t border-line px-4 py-3">
                <h4 className="text-sm font-medium text-ink-3">Dicabut</h4>
                <ul className="mt-1 flex flex-col gap-0.5 text-sm text-ink-3 opacity-70">
                  {revoked.map((r) => (
                    <li key={r.id} className="break-words">
                      {CHECK_META[r.check].title} · {ACTION_LABEL[r.action]} · dicabut oleh {userName(r.revokedBy ?? "")}{r.revokedAt ? `, ${formatDateTime(r.revokedAt)}` : ""}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>
          {canAct && <RepairDialog open={!!handlingFinding} onClose={() => setHandling(null)} sourceId={source.id} finding={handlingFinding} report={report} />}
        </>
      )}
    </div>
  );
}
