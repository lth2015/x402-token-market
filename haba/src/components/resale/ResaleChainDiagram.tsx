import { ArrowDown, ArrowRight } from "lucide-react";
import { resaleChainNarrative } from "@/lib/haba";
import { cn } from "@/lib/utils";

/**
 * HABA AI Advisor 合作链路图 — 显示 HABA → 4 个合作方。
 * 数据形状来自 `resaleChainNarrative.chainDiagram`，方便统一编辑。
 */
export function ResaleChainDiagram() {
  const { nodes } = resaleChainNarrative.chainDiagram;
  const nodeMap = Object.fromEntries(nodes.map((n) => [n.id, n]));
  const partners = ["pharmacy", "hospital", "dietitian", "ec"] as const;

  return (
    <div className="rounded-2xl border border-border-subtle bg-surface-base p-8 shadow-e1">
      {/* HABA */}
      <ChainNode tone="haba" label={nodeMap.haba.label} sub={nodeMap.haba.sub} />

      {/* Fan-out arrow */}
      <div className="mt-4 flex justify-center">
        <ArrowDown className="h-5 w-5 text-brand-primary" aria-hidden />
      </div>
      <p className="mt-1 text-center text-caption text-ink-secondary">
        按调用量打包 · 合作方按月度 Token 配额预付
      </p>

      {/* 4 partner row */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {partners.map((id) => (
          <div
            key={id}
            className="rounded-xl border border-border-subtle bg-surface-muted px-3 py-3 text-center"
          >
            <p className="text-small font-medium text-brand-ink">{nodeMap[id].label}</p>
            <p className="mt-1 text-caption text-ink-tertiary">{nodeMap[id].sub}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function ChainNode({
  label,
  sub,
  tone,
}: {
  label: string;
  sub: string;
  tone: "muted" | "haba";
}) {
  return (
    <div
      className={cn(
        "mx-auto max-w-md rounded-xl border px-4 py-3 text-center shadow-e1",
        tone === "muted" && "border-border-subtle bg-surface-muted",
        tone === "haba" && "border-actor-haba/30 bg-actor-haba/5",
      )}
    >
      <p
        className={cn(
          "text-body font-semibold",
          tone === "muted" && "text-ink-secondary",
          tone === "haba" && "text-actor-haba",
        )}
      >
        {label}
      </p>
      <p className="mt-0.5 text-caption text-ink-tertiary">{sub}</p>
    </div>
  );
}

/** "Sideways" inline version used in dense home-page summary. */
export function ResaleChainDiagramInline() {
  return (
    <div className="flex flex-wrap items-center gap-2 text-caption">
      <span className="rounded-full bg-actor-haba/10 px-2.5 py-1 font-medium text-actor-haba">
        HABA AI Advisor
      </span>
      <ArrowRight className="h-3 w-3 text-ink-tertiary" aria-hidden />
      <span className="text-ink-tertiary">药局 · 医院 · 营养师 · 合作电商</span>
    </div>
  );
}
