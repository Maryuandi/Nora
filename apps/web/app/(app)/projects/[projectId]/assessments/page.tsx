import { AssessmentList } from "@/components/project/assessment-list";

export default async function AssessmentsPage({ searchParams }: { searchParams: Promise<{ tab?: string | string[] }> }) {
  const { tab } = await searchParams;
  return <AssessmentList tab={tab === "antrean" ? "antrean" : "temuan"} />;
}
