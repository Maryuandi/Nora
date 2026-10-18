"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Role } from "@nora/authz";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { NativeSelect } from "@/components/base/select/select-native";
import { api, errorText } from "./api";
import { ROLE_LABEL } from "./badges";

const ROLE_OPTIONS = (Object.keys(ROLE_LABEL) as Role[]).map((r) => ({ value: r, label: ROLE_LABEL[r] }));

export function AddMemberForm({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("analyst");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErr, setFieldErr] = useState<Record<string, string>>({});
  const [link, setLink] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setLink(null);
    const res = await api<{ activationUrl: string | null }>(`/projects/${projectId}/members`, { body: { email, name, role } });
    setBusy(false);
    if (!res.ok) {
      setFieldErr(res.error.details ?? {});
      if (!res.error.details) setError(errorText(res.error));
      return;
    }
    setLink(res.data.activationUrl);
    setEmail("");
    setName("");
    router.refresh();
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_180px_auto] sm:items-end">
        <Input label="Email" type="email" value={email} onChange={(v) => { setEmail(v); setFieldErr({}); }} isInvalid={!!fieldErr.email} hint={fieldErr.email} isRequired />
        <Input label="Nama (akun baru)" value={name} onChange={setName} />
        <NativeSelect label="Peran" size="sm" value={role} onChange={(e) => setRole(e.target.value as Role)} options={ROLE_OPTIONS} />
        <Button type="submit" color="primary" size="sm" isLoading={busy}>Tambah</Button>
      </div>
      {error && <p role="alert" className="text-sm text-error-primary">{error}</p>}
      {link && (
        <div role="status" className="rounded-lg border border-brand-200 bg-accent-soft px-3 py-2 text-sm">
          <p className="font-medium text-ink">Tautan aktivasi sekali pakai (berlaku 7 hari)</p>
          <p className="mt-1 text-ink-2">Bagikan tautan ini langsung kepada anggota. Pengiriman email belum tersedia.</p>
          <code className="mt-2 block break-all rounded bg-white px-2 py-1 text-xs text-ink">{link}</code>
        </div>
      )}
    </form>
  );
}

export function MemberRowActions({ projectId, userId, role, email }: { projectId: string; userId: string; role: Role; email: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function changeRole(next: Role) {
    setBusy(true);
    const res = await api(`/projects/${projectId}/members`, { body: { email, role: next } });
    setBusy(false);
    if (!res.ok) return setError(errorText(res.error));
    setError(null);
    router.refresh();
  }
  async function remove() {
    setBusy(true);
    const res = await api(`/projects/${projectId}/members?userId=${userId}`, { method: "DELETE" });
    setBusy(false);
    if (!res.ok) return setError(errorText(res.error));
    router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <NativeSelect aria-label="Peran" size="sm" value={role} disabled={busy} onChange={(e) => changeRole(e.target.value as Role)} options={ROLE_OPTIONS} className="w-40" />
        <Button color="tertiary-destructive" size="xs" isDisabled={busy} onClick={remove}>Hapus</Button>
      </div>
      {error && <p role="alert" className="text-xs text-error-primary">{error}</p>}
    </div>
  );
}
