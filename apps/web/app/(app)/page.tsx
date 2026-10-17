import { ProjectList } from "@/components/screens/project-list";
import type { ProjectStatus } from "@/lib/mock/types";

const STATUSES: ProjectStatus[] = ["draft", "aktif", "ditangguhkan", "berakhir", "diarsipkan"];

export default async function Home({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  return <ProjectList status={STATUSES.includes(status as ProjectStatus) ? (status as ProjectStatus) : null} />;
}
