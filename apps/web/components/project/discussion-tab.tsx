import { Card } from "@/components/nora/card";

// Placeholder; diganti pada Task 11-12.
export function DiscussionTab({ investigationId }: { investigationId: string }) {
  return <Card className="p-6 text-sm text-ink-3" data-investigation={investigationId}>Segera hadir</Card>;
}
