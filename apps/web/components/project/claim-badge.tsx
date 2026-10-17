import { ChatText, Question, Ruler, SealCheck } from "@phosphor-icons/react";
import { Pill } from "@/components/nora/badges";
import { CLAIM_TYPE_LABEL } from "@/lib/mock/interpretation";
import type { ClaimType } from "@/lib/mock/types";

const META = {
  fakta_terukur: { icon: Ruler, tone: "text-status-active" },
  interpretasi: { icon: ChatText, tone: "text-accent" },
  hipotesis: { icon: Question, tone: "text-status-suspended" },
  rekomendasi_tervalidasi: { icon: SealCheck, tone: "text-accent" },
} as const;

export function ClaimBadge({ type }: { type: ClaimType }) {
  const { icon: I, tone } = META[type];
  return (
    <Pill>
      <I size={14} weight="fill" className={tone} aria-hidden />
      {CLAIM_TYPE_LABEL[type]}
    </Pill>
  );
}
