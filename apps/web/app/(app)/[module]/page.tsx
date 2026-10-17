import { notFound } from "next/navigation";
import { MODULES } from "@/lib/modules";

export default async function ModulePage({ params }: { params: Promise<{ module: string }> }) {
  const { module: id } = await params;
  const mod = MODULES.find((m) => m.id === id);
  if (!mod) notFound();
  return (
    <main>
      <h1>
        {mod.id.toUpperCase()} - {mod.title}
      </h1>
      <p>PRD: {mod.prdFile}</p>
    </main>
  );
}
