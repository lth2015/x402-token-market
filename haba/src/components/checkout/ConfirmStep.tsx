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
import { cn } from "@/lib/utils";

export type ConfirmedAuth = {
  idempotencyKey: string;
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
      payTo: "HABA",
      amountMicro,
      nonce: idempotencyKey,
    });
    const result = await requestBiometric(
      challenge,
      `${formatJpy(cart.totalJpy)} · ${cart.checkoutUsdc.toFixed(2)} USDC`,
    );
    setPending(false);
    if (result.ok) {
      onConfirmed({ idempotencyKey, userVerification: result.userVerificationEnvelope });
      return;
    }
    if (result.reason === "cancelled") {
      setError("已取消 —— 准备好了再按一下指纹即可。");
      return;
    }
    if (result.reason === "unsupported") {
      onConfirmed({ idempotencyKey, userVerification: null });
      return;
    }
    setError(result.detail ?? "指纹识别失败,请再试一次。");
  }

  return (
    <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2 animate-fade-up">
        {/* Touch ID ritual panel */}
        <div className="rounded-2xl border border-border-subtle bg-surface-elevated p-8 text-center shadow-e1 lg:p-10">

          {/* Fingerprint icon — with breathing ring, ceremonial */}
          <div className="relative mx-auto flex h-24 w-24 items-center justify-center">
            {/* Outer breathing ring */}
            <span
              className={cn(
                "absolute inset-0 rounded-full border border-brand-primary/20",
                !pending && "animate-breathe",
              )}
            />
            {/* Inner container */}
            <span className="relative inline-flex h-20 w-20 items-center justify-center rounded-full border border-brand-primary/15 bg-surface-deep">
              <Fingerprint
                className={cn(
                  "h-10 w-10 text-brand-primary transition-transform duration-300",
                  pending && "scale-90 opacity-60",
                )}
                aria-hidden
              />
            </span>
          </div>

          {/* Title */}
          <h3 className="mt-7 font-serif text-[22px] font-normal leading-snug text-ink-primary">
            确认这笔购买
          </h3>
          <p className="mt-2.5 font-sans text-small leading-relaxed text-ink-secondary max-w-sm mx-auto">
            按一下 Touch ID —— 支付确认后将安全处理,请确认以下信息无误。
          </p>

          {/* Order summary card */}
          <div className="mx-auto mt-7 max-w-sm rounded-xl border border-border-subtle bg-surface-deep p-5 text-left">
            <Line label="本次金额" value={formatJpy(cart.totalJpy)} accent />
            <Line label="商品件数" value={`${cart.items.length} 件`} />
            <Line label="送往" value={`${address.prefecture}${address.city}`} />
            <Line label="收件人" value={address.recipient} />
          </div>

          {/* Biometric unsupported notice */}
          {biometricSupported === false && (
            <p className="mx-auto mt-5 max-w-sm rounded-xl border border-brand-border bg-brand-subtle px-4 py-2.5 font-sans text-caption text-ink-secondary">
              当前设备不支持 Touch ID,将使用普通确认完成支付。
            </p>
          )}

          {/* CTA */}
          <button
            type="button"
            onClick={confirm}
            disabled={pending}
            className={cn(
              "mt-7 inline-flex w-full max-w-sm items-center justify-center gap-2.5",
              "rounded-xl bg-brand-primary px-6 py-3.5",
              "font-sans text-body font-semibold text-white shadow-e1",
              "transition-all duration-200 hover:bg-brand-primary-hover hover:shadow-e2",
              "disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none",
            )}
          >
            {pending ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                正在确认…
              </>
            ) : biometricSupported === false ? (
              <>
                <ShieldCheck className="h-5 w-5" aria-hidden />
                确认支付
              </>
            ) : (
              <>
                <Fingerprint className="h-5 w-5" aria-hidden />
                按指纹确认
              </>
            )}
          </button>

          {/* Error */}
          {error && (
            <div
              role="alert"
              className="mx-auto mt-4 flex max-w-sm items-start gap-2 rounded-xl border border-semantic-danger/25 bg-semantic-danger/5 px-4 py-3 text-left font-sans text-caption text-ink-secondary"
            >
              <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-semantic-danger" aria-hidden />
              <span>{error}</span>
            </div>
          )}

          {/* Back link */}
          <button
            type="button"
            onClick={onBack}
            disabled={pending}
            className="mt-5 inline-flex items-center gap-1.5 font-sans text-small text-ink-tertiary transition-colors hover:text-ink-secondary disabled:pointer-events-none"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            修改地址
          </button>
        </div>
      </div>

      {/* Security aside */}
      <aside className="animate-fade-up-1 lg:sticky lg:top-24 lg:h-fit">
        <div className="rounded-2xl border border-border-subtle bg-surface-elevated p-5 shadow-e1">
          <p className="font-sans text-[11px] font-medium uppercase tracking-[0.16em] text-ink-tertiary">
            安全说明
          </p>
          <ul className="mt-4 space-y-3">
            {[
              "支付确认后安全处理 —— 指纹确认是最后一步",
              "指纹仅在本机验证,HABA 不接收生物特征数据",
              "比输入卡号更快、更安全",
            ].map((text) => (
              <li key={text} className="flex items-start gap-2.5">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand-primary/60" aria-hidden />
                <span className="font-sans text-small text-ink-secondary leading-snug">{text}</span>
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  );
}

function Line({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5 border-b border-border-subtle/60 last:border-0">
      <span className="font-sans text-small text-ink-tertiary">{label}</span>
      <span className={cn("font-sans text-small text-ink-primary", accent && "font-semibold text-[16px]")}>
        {value}
      </span>
    </div>
  );
}
