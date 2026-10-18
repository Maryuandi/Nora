import { SpecView } from "@/components/project/spec-view";
import type { TaskKind } from "@/lib/mock/types";

const TASKS: TaskKind[] = ["relevansi", "aktivitas", "catatan"];

export default async function SpecsPage({ searchParams }: { searchParams: Promise<{ task?: string | string[] }> }) {
  const { task } = await searchParams;
  const t = TASKS.find((x) => x === task) ?? "relevansi";
  return <SpecView key={t} task={t} />;
}
