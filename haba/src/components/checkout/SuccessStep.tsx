"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Bell,
  Box,
  CheckCircle,
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
    prep: addDays(placedAt, 1),
    ship: addDays(placedAt, 2),
    arrive: addDays(placedAt, 4),
  };

  const channelTarget =
    reminder.channel === "email"
      ? order.address.email || "(未填邮箱)"
      : order.address.phone;

  return (
    <div className="mt-8 space-y-5 animate-fade-up">
      {/* Confirmation header */}
      <div className="rounded-2xl border border-semantic-success/35 bg-semantic-success/5 p-8 text-center">
        <div className="relative mx-auto flex h-16 w-16 items-center justify-center">
          <span className="animate-pulse-ring absolute inline-block h-16 w-16 rounded-full border-2 border-emerald-400/50" />
          <span className="relative inline-flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 shadow-lg">
            <CheckCircle className="h-7 w-7 text-white" aria-hidden />
          </span>
        </div>
        <h3 className="mt-5 text-[20px] font-bold text-brand-ink">
          订单已确认,感谢你的购买
        </h3>
        <p className="mt-1.5 text-small text-ink-secondary">
          指纹确认通过,USDC 已扣款。HABA 正在为你安排发货。
        </p>

        <dl className="mx-auto mt-6 max-w-md space-y-2 text-left text-small">
          <SummaryRow
            label="订单号"
            value={<span className="font-mono text-[12px]">{order.orderId}</span>}
          />
          <SummaryRow
            label="支付金额"
            value={
              <>
                <span className="font-semibold">{formatJpy(order.totalJpy)}</span>
                <span className="ml-1 text-caption font-normal text-ink-tertiary">
                  · {order.amountUsdc.toFixed(2)} USDC
                </span>
              </>
            }
          />
          <SummaryRow
            label="送往"
            value={
              <>
                <div>
                  {order.address.prefecture}
                  {order.address.city} {order.address.street}
                </div>
                <div className="text-caption text-ink-tertiary">
                  {order.address.recipient} · {order.address.phone}
                </div>
              </>
            }
          />
        </dl>
      </div>

      {/* Lifecycle timeline */}
      <div className="rounded-2xl border border-border-subtle bg-surface-base p-6 shadow-e1">
        <h4 className="text-body font-bold text-brand-ink">订单进度</h4>
        <ol className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-4">
          <Step
            n={1}
            active
            title="已确认"
            date={stepDates.today}
            icon={<CheckCircle className="h-4 w-4" aria-hidden />}
            note="刚刚"
          />
          <Step
            n={2}
            active={false}
            title="备货中"
            date={stepDates.prep}
            icon={<Box className="h-4 w-4" aria-hidden />}
            note="预计明日完成"
          />
          <Step
            n={3}
            active={false}
            title="已发货"
            date={stepDates.ship}
            icon={<Package className="h-4 w-4" aria-hidden />}
            note="ヤマト运输"
          />
          <Step
            n={4}
            active={false}
            title="送达预计"
            date={stepDates.arrive}
            icon={<Truck className="h-4 w-4" aria-hidden />}
            note="3 个工作日内"
          />
        </ol>
        <div className="mt-5 flex items-start gap-2 rounded-xl border border-border-subtle bg-surface-elevated px-4 py-3 text-small text-ink-secondary">
          {reminder.channel === "email" ? (
            <Mail className="mt-0.5 h-4 w-4 shrink-0 text-brand-primary" aria-hidden />
          ) : (
            <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-brand-primary" aria-hidden />
          )}
          <span>
            发货完成后,通知会发到{" "}
            <span className="font-semibold text-brand-ink">{channelTarget}</span>
          </span>
        </div>
      </div>

      {/* Reminder opt-in */}
      <div className="rounded-2xl border border-brand-primary/20 bg-brand-primary/5 p-6">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-primary text-white">
            <Bell className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h4 className="text-body font-bold text-brand-ink">需要定期补货提醒吗?</h4>
            <p className="mt-1 text-small text-ink-secondary">
              MARVIE 用完了再下单太麻烦 ——
              让 HABA 在你快用完的时候提醒你一次,直接一键复购。
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <span className="text-small text-ink-secondary">每</span>
              {([4, 8, 12] as ReminderInterval[]).map((weeks) => (
                <button
                  key={weeks}
                  type="button"
                  onClick={() =>
                    setReminder((r) => ({
                      ...r,
                      intervalWeeks: weeks,
                      enabled: true,
                    }))
                  }
                  className={cn(
                    "rounded-full border px-3.5 py-1.5 text-small font-semibold transition-colors",
                    reminder.intervalWeeks === weeks && reminder.enabled
                      ? "border-brand-primary bg-brand-primary text-white"
                      : "border-border-default bg-surface-base text-ink-secondary hover:border-brand-primary/40 hover:text-brand-primary",
                  )}
                >
                  {weeks} 周
                </button>
              ))}
              <span className="text-small text-ink-secondary">提醒我一次</span>
            </div>
            {reminder.enabled && (
              <div className="mt-4 flex flex-wrap items-center gap-2 text-small">
                <span className="text-ink-secondary">通过</span>
                {(["email", "sms"] as const).map((ch) => (
                  <button
                    key={ch}
                    type="button"
                    onClick={() => setReminder((r) => ({ ...r, channel: ch }))}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-caption font-semibold transition-colors",
                      reminder.channel === ch
                        ? "border-brand-primary bg-brand-primary/10 text-brand-primary"
                        : "border-border-default text-ink-tertiary hover:border-brand-primary/40 hover:text-brand-primary",
                    )}
                  >
                    {ch === "email" ? (
                      <Mail className="h-3.5 w-3.5" aria-hidden />
                    ) : (
                      <MessageSquare className="h-3.5 w-3.5" aria-hidden />
                    )}
                    {ch === "email" ? "邮箱" : "短信"}
                  </button>
                ))}
                <span className="text-ink-tertiary">
                  → {reminder.channel === "email"
                    ? order.address.email || "(请补填邮箱)"
                    : order.address.phone}
                </span>
                <button
                  type="button"
                  onClick={commitReminder}
                  className="ml-auto rounded-xl bg-brand-primary px-4 py-2 text-small font-semibold text-white hover:bg-brand-primary-hover"
                >
                  {reminderSaved ? "已设置 ✓" : "确认提醒"}
                </button>
              </div>
            )}
            {reminderSaved && (
              <p className="mt-3 text-caption text-semantic-success">
                好的,{reminder.intervalWeeks} 周后会通过
                {reminder.channel === "email" ? "邮箱" : "短信"}提醒你补货。
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap justify-center gap-3">
        <Link
          href="/"
          className="rounded-xl bg-brand-primary px-5 py-2.5 text-small font-semibold text-white hover:bg-brand-primary-hover"
        >
          继续购物
        </Link>
        <button
          type="button"
          onClick={onNewOrder}
          className="rounded-xl border border-border-default bg-surface-base px-5 py-2.5 text-small font-medium text-ink-secondary hover:border-brand-primary/40 hover:text-brand-primary"
        >
          新建订单
        </button>
      </div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-ink-tertiary">{label}</dt>
      <dd className="text-right text-brand-ink">{value}</dd>
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
        "rounded-xl border p-4",
        active
          ? "border-semantic-success/40 bg-semantic-success/5"
          : "border-border-subtle bg-surface-elevated",
      )}
    >
      <div
        className={cn(
          "inline-flex h-7 w-7 items-center justify-center rounded-full text-white",
          active ? "bg-semantic-success" : "bg-ink-tertiary/40",
        )}
      >
        {icon}
      </div>
      <p className="mt-3 text-caption font-bold uppercase tracking-widest text-ink-tertiary">
        {`0${n}`}
      </p>
      <p className="mt-0.5 text-small font-bold text-brand-ink">{title}</p>
      <p className="text-caption text-ink-tertiary">
        {date.toLocaleDateString("zh-CN", {
          month: "numeric",
          day: "numeric",
          weekday: "short",
        })}
      </p>
      <p className="mt-1 text-[11px] text-ink-secondary">{note}</p>
    </li>
  );
}

function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}
