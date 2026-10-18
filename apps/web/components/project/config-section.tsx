"use client";

import { useState } from "react";
import { Plus, Scales } from "@phosphor-icons/react";
import { Button } from "@/components/base/buttons/button";
import { Card } from "@/components/nora/card";
import { ConfigEditor } from "@/components/project/config-editor";
import { ConfigBadges, ConfigStatusActions } from "@/components/project/config-ui";
import { useProject } from "@/components/project/use-project";
import { CONFIG_KIND_LABEL, configSummary, latestConfigs } from "@/lib/mock/configs";
import { formatDate } from "@/lib/format";
import { acceptsData } from "@/lib/mock/permissions";
import { configsForProject } from "@/lib/mock/reducer";
import type { ConfigKind } from "@/lib/mock/types";
import type { UiAction } from "@/lib/mock/permissions";

/**
 * Lists the latest version of every configuration of one kind, with review actions and an inline editor.
 * `single`: at most one per project (the kind's key is fixed), so the add button only shows while empty.
 */
export function ConfigSection({ kind, single = false, editAction = "config.edit", title, children }: { kind: ConfigKind; single?: boolean; editAction?: UiAction; title?: string; children?: React.ReactNode }) {
  const ctx = useProject();
  const [editing, setEditing] = useState<string | "new" | null>(null);
  if (!ctx) return null;
  const { project, state, can } = ctx;
  const items = latestConfigs(configsForProject(state, project.id).filter((c) => c.data.kind === kind));
  const open = acceptsData(project.status);
  const mayWrite = can(editAction, project.id) && open;
  const label = CONFIG_KIND_LABEL[kind];
  const user = (id?: string) => (id && state.users.find((u) => u.id === id)?.name) || "-";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-ink">{title ?? label}</h2>
        {mayWrite && editing === null && (!single || items.length === 0) && (
          <Button size="xs" color="secondary" iconLeading={Plus} onClick={() => setEditing("new")}>{single ? `Siapkan ${label.toLowerCase()}` : "Tambah"}</Button>
        )}
      </div>
      {children}
      {editing === "new" && <ConfigEditor projectId={project.id} kind={kind} onClose={() => setEditing(null)} />}
      {items.length === 0 && editing !== "new" && (
        <Card className="flex flex-col items-center gap-2 px-4 py-8 text-center">
          <Scales size={24} className="text-ink-3" aria-hidden />
          <p className="text-sm text-ink-2">Belum ada {label.toLowerCase()}</p>
        </Card>
      )}
      {items.map((c) =>
        editing === c.key ? (
          <ConfigEditor key={c.id} projectId={project.id} kind={kind} initial={c} onClose={() => setEditing(null)} />
        ) : (
          <Card key={c.id} className="flex flex-col gap-3 px-4 py-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex flex-col gap-1.5">
                <p className="text-sm font-medium break-words text-ink">{c.name}</p>
                <ConfigBadges config={c} />
              </div>
              {mayWrite && c.status !== "usang" && <Button size="xs" color="secondary" onClick={() => setEditing(c.key)}>Ubah</Button>}
            </div>
            <p className="text-sm break-words text-ink-2">{configSummary(c.data)}</p>
            <p className="text-xs text-ink-3">Dibuat {formatDate(c.createdAt)} oleh {user(c.createdBy)}{c.approvedBy ? ` · disetujui ${user(c.approvedBy)} ${formatDate(c.approvedAt ?? c.createdAt)}` : ""}</p>
            <ConfigStatusActions config={c} />
          </Card>
        ),
      )}
    </div>
  );
}
