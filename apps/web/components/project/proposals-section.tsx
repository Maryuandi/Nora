"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/base/buttons/button";
import { NativeSelect } from "@/components/base/select/select-native";
import { TextArea } from "@/components/base/textarea/textarea";
import { Banner } from "@/components/nora/banner";
import { Card } from "@/components/nora/card";
import { formatDateTime } from "@/lib/format";
import { acceptsData } from "@/lib/mock/permissions";
import { rulesForProject } from "@/lib/mock/reducer";
import { isProposalBlocked, latestByKey } from "@/lib/mock/rules";
import { useMock } from "@/lib/mock/store";

/** Usulan perubahan aturan konteks (M04) dari workspace ini. */
export function ProposalsSection({ investigationId }: { investigationId: string }) {
  const { state, dispatch, can } = useMock();
  const [ruleKey, setRuleKey] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | undefined>();
  const inv = state.investigations.find((i) => i.id === investigationId);
  const project = inv && state.projects.find((p) => p.id === inv.projectId);
  if (!inv || !project) return null;
  const rules = latestByKey(rulesForProject(state, project.id));
  const open = rules.filter((r) => !isProposalBlocked(r));
  const selected = open.some((r) => r.ruleKey === ruleKey) ? ruleKey : open[0]?.ruleKey ?? "";
  const proposals = state.proposals.filter((p) => p.investigationId === inv.id);
  const mayPropose = can("proposal.create", project.id) && acceptsData(project.status);
  const name = (id: string) => state.users.find((u) => u.id === id)?.name ?? id;

  function submit() {
    const err = dispatch({ type: "createProposal", investigationId: inv!.id, ruleKey: selected, note });
    setError(err);
    if (!err) setNote("");
  }

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-base font-semibold text-ink">Usulan ke M04</h2>
        <p className="mt-1 text-sm text-ink-2">Usulkan perubahan aturan konteks proyek. Usulan masuk sebagai versi aturan baru berstatus ditinjau.</p>
      </div>
      {mayPropose && (
        <Card className="flex flex-col gap-3 p-4">
          {error && <Banner tone="warning">{error}</Banner>}
          <NativeSelect label="Aturan" size="sm" value={selected} onChange={(e) => { setRuleKey(e.target.value); setError(undefined); }}
            options={rules.map((r) => isProposalBlocked(r)
              ? { label: `${r.name} (v${r.version}) (usulan berjalan)`, value: r.ruleKey, disabled: true }
              : { label: `${r.name} (v${r.version})`, value: r.ruleKey })} />
          <TextArea label="Catatan usulan" isRequired rows={3} value={note} onChange={setNote} />
          <div className="flex justify-end">
            <Button color="primary" size="xs" onClick={submit} isDisabled={!selected || !note.trim()}>Kirim usulan</Button>
          </div>
        </Card>
      )}
      <Card>
        {proposals.length ? (
          <ul className="divide-y divide-line">
            {proposals.map((p) => {
              const rule = state.rules.find((r) => r.id === p.ruleId);
              return (
                <li key={p.id} className="flex flex-col gap-1 px-4 py-3 text-sm">
                  <p className="whitespace-pre-wrap text-ink">{p.note}</p>
                  <p className="text-ink-2">
                    {rule ? (
                      <Link href={`/projects/${project.id}/context/rules/${rule.ruleKey}`} className="font-medium text-accent hover:underline">{rule.name} v{rule.version}</Link>
                    ) : p.ruleId}
                    {" · "}{name(p.by)} · {formatDateTime(p.at)}
                  </p>
                </li>
              );
            })}
          </ul>
        ) : <p className="px-4 py-6 text-center text-sm text-ink-3">Belum ada usulan dari workspace ini.</p>}
      </Card>
    </section>
  );
}
