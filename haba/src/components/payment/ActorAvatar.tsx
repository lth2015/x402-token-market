import type { PaymentActorKind } from "@/lib/haba";
import { cn } from "@/lib/utils";

/**
 * Color-coded pill for payment-flow actors. Labels are consumer-neutral
 * (支付通道 / 结算层 / 公链) — the upstream vendor identities are not
 * surfaced on the HABA consumer site.
 */
const ACTOR_LABEL: Record<PaymentActorKind, string> = {
  haba:     "HABA",
  gateway:  "支付通道",
  settler:  "结算层",
  chain:    "公链",
  customer: "消费者",
};

const ACTOR_DOT: Record<PaymentActorKind, string> = {
  haba:     "bg-actor-haba",
  gateway:  "bg-actor-gateway",
  settler:  "bg-actor-settler",
  chain:    "bg-actor-chain",
  customer: "bg-actor-customer",
};

export function ActorAvatar({
  actor,
  size = "sm",
  emphasized = false,
  className,
}: {
  actor: PaymentActorKind;
  size?: "sm" | "lg";
  emphasized?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full font-medium",
        size === "sm" && "px-2 py-0.5 text-caption",
        size === "lg" && "px-3 py-1 text-small",
        emphasized
          ? "bg-surface-base text-brand-ink shadow-e1 ring-1 ring-border-default"
          : "bg-surface-muted text-ink-secondary",
        className,
      )}
    >
      <span className={cn("inline-block h-2 w-2 rounded-full", ACTOR_DOT[actor])} aria-hidden />
      {ACTOR_LABEL[actor]}
    </span>
  );
}
