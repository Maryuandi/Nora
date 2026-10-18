"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/base/buttons/button";
import { api, errorText } from "../api";

export function SnapshotReviewActions({ projectId, snapshotId, canApprove }: { projectId: string; snapshotId: string; canApprove: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function act(action: "approve" | "cancel") {
    setBusy(action);
    const res = await api(`/projects/${projectId}/snapshots/${snapshotId}/review`, { body: { action } });
    setBusy(null);
    if (!res.ok) return setError(errorText(res.error));
    router.refresh();
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      {error && <p role="alert" className="text-sm text-error-primary">{error}</p>}
      <Button color="secondary" size="xs" isLoading={busy === "cancel"} onClick={() => act("cancel")}>Batalkan snapshot</Button>
      {canApprove && <Button color="primary" size="xs" isLoading={busy === "approve"} onClick={() => act("approve")}>Preview sudah benar, setujui</Button>}
    </div>
  );
}
