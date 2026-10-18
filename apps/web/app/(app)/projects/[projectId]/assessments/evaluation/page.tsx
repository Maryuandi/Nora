import { EvaluationView } from "@/components/project/evaluation-view";

export default async function EvaluationPage({ searchParams }: { searchParams: Promise<{ task?: string | string[] }> }) {
  const { task } = await searchParams;
  const t = task === "relevansi" || task === "catatan" ? task : "aktivitas";
  return <EvaluationView key={t} task={t} />;
}
