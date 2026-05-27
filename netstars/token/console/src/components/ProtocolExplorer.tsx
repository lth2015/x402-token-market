"use client";

/**
 * Protocol Explorer — interactive 8-step X402 swim-lane (UX-SPEC §5.7b).
 *
 * Anatomy:
 *   - 4 lanes:  Agent · Netstars X402 · Wea Japan · Solana + USDC
 *   - 8 arrows between lanes, sequenced as a timeline
 *   - Play / Pause / Speed controls
 *   - Recipe selector (only "Token purchase" wired in v0.2)
 *   - Field detail box that updates with the active step
 *   - `aria-live` region announces each step for screen readers
 *
 * Reduced-motion fallback: when prefers-reduced-motion is set, we render all
 * 8 steps statically with no animation, no auto-advance.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Play, Pause, ChevronDown, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

type LaneId = "agent" | "x402" | "wea" | "solana";

const LANES: { id: LaneId; label: string; sub: string; x: number; color: string }[] = [
  { id: "agent",  label: "Agent (SDK)",      sub: "client / customer",    x: 0.08, color: "#2563EB" },
  { id: "x402",   label: "Netstars X402",    sub: "payment gateway",      x: 0.36, color: "#14B8A6" },
  { id: "wea",    label: "Wea Japan",        sub: "settlement custodian", x: 0.64, color: "#8B5CF6" },
  { id: "solana", label: "Solana + USDC",    sub: "L1 settlement",        x: 0.92, color: "#F59E0B" },
];

type Step = {
  n: number;
  from: LaneId;
  to: LaneId;
  label: string;
  detail: string;
  field?: string; // tiny code chip that animates in when this step fires
};

const RECIPES: Record<string, { name: string; steps: Step[]; available: boolean }> = {
  token_purchase: {
    name: "Token purchase",
    available: true,
    steps: [
      { n: 1, from: "agent",  to: "x402",   label: "POST /v1/payments",       detail: "Agent asks the gateway for a payment intent for N USDC.",     field: 'amount_usdc_micro: 10_000_000' },
      { n: 2, from: "x402",   to: "agent",  label: "402 Payment Required",    detail: "Gateway replies with recipient address, nonce, expiry.",      field: 'recipient: "5dH…2hYz" · nonce: "a1b2…"' },
      { n: 3, from: "agent",  to: "x402",   label: "POST /proof  (signed)",   detail: "Agent signs SPL TransferChecked + Memo and submits.",         field: 'signed_tx_base64: "Asw9…"' },
      { n: 4, from: "x402",   to: "wea",    label: "POST /v1/settlements",    detail: "Gateway hands off to Wea for broadcast & confirmation.",      field: 'payment_order_id: "pmt_01HX…"' },
      { n: 5, from: "wea",    to: "solana", label: "submit USDC tx",          detail: "Wea broadcasts via priority RPC node (~220ms avg).",          field: 'rpc: QuickNode-1 · slot: 287_452_991' },
      { n: 6, from: "solana", to: "wea",    label: "tx confirmed",            detail: "Validator returns confirmed status; Wea polls until landed.", field: 'tx_hash: "5KJp…Bd7Q"' },
      { n: 7, from: "wea",    to: "x402",   label: "settled callback",        detail: "Wea calls back X402; X402 calls token-api /internal/credit.", field: 'ledger_entry_id: 1042' },
      { n: 8, from: "x402",   to: "agent",  label: "webhook + 200 OK",        detail: "Gateway notifies the agent; balance now reflects credit.",    field: 'balance_after_token: 10_000_000' },
    ],
  },
  ai_call: {
    name: "AI call",
    available: false,
    steps: [],
  },
  failed_payment: {
    name: "Failed payment",
    available: false,
    steps: [],
  },
  refund: {
    name: "Refund",
    available: false,
    steps: [],
  },
};

const SPEEDS = [0.5, 1, 2, 4] as const;
type Speed = typeof SPEEDS[number];

const STEP_DURATION_MS = 900; // base; divided by speed

function usePrefersReducedMotion(): boolean {
  const [v, setV] = useState(false);
  useEffect(() => {
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    setV(m.matches);
    const fn = () => setV(m.matches);
    m.addEventListener("change", fn);
    return () => m.removeEventListener("change", fn);
  }, []);
  return v;
}

export function ProtocolExplorer({ initialPlaying = true }: { initialPlaying?: boolean }) {
  const reducedMotion = usePrefersReducedMotion();
  const [recipeId, setRecipeId] = useState<keyof typeof RECIPES>("token_purchase");
  const [playing, setPlaying] = useState(initialPlaying);
  const [speed, setSpeed] = useState<Speed>(1);
  const [activeStep, setActiveStep] = useState(0); // 0 = first step "is playing"
  const recipe = RECIPES[recipeId];
  const stepsCount = recipe.steps.length;

  // Tick the active step forward
  useEffect(() => {
    if (reducedMotion) {
      setActiveStep(stepsCount - 1);
      return;
    }
    if (!playing || stepsCount === 0) return;
    const id = setTimeout(() => {
      setActiveStep((s) => (s + 1) % stepsCount);
    }, STEP_DURATION_MS / speed);
    return () => clearTimeout(id);
  }, [playing, activeStep, speed, stepsCount, reducedMotion]);

  const restart = () => {
    setActiveStep(0);
    setPlaying(true);
  };

  const active = recipe.steps[activeStep];

  return (
    <div className="rounded-xl border border-border-subtle bg-surface-base p-6 shadow-e2">
      {/* Controls */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <IconBtn
            onClick={() => setPlaying((p) => !p)}
            disabled={reducedMotion}
            aria-label={playing ? "Pause" : "Play"}
          >
            {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </IconBtn>
          <IconBtn onClick={restart} disabled={reducedMotion} aria-label="Restart">
            <RotateCcw className="h-3.5 w-3.5" />
          </IconBtn>

          <Select
            value={String(speed)}
            onChange={(v) => setSpeed(Number(v) as Speed)}
            disabled={reducedMotion}
            options={SPEEDS.map((s) => ({ value: String(s), label: `${s}× speed` }))}
          />
        </div>

        <Select
          value={recipeId}
          onChange={(v) => {
            if (RECIPES[v as keyof typeof RECIPES].available) {
              setRecipeId(v as keyof typeof RECIPES);
              setActiveStep(0);
            }
          }}
          options={Object.entries(RECIPES).map(([id, r]) => ({
            value: id,
            label: r.available ? `Recipe: ${r.name}` : `Recipe: ${r.name} (Phase 2)`,
            disabled: !r.available,
          }))}
        />
      </div>

      {/* SVG diagram */}
      <Diagram steps={recipe.steps} activeStep={activeStep} reducedMotion={reducedMotion} />

      {/* Active-step caption */}
      <div
        className="mt-4 rounded-lg border border-border-subtle bg-surface-muted/40 px-5 py-4 text-small"
        aria-live="polite"
      >
        {active && (
          <>
            <div className="flex items-baseline gap-3">
              <span className="rounded bg-brand-primary px-2 py-0.5 font-mono text-[12px] font-bold text-white">
                Step {active.n}
              </span>
              <span className="font-mono text-ink-primary">{active.label}</span>
            </div>
            <div className="mt-2 text-ink-secondary">{active.detail}</div>
            {active.field && (
              <code
                className={cn(
                  "mt-3 inline-block rounded bg-surface-base px-2 py-1 font-mono text-[12px] text-brand-primary",
                  !reducedMotion && "animate-slide-in-down",
                )}
                key={`field-${active.n}`}
              >
                {active.field}
              </code>
            )}
          </>
        )}
      </div>

      {reducedMotion && (
        <p className="mt-3 text-caption text-ink-tertiary">
          Reduced-motion mode: animation disabled. All 8 steps shown.
        </p>
      )}
    </div>
  );
}

