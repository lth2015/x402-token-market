/**
 * EcosystemFlowCard — dark-themed vertical flow card showing the 3-party
 * infrastructure that powers HABA AI Commerce:
 *
 *   HABA (AI Commerce · 上市)
 *      ↓ x402 USDC Token
 *   支払協議 (Netstars x402 · 上市)
 *      ↓ SPL TransferChecked
 *   Solana USDC (Top-10 公链)
 *
 * Pure server component — animations are CSS-only (globals.css keyframes).
 * Deliberately dark (#0B3D2E forest) so it pops on the cream hero background.
 */
import { Building2, Globe, Layers3, ArrowDown } from "lucide-react";
import type { LucideIcon } from "lucide-react";

// ── Actor node ────────────────────────────────────────────────────────────
function EcosystemNode({
  Icon,
  name,
  role,
  tag,
  tagColor,
  delayClass,
}: {
  Icon: LucideIcon;
  name: string;
  role: string;
  tag: string;
  tagColor: "emerald" | "sky" | "violet";
  delayClass: string;
}) {
  const tagStyles: Record<string, string> = {
    emerald: "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/25",
    sky:     "bg-sky-500/15     text-sky-300     ring-1 ring-sky-500/25",
    violet:  "bg-violet-500/15  text-violet-300  ring-1 ring-violet-500/25",
  };

  return (
    <div
      className={`flex items-start gap-3 rounded-xl border border-white/8 bg-white/5 px-4 py-3.5 animate-fade-up ${delayClass}`}
    >
      {/* Icon circle */}
      <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/10">
        <Icon className="h-4 w-4 text-white/80" />
      </div>

      {/* Text */}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] font-semibold leading-none text-white">
            {name}
          </span>
          <span
            className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest ${tagStyles[tagColor]}`}
          >
            {tag}
          </span>
        </div>
        <p className="mt-1 text-[11px] leading-relaxed text-white/45">{role}</p>
      </div>

      {/* Live indicator */}
      <div className="relative mt-1.5 flex h-2 w-2 shrink-0 items-center justify-center">
        <span className="animate-pulse-ring absolute inline-block h-2 w-2 rounded-full bg-emerald-400/40" />
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
      </div>
    </div>
  );
}

// ── Connector between nodes ────────────────────────────────────────────────
function FlowConnector({ label, delayClass }: { label: string; delayClass: string }) {
  return (
    <div className={`flex items-center gap-3 px-5 py-1 animate-fade-up ${delayClass}`}>
      {/* Left side: icon + traveling dot column */}
      <div className="relative flex w-9 shrink-0 flex-col items-center">
        <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-gradient-to-b from-white/15 via-white/30 to-white/15" />
        {/* Traveling dot */}
        <div className="relative h-5 overflow-hidden">
          <span className="animate-flow-dot absolute left-1/2 inline-block h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-brand-primary" />
        </div>
      </div>

      {/* Protocol label */}
      <span className="rounded bg-white/5 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-white/30">
        {label}
      </span>

      <ArrowDown className="ml-auto h-3 w-3 shrink-0 text-white/15" aria-hidden />
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────
export function EcosystemFlowCard() {
  return (
    <div
      aria-label="AI Commerce 基础设施 — 三方协作流程"
      className="overflow-hidden rounded-2xl border border-brand-ink/20 bg-brand-ink shadow-e3"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/8 px-5 py-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">
            AI Commerce 基础设施
          </p>
          <p className="mt-0.5 text-[11px] text-white/50">三方实时协作 · 端到端 &lt; 1s</p>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="animate-breathe inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
          <span className="text-[10px] text-emerald-400/80">全节点 就绪</span>
        </div>
      </div>

      {/* Flow nodes */}
      <div className="px-4 py-4 space-y-0.5">
        <EcosystemNode
          Icon={Building2}
          name="HABA / ハーバー研究所"
          role="AI 商品顾问 · MARVIE 商户"
          tag="上市企業"
          tagColor="emerald"
          delayClass="animate-fade-up-delay-1"
        />

        <FlowConnector label="x402 · Token · USDC" delayClass="animate-fade-up-delay-2" />

        <EcosystemNode
          Icon={Layers3}
          name="支付协议 / 決済ゲートウェイ"
          role="x402 Protocol · Token 经济体系"
          tag="上市企業"
          tagColor="sky"
          delayClass="animate-fade-up-delay-2"
        />

        <FlowConnector label="SPL TransferChecked" delayClass="animate-fade-up-delay-3" />

        <EcosystemNode
          Icon={Globe}
          name="Solana USDC"
          role="公链结算层 · Devnet"
          tag="全球 Top-10"
          tagColor="violet"
          delayClass="animate-fade-up-delay-3"
        />
      </div>

      {/* Footer metrics */}
      <div className="grid grid-cols-3 divide-x divide-white/8 border-t border-white/8">
        {[
          { label: "结算层",   value: "Solana" },
          { label: "支付协议", value: "x402"   },
          { label: "代币标准", value: "USDC"   },
        ].map(({ label, value }) => (
          <div key={label} className="px-4 py-3 text-center">
            <p className="text-[9px] uppercase tracking-wider text-white/30">{label}</p>
            <p className="mt-0.5 text-[11px] font-semibold text-white/70">{value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
