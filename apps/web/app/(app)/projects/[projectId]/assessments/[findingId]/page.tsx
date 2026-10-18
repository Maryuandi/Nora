import { FindingView } from "@/components/project/finding-view";

export default async function FindingPage({ params, searchParams }: { params: Promise<{ findingId: string }>; searchParams: Promise<{ kandidat?: string | string[] }> }) {
  const { findingId } = await params;
  const { kandidat } = await searchParams;
  return <FindingView key={findingId} findingId={findingId} kandidat={typeof kandidat === "string" ? kandidat : null} />;
}
