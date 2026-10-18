import { notFound } from "next/navigation";
import { ClientForm } from "@/components/lite/project-forms";
import { PageHeader } from "@/components/shell/page-header";
import { currentViewer } from "@/lib/lite/auth";

export const metadata = { title: "Tambah klien" };

export default async function NewClientPage() {
  if ((await currentViewer())?.globalRole !== "admin") notFound();
  return (
    <>
      <PageHeader title="Tambah klien" eyebrow="Proyek" />
      <ClientForm />
    </>
  );
}