// ── Diagram (SVG) ─────────────────────────────────────────────────
function Diagram({
  steps,
  activeStep,
  reducedMotion,
}: {
  steps: Step[];
  activeStep: number;
  reducedMotion: boolean;
}) {
  const W = 800;
  const H = 460;
  const HEADER_Y = 36;
  const FIRST_ROW_Y = 88;
  const ROW_GAP = (H - FIRST_ROW_Y - 20) / Math.max(1, steps.length - 1);

  const xOf = (id: LaneId) => (LANES.find((l) => l.id === id)?.x ?? 0) * W;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="X402 protocol sequence">
      {/* Lane headers */}
      {LANES.map((l) => (
        <g key={l.id}>
          <rect
            x={xOf(l.id) - 70}
            y={6}
            width={140}
            height={56}
            rx={8}
            fill="white"
            stroke={l.color}
            strokeWidth={1.5}
          />
          <text x={xOf(l.id)} y={26} textAnchor="middle" fontSize="13" fontWeight="600" fill="#0F172A">
            {l.label}
          </text>
          <text x={xOf(l.id)} y={42} textAnchor="middle" fontSize="11" fill="#94A3B8">
            {l.sub}
          </text>
          {/* Vertical lifeline */}
          <line
            x1={xOf(l.id)}
            x2={xOf(l.id)}
            y1={HEADER_Y + 26}
            y2={H - 8}
            stroke="#E2E8F0"
            strokeWidth={1}
            strokeDasharray="3 3"
          />
        </g>
      ))}

      {/* Arrows + labels */}
      {steps.map((s, i) => {
        const y = FIRST_ROW_Y + i * ROW_GAP;
        const x1 = xOf(s.from);
        const x2 = xOf(s.to);
        const isActive = !reducedMotion && i === activeStep;
        const isPast = !reducedMotion && i < activeStep;
        const opacity = reducedMotion ? 1 : (isActive || isPast ? 1 : 0.32);
        const stroke = isActive ? "#2563EB" : isPast ? "#94A3B8" : "#CBD5E1";
        const labelFill = isActive ? "#2563EB" : "#475569";

        return (
          <g key={i} opacity={opacity}>
            {/* Label above the arrow */}
            <text
              x={(x1 + x2) / 2}
              y={y - 8}
              textAnchor="middle"
              fontSize="11"
              fontFamily="JetBrains Mono, monospace"
              fontWeight={isActive ? 600 : 400}
              fill={labelFill}
            >
              {s.n}.  {s.label}
            </text>
            {/* Arrow line — animated dasharray when active */}
            <line
              x1={x1}
              x2={x2}
              y1={y}
              y2={y}
              stroke={stroke}
              strokeWidth={isActive ? 2.5 : 1.5}
              strokeLinecap="round"
              strokeDasharray={isActive ? "6 6" : undefined}
            >
              {isActive && (
                <animate
                  attributeName="stroke-dashoffset"
                  values={x2 > x1 ? "12;0" : "-12;0"}
                  dur="0.9s"
                  repeatCount="indefinite"
                />
              )}
            </line>
            {/* Arrowhead */}
            <Arrowhead x={x2} y={y} direction={x2 > x1 ? "right" : "left"} color={stroke} />
          </g>
        );
      })}
    </svg>
  );
}

function Arrowhead({ x, y, direction, color }: { x: number; y: number; direction: "left" | "right"; color: string }) {
  const sign = direction === "right" ? -1 : 1;
  return (
    <polygon
      points={`${x},${y} ${x + sign * 8},${y - 4} ${x + sign * 8},${y + 4}`}
      fill={color}
    />
  );
}

// ── UI primitives ─────────────────────────────────────────────────
function IconBtn(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded border border-border-default bg-surface-base text-ink-primary hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50",
        props.className,
      )}
    />
  );
}

function Select({
  value,
  onChange,
  options,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string; disabled?: boolean }[];
  disabled?: boolean;
}) {
  return (
    <label className="relative inline-flex items-center">
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "appearance-none rounded border border-border-default bg-surface-base px-3 py-1.5 pr-8 text-small text-ink-primary",
          "focus:outline-none focus:ring-2 focus:ring-brand-primary/40",
          "disabled:cursor-not-allowed disabled:opacity-50",
        )}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 h-3.5 w-3.5 text-ink-tertiary" />
    </label>
  );
}
