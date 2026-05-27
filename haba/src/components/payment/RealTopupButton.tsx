"use client";

import { useState } from "react";
import { CheckCircle, Loader2, Rocket, XCircle } from "lucide-react";
import { cn, formatJpy } from "@/lib/utils";
import { DemoBadge } from "@/components/shared/DemoBadge";

type TopupState =
  | { kind: "idle" }
  | { kind: "running" }
  | {
      kind: "ok";
      paymentOrderId: string;
      txHash: string | null;
      amountUsdc: number;
      ledgerEntryId?: string;
    }
  | { kind: "error"; message: string };

const AMOUNT_USDC = 10;
const AMOUNT_USDC_MICRO = AMOUNT_USDC * 1_000_000;

/**
 * One-button real top-up — hits POST /api/payment/topup, which on the
 * server side creates a token purchase + credits the HABA Token ledger.
 *
 * On success, fires a window event so <TokenBalancePill /> re-fetches
 * immediately (no need to wait for its 10s poll).
 */
export function RealTopupButton() {
  const [state, setState] = useState<TopupState>({ kind: "idle" });

  async function go() {
    setState({ kind: "running" });
    try {
      const res = await fetch("/api/payment/topup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount_usdc: AMOUNT_USDC }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) {
        setState({
          kind: "error",
          message: typeof j.error === "string" ? j.error : `HTTP ${res.status}`,
        });
        return;
      }
      setState({
        kind: "ok",
        paymentOrderId: j.payment_order_id,
        txHash: j.tx_hash,
        amountUsdc: j.amount_usdc,
        ledgerEntryId: j.credit?.ledger_entry_id,
      });
      // Tell the balance pill to refresh now, not 10s from now.
      window.dispatchEvent(new CustomEvent("haba:balance-refresh"));
    } catch (e) {
      setState({ kind: "error", message: e instanceof Error ? e.message : "fetch failed" });
    }
  }

  return (
    <div className="overflow-hidden rounded-2xl border-2 border-dashed border-brand-primary/40 bg-brand-primary/5 p-6">
      <div className="flex items-baseline justify-between gap-4">
        <div>
          <h3 className="flex items-center gap-2 text-body font-semibold text-brand-ink">
            🚀 真打一笔 — DEV 模式 <DemoBadge tone="warning">连后端</DemoBadge>
          </h3>
          <p className="mt-1 text-caption text-ink-secondary">
            不只是动画 — 这个按钮会真的发起一次 HABA Token 充值，调用本身完全真实。
            DEV 模式跳过公链广播；HABA Token 余额会立刻 +10,000。
          </p>
        </div>
        <button
          type="button"
          onClick={go}
          disabled={state.kind === "running"}
          className={cn(
            "shrink-0 inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-small font-semibold transition-all",
            state.kind === "running"
              ? "bg-surface-muted text-ink-tertiary"
              : "bg-brand-primary text-white shadow-e2 hover:bg-brand-primary-hover",
          )}
        >
          {state.kind === "running" ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> 调用中…
            </>
          ) : (
            <>
              <Rocket className="h-4 w-4" aria-hidden /> 发起 10,000 Token 充值（{formatJpy(AMOUNT_USDC * 150)} ≈ {AMOUNT_USDC} USDC）
            </>
          )}
        </button>
      </div>

      {state.kind === "ok" && <SuccessPanel state={state} />}
      {state.kind === "error" && <ErrorPanel message={state.message} />}
    </div>
  );
}

function SuccessPanel({
  state,
}: {
  state: Extract<TopupState, { kind: "ok" }>;
}) {
  return (
    <div className="mt-4 rounded-lg border border-semantic-success/40 bg-semantic-success/5 p-4">
      <div className="flex items-center gap-2 text-small font-semibold text-semantic-success">
        <CheckCircle className="h-4 w-4" aria-hidden />
        Token 已入账 — {state.amountUsdc} USDC → +{(state.amountUsdc * 1_000).toLocaleString()} Token
      </div>
      <dl className="mt-3 grid grid-cols-1 gap-1.5 text-caption sm:grid-cols-2">
        <Row label="订单号" value={state.paymentOrderId} mono />
        <Row label="链上 tx" value={state.txHash ?? "—"} mono />
        {state.ledgerEntryId && <Row label="账本流水号" value={state.ledgerEntryId} mono />}
      </dl>
    </div>
  );
}

function ErrorPanel({ message }: { message: string }) {
  return (
    <div className="mt-4 rounded-lg border border-semantic-danger/40 bg-semantic-danger/5 p-4">
      <div className="flex items-center gap-2 text-small font-semibold text-semantic-danger">
        <XCircle className="h-4 w-4" aria-hidden />
        调用失败
      </div>
      <p className="mt-2 break-words text-caption text-semantic-danger">{message}</p>
      <p className="mt-2 text-caption text-ink-tertiary">
        请稍后重试；如持续失败请联系 HABA 系统管理员。
      </p>
    </div>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="text-ink-tertiary">{label}</dt>
      <dd className={cn("flex-1 truncate text-brand-ink", mono && "font-mono text-[11px]")}>{value}</dd>
    </div>
  );
}

// Re-export the constants so /topup page or others can show consistent numbers
export const TOPUP_DEMO_AMOUNT_USDC = AMOUNT_USDC;
export const TOPUP_DEMO_AMOUNT_USDC_MICRO = AMOUNT_USDC_MICRO;
