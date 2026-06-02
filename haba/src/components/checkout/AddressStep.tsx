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
  const [touched, setTouched] = useState<Partial<Record<keyof ShippingAddress, boolean>>>({});

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
      <div className="space-y-5 lg:col-span-2 animate-fade-up">
        <div className="rounded-2xl border border-border-subtle bg-surface-elevated p-6 shadow-e1 lg:p-8">
          {/* Section header */}
          <div className="flex items-center gap-2.5">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-brand-subtle">
              <MapPin className="h-4 w-4 text-brand-primary" aria-hidden />
            </span>
            <div>
              <p className="font-sans text-[15px] font-semibold text-ink-primary">送货地址</p>
              <p className="font-sans text-[11px] text-ink-tertiary">仅本机存储 · 不发送给第三方</p>
            </div>
          </div>

          <div className="mt-6 space-y-5">
            <Field label="収件人" required error={showErr("recipient")}>
              <Input
                value={addr.recipient}
                onChange={(v) => set("recipient", v)}
                onBlur={() => blur("recipient")}
                placeholder="山田 太郎"
                hasError={Boolean(showErr("recipient"))}
              />
            </Field>

            <div className="grid grid-cols-1 gap-5 sm:grid-cols-[150px_1fr]">
              <Field label="〒 邮编" required error={showErr("postal")}>
                <Input
                  value={addr.postal}
                  onChange={(v) => set("postal", formatPostal(v))}
                  onBlur={() => blur("postal")}
                  inputMode="numeric"
                  placeholder="100-0001"
                  hasError={Boolean(showErr("postal"))}
                />
              </Field>
              <Field label="都道府県" required error={showErr("prefecture")}>
                <select
                  value={addr.prefecture}
                  onChange={(e) => set("prefecture", e.target.value)}
                  onBlur={() => blur("prefecture")}
                  className={inputCls(Boolean(showErr("prefecture")))}
                >
                  <option value="">— 请选择 —</option>
                  {JAPAN_PREFECTURES.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </Field>
            </div>

            <Field label="市区町村" required error={showErr("city")}>
              <Input
                value={addr.city}
                onChange={(v) => set("city", v)}
                onBlur={() => blur("city")}
                placeholder="千代田区 千代田"
                hasError={Boolean(showErr("city"))}
              />
            </Field>

            <Field label="番地 / 建物名" required error={showErr("street")}>
              <Input
                value={addr.street}
                onChange={(v) => set("street", v)}
                onBlur={() => blur("street")}
                placeholder="1-1 HABA ビル 7F"
                hasError={Boolean(showErr("street"))}
              />
            </Field>

            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <Field label="电话" required error={showErr("phone")}>
                <Input
                  value={addr.phone}
                  onChange={(v) => set("phone", v.replace(/[^0-9-]/g, ""))}
                  onBlur={() => blur("phone")}
                  inputMode="tel"
                  placeholder="090-1234-5678"
                  hasError={Boolean(showErr("phone"))}
                />
              </Field>
              <Field label="邮箱" hint="用于发货通知（选填）">
                <Input
                  value={addr.email ?? ""}
                  onChange={(v) => set("email", v)}
                  type="email"
                  placeholder="you@example.com"
                  hasError={false}
                />
              </Field>
            </div>
          </div>
        </div>
      </div>

      {/* Aside */}
      <aside className="animate-fade-up-1 space-y-3 lg:sticky lg:top-24 lg:h-fit">
        <div className="rounded-2xl border border-border-subtle bg-surface-elevated p-5 shadow-e1">
          <p className="font-sans text-[11px] font-medium uppercase tracking-[0.16em] text-ink-tertiary">
            下一步
          </p>
          <p className="mt-2.5 font-sans text-small leading-relaxed text-ink-secondary">
            填完地址后,用 Touch ID 按一下指纹就能完成支付确认 —— 无需输入密码。
          </p>
          <button
            type="submit"
            className={cn(
              "mt-5 inline-flex w-full items-center justify-center gap-2",
              "rounded-xl bg-brand-primary px-4 py-3",
              "font-sans text-small font-semibold text-white shadow-e1",
              "transition-all duration-200 hover:bg-brand-primary-hover hover:shadow-e2",
            )}
          >
            前往支付确认
            <ArrowRight className="h-4 w-4" aria-hidden />
          </button>
          <button
            type="button"
            onClick={onBack}
            className={cn(
              "mt-2 inline-flex w-full items-center justify-center gap-2",
              "rounded-xl border border-border-default bg-surface-base px-4 py-2.5",
              "font-sans text-small font-medium text-ink-secondary",
              "transition-colors duration-150 hover:border-brand-primary/40 hover:text-brand-primary",
            )}
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            返回购物车
          </button>
        </div>
      </aside>
    </form>
  );
}

/* ── Field wrapper ──────────────────────────────────────────────────────── */
function Field({
  label,
  required,
  hint,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline gap-1.5">
        <span className="font-sans text-[13px] font-medium text-ink-primary">{label}</span>
        {required && (
          <span className="font-sans text-[11px] text-brand-accent" aria-hidden>*</span>
        )}
        {hint && (
          <span className="font-sans text-[11px] text-ink-tertiary">{hint}</span>
        )}
      </div>
      {children}
      {error && (
        <p role="alert" className="font-sans text-[12px] text-semantic-danger">
          {error}
        </p>
      )}
    </div>
  );
}

/* ── Input primitive ────────────────────────────────────────────────────── */
function Input({
  value,
  onChange,
  onBlur,
  placeholder,
  hasError,
  type = "text",
  inputMode,
}: {
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  hasError: boolean;
  type?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
}) {
  return (
    <input
      value={value}
      type={type}
      inputMode={inputMode}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      placeholder={placeholder}
      className={inputCls(hasError)}
    />
  );
}

function inputCls(hasError: boolean) {
  return cn(
    "h-12 w-full rounded-xl border bg-surface-base px-4",
    "font-sans text-small text-ink-primary",
    "outline-none placeholder:text-ink-tertiary placeholder:font-light",
    "transition-colors duration-150",
    "focus:border-brand-primary/60 focus:bg-surface-elevated",
    hasError
      ? "border-semantic-danger/50 bg-red-50/30"
      : "border-border-default hover:border-border-strong",
  );
}
