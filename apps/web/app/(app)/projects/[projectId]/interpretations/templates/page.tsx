"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CaretDown } from "@phosphor-icons/react";
import { Card } from "@/components/nora/card";
import { useProject } from "@/components/project/use-project";
import { AUDIENCE_LABEL, TARGET_KIND_LABEL } from "@/lib/mock/interpretation";
import { PROMPT_TEMPLATES } from "@/lib/mock/templates";
import { cx } from "@/utils/cx";

const th = "px-6 py-2 text-left text-xs font-medium text-ink-3";

export default function PromptTemplatesPage() {
  const ctx = useProject();
  const [openKey, setOpenKey] = useState<string | null>(null);
  if (!ctx) return null;
  // PROMPT_TEMPLATES sudah berurutan menurut urutan TARGET_KIND_LABEL lalu audiens
  return (
    <div className="flex flex-col gap-4">
      <Link href={`/projects/${ctx.project.id}/interpretations`} className="inline-flex items-center gap-1 self-start text-sm text-ink-2 hover:text-ink">
        <ArrowLeft size={14} aria-hidden className="shrink-0" /> Interpretasi
      </Link>
      <div>
        <h2 className="text-[20px] leading-7 font-semibold tracking-[-0.02em]">Templat prompt</h2>
        <p className="text-sm text-ink-3">Peran dan aturan yang dipakai model untuk tiap jenis target dan audiens. Hanya baca.</p>
      </div>
      <Card>
        <table className="w-full border-collapse" aria-label="Templat prompt">
          <thead>
            <tr className="border-b border-line">
              <th scope="col" className={th}>JENIS TARGET</th>
              <th scope="col" className={th}>AUDIENS</th>
              <th scope="col" className={th}>VERSI</th>
              <th scope="col" className={th}>MODEL</th>
            </tr>
          </thead>
          <tbody>
            {PROMPT_TEMPLATES.map((t) => {
              const key = `${t.kind}:${t.audience}`;
              const expanded = openKey === key;
              return (
                <Fragment key={key}>
                  <tr className="border-b border-line last:border-0">
                    <td className="px-6 py-2 text-sm font-medium text-ink">
                      <button type="button" id={`tpl-btn-${key}`} aria-expanded={expanded} aria-controls={`tpl-panel-${key}`} onClick={() => setOpenKey(expanded ? null : key)} className="inline-flex items-center gap-2 hover:underline">
                        <CaretDown size={12} aria-hidden className={cx("text-ink-3 transition-transform", !expanded && "-rotate-90")} />
                        {TARGET_KIND_LABEL[t.kind]}
                      </button>
                    </td>
                    <td className="px-6 py-2 text-sm whitespace-nowrap text-ink-2">{AUDIENCE_LABEL[t.audience]}</td>
                    <td className="px-6 py-2 text-sm whitespace-nowrap text-ink-2">{t.version}</td>
                    <td className="px-6 py-2 text-sm whitespace-nowrap text-ink-2">model-tiruan</td>
                  </tr>
                  {expanded && (
                    <tr className="border-b border-line bg-sidebar">
                      <td colSpan={4} id={`tpl-panel-${key}`} className="px-6 py-3 text-sm">
                        <p className="font-medium text-ink">Peran</p>
                        <p className="mb-3 text-ink-2">{t.role}</p>
                        <p className="font-medium text-ink">Aturan</p>
                        <ul className="list-disc pl-5 text-ink-2">{t.rules.map((r) => <li key={r}>{r}</li>)}</ul>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
