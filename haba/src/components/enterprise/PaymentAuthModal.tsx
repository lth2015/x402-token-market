"use client";

import { useEffect, useState } from "react";
import { CheckCircle, Fingerprint, Link2, Loader2, X, XCircle } from "lucide-react";
import {
  isBiometricAvailable,
  paymentRequirementsChallenge,
  requestBiometric,
} from "@/lib/biometric";
import { cn } from "@/lib/utils";

type Phase = "idle" | "pending" | "success" | "error" | "unsupported";

interface PaymentAuthModalProps {
  open: boolean;
  onClose: () => void;
}

export function PaymentAuthModal({ open, onClose }: PaymentAuthModalProps) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) { setPhase("idle"); setError(null); }
  }, [open]);

  async function handleAuthorize() {
    setPhase("pending");
    setError(null);

    const idempotencyKey = `haba-topup-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
    const amountMicro = (50_000_000).toString(); // $50 USDC in micro

    const challenge = await paymentRequirementsChallenge({
      resource: "/v1/protected/token-purchase",
      payTo: "Netstars",
      amountMicro,
      nonce: idempotencyKey,
    });

    const result = await requestBiometric(challenge, "100M Tokens · $50.00 USDC");

    if (result.ok) {
      setPhase("success");
      return;
    }
    if (result.reason === "unsupported") {
      setPhase("unsupported");
      return;
    }
    if (result.reason === "cancelled") {
      setPhase("idle");
      return;
    }
    setPhase("error");
    setError(result.detail ?? "Authorization failed, please try again.");
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink-primary/40 backdrop-blur-sm"
      role="dialog"
      aria-modal
      aria-label="Payment Authorization"
    >
      <div className="relative w-full max-w-sm rounded-2xl border border-border-default bg-surface-elevated p-7 shadow-e4 mx-4">
        {/* Close */}
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg p-1.5 text-ink-tertiary hover:bg-surface-muted transition-colors"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Payment info */}
        <div className="mb-6 flex items-center gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-brand-primary text-white shadow-e1">
            <Link2 className="h-5 w-5" aria-hidden />
          </span>
          <div>
            <p className="text-small font-semibold text-ink-primary">x402 Payment Authorization</p>
            <p className="text-caption text-ink-tertiary">x402 on Solana · USDC</p>
          </div>
        </div>

        {/* Amount */}
        <div className="mb-6 rounded-xl border border-border-default bg-surface-muted px-4 py-4">
          <div className="flex items-center justify-between">
            <p className="text-caption text-ink-tertiary">Top-up Amount</p>
            <p className="font-sans text-small font-semibold tabular-nums text-ink-primary">100,000,000 Tokens</p>
          </div>
          <div className="mt-2 flex items-center justify-between">
            <p className="text-caption text-ink-tertiary">Payment Amount</p>
            <p className="font-sans text-small font-semibold tabular-nums text-ink-primary">$50.00 USDC</p>
          </div>
          <div className="mt-2 flex items-center justify-between">
            <p className="text-caption text-ink-tertiary">Payment Network</p>
            <p className="font-sans text-caption text-ink-secondary">Solana Devnet</p>
          </div>
        </div>

        {/* Auth area */}
        {phase === "idle" && (
          <button
            type="button"
            onClick={handleAuthorize}
            className={cn(
              "flex w-full items-center justify-center gap-2.5 rounded-xl px-5 py-3.5",
              "bg-brand-primary !text-white font-medium text-small shadow-e1",
              "transition-all hover:bg-brand-primary-hover hover:shadow-e2 active:scale-[0.98]",
            )}
          >
            <Fingerprint className="h-5 w-5" aria-hidden />
            Confirm with Touch ID
          </button>
        )}

        {phase === "pending" && (
          <div className="flex flex-col items-center gap-3 py-4">
            <Loader2 className="h-10 w-10 animate-spin text-brand-primary" aria-hidden />
            <p className="text-small text-ink-secondary">Please verify with Touch ID on your device…</p>
          </div>
        )}

        {phase === "success" && (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <CheckCircle className="h-10 w-10 text-semantic-success" aria-hidden />
            <p className="text-small font-semibold text-ink-primary">Authorization Successful</p>
            <p className="text-caption text-ink-tertiary">x402 payment submitted to Solana · USDC confirming</p>
            <button
              type="button"
              onClick={onClose}
              className="mt-2 rounded-lg border border-border-default px-4 py-2 text-caption text-ink-secondary hover:bg-surface-muted transition-colors"
            >
              Close
            </button>
          </div>
        )}

        {(phase === "error" || phase === "unsupported") && (
          <div className="flex flex-col items-center gap-3 py-2 text-center">
            <XCircle className="h-10 w-10 text-semantic-danger" aria-hidden />
            <p className="text-small font-semibold text-ink-primary">
              {phase === "unsupported" ? "Touch ID not supported on this device" : "Authorization Failed"}
            </p>
            {error && <p className="text-caption text-ink-tertiary">{error}</p>}
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => setPhase("idle")}
                className="rounded-lg bg-brand-primary px-4 py-2 text-caption text-white hover:bg-brand-primary-hover transition-colors"
              >
                Retry
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-border-default px-4 py-2 text-caption text-ink-secondary hover:bg-surface-muted transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
