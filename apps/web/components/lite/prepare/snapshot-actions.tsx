"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/base/buttons/button";
import { useTRPC } from "@/lib/trpc/client";
import { attempt, errorText } from "../api";

export function SnapshotReviewActions({ projectId, snapshotId, canApprove }: { projectId: string; snapshotId: string; canApprove: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const review = useMutation(useTRPC().snapshots.review.mutationOptions());
  async function act(action: "approve" | "cancel") {
    setBusy(action);
    const res = await attempt(review.mutateAsync({ projectId, snapshotId, action }));
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
