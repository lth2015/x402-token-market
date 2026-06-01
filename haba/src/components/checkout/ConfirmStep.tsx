"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Fingerprint,
  Loader2,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import {
  isBiometricAvailable,
  paymentRequirementsChallenge,
  requestBiometric,
} from "@/lib/biometric";
import type { ShippingAddress } from "@/lib/haba/checkout";
import { formatJpy } from "@/lib/utils";
import { useCart } from "@/lib/cart/store";

/** Shape passed back to the parent so it can drive the x402 retry loop. */
export type ConfirmedAuth = {
  /** Stable per-attempt key; gateway binds 402 + retry to the same order. */
  idempotencyKey: string;
  /** Base64 WebAuthn attestation envelope, or null if biometric unsupported. */
  userVerification: string | null;
};

export function ConfirmStep({
  address,
  onBack,
  onConfirmed,
}: {
  address: ShippingAddress;
  onBack: () => void;
  onConfirmed: (auth: ConfirmedAuth) => void;
}) {
  const cart = useCart();
  const [biometricSupported, setBiometricSupported] = useState<boolean | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Stable per-attempt idempotency key — also seeds the biometric challenge
  // so the Touch ID prompt is bound to this specific payment.
  const idempotencyKey = useMemo(
    () => `haba-checkout-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`,
    [],
  );

  useEffect(() => {
    void isBiometricAvailable().then(setBiometricSupported);
  }, []);

  async function confirm() {
    setPending(true);
    setError(null);
    const amountMicro = Math.round(cart.checkoutUsdc * 1_000_000).toString();
    const challenge = await paymentRequirementsChallenge({
      resource: "/v1/protected/checkout/order",
      payTo: "HABA",          // unknown until the 402 fires; binding via idem key
      amountMicro,
      nonce: idempotencyKey,  // pin to this attempt
    });
    const result = await requestBiometric(
      challenge,
      `${formatJpy(cart.totalJpy)} · ${cart.checkoutUsdc.toFixed(2)} USDC`,
    );
    setPending(false);
    if (result.ok) {
      onConfirmed({
        idempotencyKey,
        userVerification: result.userVerificationEnvelope,
      });
      return;
    }
    if (result.reason === "cancelled") {
      setError("已取消 —— 准备好了再按一下指纹即可。");
      return;
    }
    if (result.reason === "unsupported") {
      // Fallback: proceed with a UI gate, no cryptographic envelope.
      onConfirmed({ idempotencyKey, userVerification: null });
      return;
    }
    setError(result.detail ?? "指纹识别失败,请再试一次。");
  }

  return (
    <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <div className="rounded-2xl border border-border-subtle bg-surface-base p-8 text-center shadow-e1">
          <div className="mx-auto inline-flex h-20 w-20 items-center justify-center rounded-full bg-brand-primary/10 text-brand-primary">
            <Fingerprint className="h-10 w-10" aria-hidden />
          </div>
          <h3 className="mt-5 text-[20px] font-bold text-brand-ink">
            用 Touch ID 确认这笔支付
          </h3>
          <p className="mt-2 text-small text-ink-secondary">
            USDC 是稳定币,上链后不可撤销 ——
            按一下 Mac 的指纹键就能确认,不用输密码、不用复制地址。
          </p>

          <div className="mx-auto mt-6 max-w-sm rounded-xl border border-border-subtle bg-surface-elevated p-4 text-left text-small">
            <Line
              label="本次扣款"
              value={`${cart.checkoutUsdc.toFixed(2)} USDC`}
              accent
            />
            <Line label="折合日元" value={formatJpy(cart.totalJpy)} />
            <Line label="送往" value={`${address.prefecture}${address.city}…`} />
            <Line label="收件人" value={address.recipient} />
          </div>

          {biometricSupported === false && (
            <p className="mx-auto mt-4 max-w-sm rounded-xl border border-brand-accent/30 bg-brand-accent/5 px-3 py-2 text-caption text-ink-secondary">
              当前浏览器不支持 Touch ID,会用普通确认按钮完成支付。
            </p>
          )}

          <button
            type="button"
            onClick={confirm}
            disabled={pending}
            className="mt-6 inline-flex w-full max-w-sm items-center justify-center gap-2 rounded-xl bg-brand-primary px-4 py-3 text-body font-semibold text-white shadow-e1 hover:bg-brand-primary-hover disabled:opacity-60"
          >
            {pending ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                等待指纹确认…
              </>
            ) : biometricSupported === false ? (
              <>
                <ShieldCheck className="h-5 w-5" aria-hidden />
                确认支付
              </>
            ) : (
              <>
                <Fingerprint className="h-5 w-5" aria-hidden />
                按指纹确认 {cart.checkoutUsdc.toFixed(2)} USDC
              </>
            )}
          </button>

          {error && (
            <div className="mx-auto mt-4 flex max-w-sm items-start gap-2 rounded-xl border border-semantic-danger/30 bg-semantic-danger/5 px-3 py-2 text-left text-caption text-ink-secondary">
              <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-semantic-danger" aria-hidden />
              <span>{error}</span>
            </div>
          )}

          <button
            type="button"
            onClick={onBack}
            disabled={pending}
            className="mt-3 inline-flex items-center gap-1.5 text-small text-ink-tertiary hover:text-ink-secondary"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            修改地址
          </button>
        </div>
      </div>

      <aside className="lg:sticky lg:top-24 lg:h-fit">
        <div className="rounded-2xl border border-border-subtle bg-surface-base p-5 shadow-e1">
          <p className="text-caption font-semibold uppercase tracking-widest text-ink-tertiary">
            为什么要指纹?
          </p>
          <ul className="mt-3 space-y-2.5 text-small text-ink-secondary">
            <li className="flex gap-2">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand-primary" aria-hidden />
              稳定币上链后不可撤销 —— 指纹是最后一道防误触
            </li>
            <li className="flex gap-2">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand-primary" aria-hidden />
              指纹只在 Mac 本机验证,HABA 拿不到生物特征
            </li>
            <li className="flex gap-2">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand-primary" aria-hidden />
              比输入信用卡 CVV 快 10 倍
            </li>
          </ul>
        </div>
      </aside>
    </div>
  );
}

function Line({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <span className="text-ink-tertiary">{label}</span>
      <span className={accent ? "font-bold text-brand-ink" : "text-brand-ink"}>
        {value}
      </span>
    </div>
  );
}
