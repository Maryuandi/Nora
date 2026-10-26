import { notFound } from "next/navigation";
import { Buildings } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/base/buttons/button";
import { NewProjectForm } from "@/components/lite/project-forms";
import { EmptyState } from "@/components/lite/ui";
import { PageHeader } from "@/components/shell/page-header";
import { currentViewer } from "@/lib/lite/auth";
import { listClients } from "@/lib/lite/projects";

export const metadata = { title: "Buat proyek" };

export default async function NewProjectPage() {
  const viewer = await currentViewer();
  if (viewer?.globalRole !== "admin") notFound();
  const clients = await listClients(viewer);
  return (
    <>
      <PageHeader title="Buat proyek" eyebrow="Proyek" />
      {clients.length === 0 ? (
        <div className="px-8 py-6">
          <EmptyState icon={Buildings} title="Belum ada klien" action={<Button color="primary" size="xs" href="/clients/new">Tambah klien</Button>}>
            Setiap proyek terikat pada satu klien. Tambahkan klien terlebih dahulu.
          </EmptyState>
        </div>
      ) : (
        <NewProjectForm clients={clients} />
      )}
    </>
  );
}
