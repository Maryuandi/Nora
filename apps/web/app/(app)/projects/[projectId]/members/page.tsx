"use client";

import { useState } from "react";
import { Copy, DotsThreeVertical, Plus } from "@phosphor-icons/react";
import { Button } from "@/components/base/buttons/button";
import { Dropdown } from "@/components/base/dropdown/dropdown";
import { Input } from "@/components/base/input/input";
import { Select } from "@/components/base/select/select";
import { Table } from "@/components/application/table/table";
import { UserAvatar } from "@/components/nora/avatar";
import { ROLE_LABEL } from "@/components/nora/badges";
import { Banner } from "@/components/nora/banner";
import { Card } from "@/components/nora/card";
import { NoraModal } from "@/components/nora/modal";
import { useProject } from "@/components/project/use-project";
import { fieldErrors, type FieldErrors } from "@/lib/form-errors";
import { formatDate } from "@/lib/format";
import { memberSchema } from "@/lib/mock/schemas";
import type { Role } from "@/lib/mock/types";

const ROLES: Role[] = ["administrator", "analis", "pemilik_proses"];
const ROLE_ITEMS = ROLES.map((r) => ({ id: r, label: ROLE_LABEL[r] }));

function AddMemberModal({ open, onClose, projectId }: { open: boolean; onClose: () => void; projectId: string }) {
  const ctx = useProject()!;
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("analis");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [confirmRole, setConfirmRole] = useState<Role | null>(null);
  const [link, setLink] = useState<string | null>(null);

  const reset = () => { setEmail(""); setRole("analis"); setErrors({}); setConfirmRole(null); setLink(null); onClose(); };

  function submit() {
    const parsed = memberSchema.safeParse({ email, role });
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    const user = ctx.state.users.find((u) => u.email.toLowerCase() === parsed.data.email.toLowerCase());
    const existing = user && ctx.state.memberships.find((m) => m.projectId === projectId && m.userId === user.id);
    if (existing && existing.role !== role && confirmRole !== existing.role) return setConfirmRole(existing.role);
    if (existing && existing.role === role) return setErrors({ email: "Pengguna ini sudah menjadi anggota dengan peran yang sama" });
    const error = ctx.dispatch({ type: "addMember", projectId, email: parsed.data.email, role });
    if (error) return setErrors({ email: error });
    if (existing) return reset();
    // Mock activation link; email delivery is Phase 2 (PRD M01 Fitur 2).
    setLink(`${location.origin}/activate?token=${btoa(parsed.data.email).replace(/=+$/, "")}`);
  }

  if (link)
    return (
      <NoraModal open={open} onClose={reset} title="Anggota ditambahkan" description="Bagikan tautan aktivasi ini. Email undangan belum dikirim otomatis."
        footer={<Button color="primary" size="sm" onClick={reset}>Selesai</Button>}>
        <div className="flex items-center gap-2 rounded-lg border border-line bg-canvas px-3 py-2 text-sm">
          <span className="min-w-0 flex-1 truncate font-mono text-xs">{link}</span>
          <Button color="secondary" size="xs" iconLeading={Copy} onClick={() => navigator.clipboard?.writeText(link)}>Salin</Button>
        </div>
      </NoraModal>
    );

  return (
    <NoraModal open={open} onClose={reset} title="Tambah anggota" description="Anggota hanya bisa melihat proyek ini sesuai perannya."
      footer={<>
        <Button color="secondary" size="sm" onClick={reset}>Batal</Button>
        <Button color="primary" size="sm" onClick={submit}>{confirmRole ? "Ubah peran" : "Tambah anggota"}</Button>
      </>}>
      <Input label="Email" placeholder="nama@perusahaan.co.id" value={email} onChange={(v) => { setEmail(v); setErrors({}); setConfirmRole(null); }} isInvalid={!!errors.email} hint={errors.email} />
      <Select label="Peran" items={ROLE_ITEMS} selectedKey={role} onSelectionChange={(k) => { setRole(k as Role); setConfirmRole(null); }}>
        {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
      </Select>
      {confirmRole && (
        <Banner tone="warning">Pengguna ini sudah menjadi {ROLE_LABEL[confirmRole]}. Ubah perannya menjadi {ROLE_LABEL[role]}?</Banner>
      )}
    </NoraModal>
  );
}

export default function MembersPage() {
  const ctx = useProject();
  const [adding, setAdding] = useState(false);
  const [revoke, setRevoke] = useState<{ userId: string; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!ctx) return null;
  const { project, state, can, dispatch } = ctx;
  const manage = can("member.manage", project.id);

  const rows = state.memberships
    .filter((m) => m.projectId === project.id)
    .map((m) => ({ ...m, user: state.users.find((u) => u.id === m.userId)! }));

  const run = (e: string | undefined) => setError(e ?? null);

  return (
    <div className="flex flex-col gap-4">
      {error && <Banner tone="warning">{error}</Banner>}
      <Card>
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold">Anggota proyek</h2>
            <p className="text-sm text-ink-3">{manage ? "Hanya anggota yang bisa membuka data proyek ini." : "Hanya Administrator yang bisa mengubah anggota."}</p>
          </div>
          {manage && <Button color="primary" size="sm" iconLeading={Plus} onClick={() => setAdding(true)}>Tambah anggota</Button>}
        </div>
        <Table aria-label="Anggota proyek" size="sm">
          <Table.Header>
            <Table.Head id="name" isRowHeader label="NAMA" className="w-full" />
            <Table.Head id="added" label="DITAMBAHKAN" />
            <Table.Head id="status" label="STATUS" />
            <Table.Head id="actions" label="" />
          </Table.Header>
          <Table.Body>
            {ROLES.flatMap((role) => {
              const group = rows.filter((r) => r.role === role);
              if (!group.length) return [];
              return [
                <Table.Row key={`g-${role}`} id={`g-${role}`} className="h-9 bg-canvas hover:bg-canvas">
                  <Table.Cell className="px-6 text-sm font-medium text-ink-2">{ROLE_LABEL[role]} <span className="ml-1 text-ink-3">{group.length}</span></Table.Cell>
                  <Table.Cell />
                  <Table.Cell />
                  <Table.Cell />
                </Table.Row>,
                ...group.map((r) => (
                  <Table.Row key={r.userId} id={r.userId}>
                    <Table.Cell className="px-6">
                      <span className="flex items-center gap-3">
                        <UserAvatar name={r.user.name} size="sm" />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium text-ink">{r.user.name}</span>
                          <span className="block truncate text-xs text-ink-3">{r.user.email}</span>
                        </span>
                      </span>
                    </Table.Cell>
                    <Table.Cell className="px-6 text-sm whitespace-nowrap text-ink-2">{formatDate(r.addedAt)}</Table.Cell>
                    <Table.Cell className="px-6 text-sm whitespace-nowrap text-ink-2">{r.user.pending ? "Tertunda" : "Aktif"}</Table.Cell>
                    <Table.Cell className="px-4">
                      {manage && (
                        <Dropdown.Root>
                          <Button color="tertiary" size="xs" iconLeading={DotsThreeVertical} aria-label={`Aksi untuk ${r.user.name}`} />
                          <Dropdown.Popover>
                            <Dropdown.Menu
                              onAction={(key) => {
                                if (key === "revoke") return setRevoke({ userId: r.userId, name: r.user.name });
                                run(dispatch({ type: "changeMemberRole", projectId: project.id, userId: r.userId, role: key as Role }));
                              }}
                            >
                              {ROLES.filter((x) => x !== r.role).map((x) => (
                                <Dropdown.Item key={x} id={x} label={`Jadikan ${ROLE_LABEL[x]}`} />
                              ))}
                              <Dropdown.Separator />
                              <Dropdown.Item id="revoke" label="Cabut akses" />
                            </Dropdown.Menu>
                          </Dropdown.Popover>
                        </Dropdown.Root>
                      )}
                    </Table.Cell>
                  </Table.Row>
                )),
              ];
            })}
          </Table.Body>
        </Table>
      </Card>

      <AddMemberModal open={adding} onClose={() => setAdding(false)} projectId={project.id} />
      <NoraModal
        open={!!revoke}
        onClose={() => setRevoke(null)}
        title="Cabut akses?"
        description={revoke ? `${revoke.name} tidak akan bisa membuka proyek ini lagi mulai request berikutnya.` : undefined}
        footer={<>
          <Button color="secondary" size="sm" onClick={() => setRevoke(null)}>Batal</Button>
          <Button color="primary-destructive" size="sm" onClick={() => { run(dispatch({ type: "removeMember", projectId: project.id, userId: revoke!.userId })); setRevoke(null); }}>Cabut akses</Button>
        </>}
      />
    </div>
  );
}
