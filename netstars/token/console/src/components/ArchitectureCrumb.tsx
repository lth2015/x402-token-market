"use client";

import { ArrowRight, Cpu, Network, ShoppingBag, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

type Node = {
  key: "haba" | "gateway" | "facilitator" | "solana";
  label: string;
  sub: string;
  url: string | null;
  icon: React.ReactNode;
  brand: "emerald" | "blue" | "violet" | "cyan";
};

const NODES: Node[] = [
  { key: "haba",        label: "HABA",             sub: "consumer site",   url: "http://localhost:3001", icon: <ShoppingBag className="h-4 w-4" />, brand: "emerald" },
  { key: "gateway",     label: "NetStars Gateway", sub: "x402 resource",   url: "http://localhost:3002", icon: <Cpu className="h-4 w-4" />, brand: "blue" },
  { key: "facilitator", label: "Wea Facilitator",  sub: "verify + settle", url: "http://localhost:3003", icon: <Network className="h-4 w-4" />, brand: "violet" },
  { key: "solana",      label: "Solana Devnet",    sub: "USDC settle",     url: "https://explorer.solana.com/?cluster=devnet", icon: <Sparkles className="h-4 w-4" />, brand: "cyan" },
];

export function ArchitectureCrumb({ current }: { current: Node["key"] }) {
  return (
    <div className="border-b border-border-subtle bg-surface-base">
      <div className="flex items-center gap-3 overflow-x-auto px-4 py-2.5 lg:px-6">
        <span className="shrink-0 text-[10px] font-semibold uppercase tracking-widest text-ink-tertiary">
          x402 flow
        </span>
        {NODES.map((node, index) => (
          <div key={node.key} className="flex shrink-0 items-center gap-3">
            <NodeChip node={node} active={node.key === current} />
            {index < NODES.length - 1 && (
              <ArrowRight
                className={cn(
                  "h-3.5 w-3.5",
                  current === node.key || current === NODES[index + 1]?.key
                    ? "text-ink-tertiary"
                    : "text-border-default",
                )}
                aria-hidden
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function NodeChip({ node, active }: { node: Node; active: boolean }) {
  const brandRing = ({ emerald: "ring-emerald-200", blue: "ring-blue-200", violet: "ring-violet-200", cyan: "ring-cyan-200" } as const)[node.brand];
  const brandBg = ({ emerald: "bg-emerald-50", blue: "bg-blue-50", violet: "bg-violet-50", cyan: "bg-cyan-50" } as const)[node.brand];
  const brandText = ({ emerald: "text-emerald-700", blue: "text-blue-700", violet: "text-violet-700", cyan: "text-cyan-700" } as const)[node.brand];
  const brandIcon = ({ emerald: "bg-emerald-500", blue: "bg-blue-500", violet: "bg-violet-500", cyan: "bg-cyan-500" } as const)[node.brand];

  const body = (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-2.5 py-1 transition-colors",
        active
          ? `${brandBg} border-transparent ring-2 ring-offset-1 ring-offset-surface-base ${brandRing} shadow-e1`
          : "border-border-subtle bg-surface-base hover:border-border-default",
      )}
    >
      <span
        className={cn(
          "grid h-5 w-5 place-items-center rounded-full text-white shadow-e1",
          active ? brandIcon : "bg-ink-tertiary",
        )}
      >
        {node.icon}
      </span>
      <span className="flex items-baseline gap-1.5">
        <span className={cn("text-[12px] font-semibold", active ? brandText : "text-ink-secondary")}>
          {node.label}
        </span>
        <span className="hidden text-[10px] text-ink-tertiary sm:inline">· {node.sub}</span>
      </span>
    </div>
  );

  if (active || !node.url) return body;
  return (
    <a href={node.url} target={node.url.startsWith("http://localhost") ? "_self" : "_blank"} rel="noreferrer">
      {body}
    </a>
  );
}
