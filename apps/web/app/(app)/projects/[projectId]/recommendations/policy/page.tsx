"use client";

import { PolicyEditor } from "@/components/project/policy-editor";
import { RecTabs } from "@/components/project/rec-tabs";

export default function PolicyPage() {
  return (
    <div className="flex flex-col gap-4">
      <RecTabs active="/recommendations/policy" />
      <PolicyEditor />
    </div>
  );
}
