import { ClassificationView } from "@/components/project/classification-view";

export default async function ClassificationPage({ searchParams }: { searchParams: Promise<{ task?: string | string[] }> }) {
  const { task } = await searchParams;
  return <ClassificationView key={task === "catatan" ? "catatan" : "aktivitas"} task={task === "catatan" ? "catatan" : "aktivitas"} />;
}
