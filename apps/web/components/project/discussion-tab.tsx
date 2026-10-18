"use client";

import { useState } from "react";
import { Button } from "@/components/base/buttons/button";
import { NativeSelect } from "@/components/base/select/select-native";
import { TextArea } from "@/components/base/textarea/textarea";
import { UserAvatar } from "@/components/nora/avatar";
import { Pill } from "@/components/nora/badges";
import { Banner } from "@/components/nora/banner";
import { Card } from "@/components/nora/card";
import { linkTitle } from "@/components/project/link-object-modal";
import { useProject } from "@/components/project/use-project";
import { formatDateTime } from "@/lib/format";
import { LINK_KIND_LABEL, splitMentions } from "@/lib/mock/investigation";
import { acceptsData } from "@/lib/mock/permissions";

function CommentBox({ label, targets, onSend }: { label: string; targets?: { label: string; value: string }[]; onSend: (body: string, targetLinkId?: string) => string | undefined }) {
  const [body, setBody] = useState("");
  const [target, setTarget] = useState("");
  const [error, setError] = useState<string | undefined>();
  function send() {
    const err = onSend(body, target || undefined);
    setError(err);
    if (!err) { setBody(""); setTarget(""); }
  }
  return (
    <div className="flex flex-col gap-2">
      {error && <Banner tone="warning">{error}</Banner>}
      {targets && <NativeSelect label="Tujuan" size="sm" value={target} onChange={(e) => setTarget(e.target.value)} options={targets} />}
      <TextArea aria-label={label} placeholder={label} rows={2} value={body} onChange={setBody} />
      <div><Button color="primary" size="xs" onClick={send} isDisabled={!body.trim()}>Kirim</Button></div>
    </div>
  );
}

export function DiscussionTab({ investigationId }: { investigationId: string }) {
  const p = useProject();
  const [showResolved, setShowResolved] = useState(false);
  const [error, setError] = useState<string | undefined>();
  if (!p) return null;
  const { state, dispatch, can, viewer, project } = p;
  const inv = state.investigations.find((i) => i.id === investigationId);
  if (!inv) return null;
  const comments = state.comments.filter((c) => c.investigationId === inv.id);
  const links = state.links.filter((l) => l.investigationId === inv.id);
  const mayComment = can("comment.add", project.id) && acceptsData(project.status);
  const isAnalis = can("note.add", project.id);
  const nameOf = (id: string) => state.users.find((u) => u.id === id)?.name ?? "Pengguna";
  const linkLabel = (l: (typeof links)[number]) => `${LINK_KIND_LABEL[l.kind]}: ${linkTitle(state, project.id, l)}`;
  const targetLabel = (id: string | null) => {
    const l = links.find((x) => x.id === id);
    return l ? linkLabel(l) : "Workspace";
  };
  const send = (parentId?: string) => (body: string, targetLinkId?: string) =>
    dispatch({ type: "addComment", investigationId: inv.id, body, parentId, targetLinkId: parentId ? undefined : targetLinkId });

  const roots = comments.filter((c) => !c.parentId);
  const shown = roots.filter((c) => showResolved || !c.resolved);
  const hiddenCount = roots.length - roots.filter((c) => !c.resolved).length;

  return (
    <div className="flex flex-col gap-4">
      {error && <Banner tone="warning">{error}</Banner>}
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-ink">Diskusi</h2>
        {hiddenCount > 0 && (
          <Button color="secondary" size="xs" onClick={() => setShowResolved((v) => !v)}>
            {showResolved ? "Sembunyikan yang selesai" : `Tampilkan selesai dibahas (${hiddenCount})`}
          </Button>
        )}
      </div>
      {mayComment && (
        <Card className="p-4">
          <CommentBox label="Mulai utas baru, sebut dengan @nama" onSend={send()}
            targets={[{ label: "Workspace", value: "" }, ...links.map((l) => ({ label: linkLabel(l), value: l.id }))]} />
        </Card>
      )}
      {shown.length ? shown.map((c) => {
        const replies = comments.filter((r) => r.parentId === c.id);
        const render = (x: typeof c) => (
          <div key={x.id} className="flex gap-3">
            <UserAvatar name={nameOf(x.createdBy)} />
            <div className="min-w-0 flex-1">
              <p className="text-xs text-ink-3"><span className="font-medium text-ink">{nameOf(x.createdBy)}</span> · {formatDateTime(x.createdAt)}</p>
              <p className="mt-0.5 whitespace-pre-wrap text-sm text-ink-2">
                {splitMentions(x.body).map((s, i) => (s.mention ? <strong key={i} className="font-semibold text-ink">{s.text}</strong> : <span key={i}>{s.text}</span>))}
              </p>
            </div>
          </div>
        );
        return (
          <Card key={c.id} className="flex flex-col gap-3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-xs text-ink-3">Tujuan: {targetLabel(c.targetLinkId)}{c.resolved && <Pill dot="bg-status-active">Selesai dibahas</Pill>}</span>
              {mayComment && (isAnalis || c.createdBy === viewer.id) && (
                <Button color="secondary" size="xs" onClick={() => setError(dispatch({ type: "resolveComment", commentId: c.id, resolved: !c.resolved }))}>
                  {c.resolved ? "Buka lagi" : "Tandai selesai dibahas"}
                </Button>
              )}
            </div>
            {render(c)}
            {replies.length > 0 && <div className="ml-9 flex flex-col gap-3 border-l border-line pl-4">{replies.map(render)}</div>}
            {mayComment && !c.resolved && <div className="ml-9"><CommentBox label="Balas" onSend={send(c.id)} /></div>}
          </Card>
        );
      }) : <Card className="px-4 py-8 text-center text-sm text-ink-3">Belum ada diskusi.</Card>}
    </div>
  );
}
