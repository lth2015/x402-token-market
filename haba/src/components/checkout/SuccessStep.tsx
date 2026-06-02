"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Bell,
  Box,
  Check,
  Mail,
  MessageSquare,
  Package,
  Truck,
} from "lucide-react";
import {
  saveReminderPref,
  type ReminderInterval,
  type ReminderPref,
  type ShippingAddress,
} from "@/lib/haba/checkout";
import { cn, formatJpy } from "@/lib/utils";

export type OrderConfirmation = {
  orderId: string;
  paymentOrderId: string;
  amountUsdc: number;
  totalJpy: number;
  placedAt: string;
  address: ShippingAddress;
};

export function SuccessStep({
  order,
  onNewOrder,
}: {
  order: OrderConfirmation;
  onNewOrder: () => void;
}) {
  const initialChannel: ReminderPref["channel"] = order.address.email ? "email" : "sms";
  const [reminder, setReminder] = useState<ReminderPref>({
    enabled: false,
    intervalWeeks: 8,
    channel: initialChannel,
  });
  const [reminderSaved, setReminderSaved] = useState(false);

  function commitReminder() {
    saveReminderPref(reminder);
    setReminderSaved(true);
    setTimeout(() => setReminderSaved(false), 5000);
  }

  const placedAt = new Date(order.placedAt);
  const stepDates = {
    today: placedAt,
    prep:  addDays(placedAt, 1),
    ship:  addDays(placedAt, 2),
    arrive: addDays(placedAt, 4),
  };

  const channelTarget =
    reminder.channel === "email"
      ? order.address.email || "(未填邮箱)"
      : order.address.phone;

  return (
    <div className="mt-8 space-y-5 animate-fade-up">

      {/* ── Confirmation header ───────────────────────────────────────── */}
      <div className="rounded-2xl border border-border-subtle bg-surface-elevated p-8 text-center shadow-e1 lg:p-10">

        {/* Success mark — clean, not exuberant */}
        <div className="relative mx-auto flex h-20 w-20 items-center justify-center">
          <span className="animate-pulse-ring absolute inset-0 rounded-full border border-semantic-success/30" />
          <span className="relative inline-flex h-16 w-16 items-center justify-center rounded-full bg-surface-deep border border-semantic-success/25">
            <Check className="h-7 w-7 text-semantic-success" strokeWidth={2.5} aria-hidden />
          </span>
        </div>

        <h3 className="mt-6 font-serif text-[24px] font-normal text-ink-primary">
          订单已确认
        </h3>
        <p className="mt-2 font-sans text-small text-ink-secondary">
          感谢你的购买 —— HABA 正在为你安排发货。
        </p>

        {/* Order summary */}
        <dl className="mx-auto mt-7 max-w-md space-y-0 text-left rounded-xl border border-border-subtle bg-surface-deep overflow-hidden">
          <SummaryRow
            label="订单号"
            value={<span className="font-mono text-[12px] tracking-wide">{order.orderId}</span>}
          />
          <SummaryRow
            label="支付金额"
            value={
              <span className="font-sans font-semibold">{formatJpy(order.totalJpy)}</span>
            }
          />
          <SummaryRow
            label="送往"
            value={
              <span className="text-right">
                <span className="block">{order.address.prefecture}{order.address.city}</span>
                <span className="block font-sans text-caption text-ink-tertiary">{order.address.street}</span>
              </span>
            }
          />
          <SummaryRow
            label="收件人"
            value={`${order.address.recipient} · ${order.address.phone}`}
          />
        </dl>
      </div>

      {/* ── Order timeline ────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-border-subtle bg-surface-elevated p-6 shadow-e1">
        <h4 className="font-sans text-small font-semibold text-ink-primary">订单进度</h4>
        <ol className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Step
            n={1}
            active
            title="已确认"
            date={stepDates.today}
            icon={<Check className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />}
            note="刚刚"
          />
          <Step
            n={2}
            active={false}
            title="备货中"
            date={stepDates.prep}
            icon={<Box className="h-3.5 w-3.5" aria-hidden />}
            note="预计明日完成"
          />
          <Step
            n={3}
            active={false}
            title="已发货"
            date={stepDates.ship}
            icon={<Package className="h-3.5 w-3.5" aria-hidden />}
            note="ヤマト运输"
          />
          <Step
            n={4}
            active={false}
            title="送达预计"
            date={stepDates.arrive}
            icon={<Truck className="h-3.5 w-3.5" aria-hidden />}
            note="3 个工作日内"
          />
        </ol>

        <div className="mt-5 flex items-start gap-2.5 rounded-xl border border-border-subtle bg-surface-deep px-4 py-3">
          {reminder.channel === "email" ? (
            <Mail className="mt-0.5 h-4 w-4 shrink-0 text-brand-primary/60" aria-hidden />
          ) : (
            <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-brand-primary/60" aria-hidden />
          )}
          <span className="font-sans text-small text-ink-secondary">
            发货完成后,通知会发到{" "}
            <span className="font-semibold text-ink-primary">{channelTarget}</span>
          </span>
        </div>
      </div>

      {/* ── Reminder opt-in ───────────────────────────────────────────── */}
      <div className="rounded-2xl border border-brand-border bg-brand-subtle p-6">
        <div className="flex items-start gap-3.5">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-primary text-white">
            <Bell className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h4 className="font-sans text-small font-semibold text-ink-primary">
              需要定期补货提醒吗?
            </h4>
            <p className="mt-1 font-sans text-small text-ink-secondary">
              MARVIE 快用完的时候提醒你一次 —— 一键复购,省时省力。
            </p>

            <div className="mt-4 flex flex-wrap items-center gap-2.5">
              <span className="font-sans text-small text-ink-secondary">每</span>
              {([4, 8, 12] as ReminderInterval[]).map((weeks) => (
                <button
                  key={weeks}
                  type="button"
                  onClick={() =>
                    setReminder((r) => ({ ...r, intervalWeeks: weeks, enabled: true }))
                  }
                  className={cn(
                    "rounded-full border px-4 py-1.5 font-sans text-small font-medium transition-colors duration-150",
                    reminder.intervalWeeks === weeks && reminder.enabled
                      ? "border-brand-primary bg-brand-primary text-white"
                      : "border-border-default bg-surface-elevated text-ink-secondary hover:border-brand-primary/40 hover:text-brand-primary",
                  )}
                >
                  {weeks} 周
                </button>
              ))}
              <span className="font-sans text-small text-ink-secondary">提醒一次</span>
            </div>

            {reminder.enabled && (
              <div className="mt-4 flex flex-wrap items-center gap-2 font-sans text-small">
                <span className="text-ink-secondary">通过</span>
                {(["email", "sms"] as const).map((ch) => (
                  <button
                    key={ch}
                    type="button"
                    onClick={() => setReminder((r) => ({ ...r, channel: ch }))}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-caption font-medium transition-colors duration-150",
                      reminder.channel === ch
                        ? "border-brand-primary bg-brand-primary/10 text-brand-primary"
                        : "border-border-default text-ink-tertiary hover:border-brand-primary/40 hover:text-brand-primary",
                    )}
                  >
                    {ch === "email"
                      ? <Mail className="h-3.5 w-3.5" aria-hidden />
                      : <MessageSquare className="h-3.5 w-3.5" aria-hidden />
                    }
                    {ch === "email" ? "邮箱" : "短信"}
                  </button>
                ))}
                <span className="text-ink-tertiary">→ {channelTarget}</span>
                <button
                  type="button"
                  onClick={commitReminder}
                  className="ml-auto rounded-xl bg-brand-primary px-4 py-2 text-small font-semibold text-white hover:bg-brand-primary-hover"
                >
                  {reminderSaved ? "已设置" : "确认提醒"}
                </button>
              </div>
            )}

            {reminderSaved && (
              <p className="mt-3 font-sans text-caption text-semantic-success">
                好的,{reminder.intervalWeeks} 周后会通过
                {reminder.channel === "email" ? "邮箱" : "短信"}提醒你补货。
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap justify-center gap-3 pt-2">
        <Link
          href="/"
          className="rounded-xl bg-brand-primary px-6 py-2.5 font-sans text-small font-semibold text-white shadow-e1 hover:bg-brand-primary-hover hover:shadow-e2 transition-all duration-150"
        >
          继续购物
        </Link>
        <button
          type="button"
          onClick={onNewOrder}
          className="rounded-xl border border-border-default bg-surface-elevated px-6 py-2.5 font-sans text-small font-medium text-ink-secondary hover:border-brand-primary/40 hover:text-brand-primary transition-colors duration-150"
        >
          新建订单
        </button>
      </div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 px-5 py-3 border-b border-border-subtle last:border-0">
      <dt className="font-sans text-small text-ink-tertiary shrink-0">{label}</dt>
      <dd className="font-sans text-small text-ink-primary text-right">{value}</dd>
    </div>
  );
}

function Step({
  n,
  active,
  title,
  date,
  icon,
  note,
}: {
  n: number;
  active: boolean;
  title: string;
  date: Date;
  icon: React.ReactNode;
  note: string;
}) {
  return (
    <li
      className={cn(
        "rounded-xl border p-3.5",
        active
          ? "border-semantic-success/30 bg-semantic-success/5"
          : "border-border-subtle bg-surface-deep",
      )}
    >
      <div
        className={cn(
          "inline-flex h-7 w-7 items-center justify-center rounded-full",
          active ? "bg-semantic-success text-white" : "bg-border-default text-ink-tertiary",
        )}
      >
        {icon}
      </div>
      <p className="mt-3 font-sans text-[10px] font-medium uppercase tracking-widest text-ink-tertiary">
        {String(n).padStart(2, "0")}
      </p>
      <p className="mt-0.5 font-sans text-small font-semibold text-ink-primary">{title}</p>
      <p className="font-sans text-caption text-ink-tertiary">
        {date.toLocaleDateString("zh-CN", {
          month: "numeric",
          day: "numeric",
          weekday: "short",
        })}
      </p>
      <p className="mt-1 font-sans text-[11px] text-ink-secondary">{note}</p>
    </li>
  );
}

function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}
