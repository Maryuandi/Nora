"use client";

import { useState } from "react";
import Link from "next/link";
import { LinkBreak, Plus } from "@phosphor-icons/react";
import { Table } from "@/components/application/table/table";
import { Button } from "@/components/base/buttons/button";
import { Banner } from "@/components/nora/banner";
import { Pill } from "@/components/nora/badges";
import { Card } from "@/components/nora/card";
import { LinkObjectModal, linkTargets } from "@/components/project/link-object-modal";
import { LINK_KIND_LABEL, linkFreshness } from "@/lib/mock/investigation";
import { acceptsData } from "@/lib/mock/permissions";
import { useMock } from "@/lib/mock/store";
import type { InvestigationLink } from "@/lib/mock/types";

export function LinksTab({ investigationId }: { investigationId: string }) {
  const { state, dispatch, can } = useMock();
  const [linking, setLinking] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const inv = state.investigations.find((i) => i.id === investigationId);
  const project = inv && state.projects.find((p) => p.id === inv.projectId);
  if (!inv || !project) return null;
  const links = state.links.filter((l) => l.investigationId === inv.id);
  const mayLink = can("investigation.link", project.id) && acceptsData(project.status);
  const title = (l: InvestigationLink) =>
    linkTargets(state, project.id, l.kind).find((t) => t.value === l.targetId)?.label ?? l.targetId;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-ink">Objek tertaut</h2>
        {mayLink && <Button color="primary" size="xs" iconLeading={Plus} onClick={() => setLinking(true)}>Tautkan objek</Button>}
      </div>
      {error && <Banner tone="warning">{error}</Banner>}
      <Card>
        {links.length ? (
          <Table aria-label="Objek tertaut" size="sm">
            <Table.Header>
              <Table.Head id="kind" isRowHeader label="JENIS" />
              <Table.Head id="title" label="JUDUL" className="w-full" />
              <Table.Head id="ver" label="VERSI DITAUTKAN" />
              <Table.Head id="status" label="STATUS TERKINI" />
              <Table.Head id="act" label="" />
            </Table.Header>
            <Table.Body>
              {links.map((l) => {
                const { latest, stale } = linkFreshness(state, l);
                const hasDecision = state.decisions.some((d) => d.targetLinkId === l.id || d.replacedByLinkId === l.id);
                return (
                  <Table.Row key={l.id} id={l.id}>
                    <Table.Cell className="px-6 text-sm whitespace-nowrap text-ink-2">{LINK_KIND_LABEL[l.kind]}</Table.Cell>
                    <Table.Cell className="max-w-[360px] px-6 text-sm font-medium text-ink"><span title={title(l)} className="block truncate">{title(l)}</span></Table.Cell>
                    <Table.Cell className="px-6 text-sm whitespace-nowrap text-ink-2">{l.linkedVersion}</Table.Cell>
                    <Table.Cell className="px-6 text-sm whitespace-nowrap text-ink-2">
                      {stale ? (
                        <span className="flex items-center gap-2"><Pill dot="bg-status-suspended">versi lebih baru tersedia</Pill><span>{latest}</span></span>
                      ) : "Terkini"}
                    </Table.Cell>
                    <Table.Cell className="px-6">
                      <span className="flex items-center justify-end gap-2">
                        {l.kind === "interpretasi" && (
                          <Link href={`/projects/${project.id}/interpretations/${l.targetId}`} className="text-sm font-medium text-accent hover:underline">Buka</Link>
                        )}
                        {mayLink && stale && (
                          <Button color="secondary" size="xs" onClick={() => setError(dispatch({ type: "refreshLink", linkId: l.id }))}>Perbarui tautan</Button>
                        )}
                        {mayLink && (
                          <span title={hasDecision ? "Tautan terkait keputusan dan tidak bisa dilepas" : undefined}>
                            <Button color="secondary" size="xs" iconLeading={LinkBreak} aria-label="Lepas tautan" isDisabled={hasDecision}
                              onClick={() => setError(dispatch({ type: "unlinkObject", linkId: l.id }))} />
                          </span>
                        )}
                      </span>
                    </Table.Cell>
                  </Table.Row>
                );
              })}
            </Table.Body>
          </Table>
        ) : (
          <p className="px-4 py-10 text-center text-sm text-ink-3">Belum ada objek tertaut.</p>
        )}
      </Card>
      {mayLink && <LinkObjectModal open={linking} onClose={() => setLinking(false)} investigationId={inv.id} />}
    </div>
  );
}
