"use client";

import { useState } from "react";
import { ArrowLeft, ArrowRight, MapPin } from "lucide-react";
import {
  EMPTY_ADDRESS,
  JAPAN_PREFECTURES,
  type ShippingAddress,
  validateAddress,
} from "@/lib/haba/checkout";
import { cn } from "@/lib/utils";

export function AddressStep({
  initial,
  onBack,
  onNext,
}: {
  initial: ShippingAddress | null;
  onBack: () => void;
  onNext: (address: ShippingAddress) => void;
}) {
  const [addr, setAddr] = useState<ShippingAddress>(initial ?? EMPTY_ADDRESS);
  const [touched, setTouched] = useState<
    Partial<Record<keyof ShippingAddress, boolean>>
  >({});

  const { ok, errors } = validateAddress(addr);

  function set<K extends keyof ShippingAddress>(key: K, value: ShippingAddress[K]) {
    setAddr((cur) => ({ ...cur, [key]: value }));
  }

  function blur(key: keyof ShippingAddress) {
    setTouched((cur) => ({ ...cur, [key]: true }));
  }

  function showErr(key: keyof ShippingAddress) {
    return touched[key] ? errors[key] : undefined;
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setTouched({
      recipient: true,
      postal: true,
      prefecture: true,
      city: true,
      street: true,
      phone: true,
    });
    if (ok) onNext(addr);
  }

  function formatPostal(raw: string): string {
    const digits = raw.replace(/[^0-9]/g, "").slice(0, 7);
    if (digits.length <= 3) return digits;
    return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  }

  return (
    <form onSubmit={submit} className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <div className="rounded-2xl border border-border-subtle bg-surface-base p-6 shadow-e1">
          <div className="flex items-center gap-2 text-body font-bold text-brand-ink">
            <MapPin className="h-4 w-4 text-brand-primary" aria-hidden />
            送货地址
          </div>
          <p className="mt-1 text-caption text-ink-tertiary">
            填一次,下次自动带出 · 仅本机记忆,不发送到第三方
          </p>

          <div className="mt-5 space-y-4">
            <Field label="收件人" error={showErr("recipient")}>
              <input
                value={addr.recipient}
                onChange={(e) => set("recipient", e.target.value)}
                onBlur={() => blur("recipient")}
                placeholder="山田 太郎"
                className={inputCls(Boolean(showErr("recipient")))}
              />
            </Field>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-[140px_1fr]">
              <Field label="〒 邮编" error={showErr("postal")}>
                <input
                  value={addr.postal}
                  onChange={(e) => set("postal", formatPostal(e.target.value))}
                  onBlur={() => blur("postal")}
                  inputMode="numeric"
                  placeholder="100-0001"
                  className={inputCls(Boolean(showErr("postal")))}
                />
              </Field>
              <Field label="都道府県" error={showErr("prefecture")}>
                <select
                  value={addr.prefecture}
                  onChange={(e) => set("prefecture", e.target.value)}
                  onBlur={() => blur("prefecture")}
                  className={inputCls(Boolean(showErr("prefecture")))}
                >
                  <option value="">— 请选择 —</option>
                  {JAPAN_PREFECTURES.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <Field label="市区町村" error={showErr("city")}>
              <input
                value={addr.city}
                onChange={(e) => set("city", e.target.value)}
                onBlur={() => blur("city")}
                placeholder="千代田区 千代田"
                className={inputCls(Boolean(showErr("city")))}
              />
            </Field>

            <Field label="番地 / 建物名" error={showErr("street")}>
              <input
                value={addr.street}
                onChange={(e) => set("street", e.target.value)}
                onBlur={() => blur("street")}
                placeholder="1-1 HABA ビル 7F"
                className={inputCls(Boolean(showErr("street")))}
              />
            </Field>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="电话" error={showErr("phone")}>
                <input
                  value={addr.phone}
                  onChange={(e) =>
                    set("phone", e.target.value.replace(/[^0-9-]/g, ""))
                  }
                  onBlur={() => blur("phone")}
                  inputMode="tel"
                  placeholder="090-1234-5678"
                  className={inputCls(Boolean(showErr("phone")))}
                />
              </Field>
              <Field label="邮箱 (选填,用于发货通知)">
                <input
                  value={addr.email ?? ""}
                  onChange={(e) => set("email", e.target.value)}
                  type="email"
                  placeholder="you@example.com"
                  className={inputCls(false)}
                />
              </Field>
            </div>
          </div>
        </div>
      </div>

      <aside className="space-y-3 lg:sticky lg:top-24 lg:h-fit">
        <div className="rounded-2xl border border-border-subtle bg-surface-base p-5 shadow-e1">
          <p className="text-caption font-semibold uppercase tracking-widest text-ink-tertiary">
            下一步
          </p>
          <p className="mt-2 text-small text-ink-secondary">
            填完地址后,用 Mac 的 Touch ID 按一下指纹就能确认 USDC 支付 ——
            不需要输入密码。
          </p>
          <button
            type="submit"
            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-primary px-4 py-3 text-body font-semibold text-white hover:bg-brand-primary-hover"
          >
            前往支付确认
            <ArrowRight className="h-4 w-4" aria-hidden />
          </button>
          <button
            type="button"
            onClick={onBack}
            className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-border-default bg-surface-base px-4 py-2.5 text-small font-medium text-ink-secondary hover:border-brand-primary/40 hover:text-brand-primary"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            返回购物车
          </button>
        </div>
      </aside>
    </form>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-small">
      <span className="font-semibold text-brand-ink">{label}</span>
      <div className="mt-1.5">{children}</div>
      {error && <p className="mt-1 text-caption text-semantic-danger">{error}</p>}
    </label>
  );
}

function inputCls(hasError: boolean) {
  return cn(
    "h-11 w-full rounded-xl border bg-surface-base px-3 text-small text-brand-ink outline-none placeholder:text-ink-tertiary focus:border-brand-primary",
    hasError ? "border-semantic-danger/50" : "border-border-default",
  );
}
