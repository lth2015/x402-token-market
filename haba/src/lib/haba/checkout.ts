/**
 * Checkout amount policy shared by the cart UI and checkout route.
 *
 * Demo transactions are intentionally kept below 10 USDC so the Devnet payer
 * wallet survives repeated executive demos while still producing real on-chain
 * evidence.
 */
export const USDC_RATE_JPY = 150;
export const MIN_CHECKOUT_USDC = 0.10;
export const MAX_CHECKOUT_USDC = 9.00;

export function jpyToRawUsdc(totalJpy: number): number {
  return +(totalJpy / USDC_RATE_JPY).toFixed(4);
}

export function clampCheckoutUsdc(rawUsdc: number): number {
  if (rawUsdc < MIN_CHECKOUT_USDC) return MIN_CHECKOUT_USDC;
  if (rawUsdc > MAX_CHECKOUT_USDC) return MAX_CHECKOUT_USDC;
  return rawUsdc;
}

export function jpyToCheckoutUsdc(totalJpy: number): number {
  return clampCheckoutUsdc(jpyToRawUsdc(totalJpy));
}

export function getCheckoutClampState(totalJpy: number) {
  const rawUsdc = jpyToRawUsdc(totalJpy);
  const checkoutUsdc = clampCheckoutUsdc(rawUsdc);
  return {
    rawUsdc,
    checkoutUsdc,
    isFloorApplied: rawUsdc < MIN_CHECKOUT_USDC,
    isCapApplied: rawUsdc > MAX_CHECKOUT_USDC,
  };
}

// ────────────────────────────────────────────────────────────────────
// Shipping address (Japan format) — persisted in localStorage only.
// HABA backend currently does not store addresses; this is a client-only
// convenience until the order-fulfillment service ships.
// ────────────────────────────────────────────────────────────────────
export type ShippingAddress = {
  recipient: string;
  postal: string;       // 7 digits, displayed as 123-4567
  prefecture: string;
  city: string;
  street: string;
  phone: string;        // 10–11 digits
  email?: string;
};

export const EMPTY_ADDRESS: ShippingAddress = {
  recipient: "",
  postal: "",
  prefecture: "",
  city: "",
  street: "",
  phone: "",
  email: "",
};

export const ADDRESS_STORAGE_KEY = "haba_shipping_address";

export function loadSavedAddress(): ShippingAddress | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(ADDRESS_STORAGE_KEY);
    if (!raw) return null;
    return { ...EMPTY_ADDRESS, ...(JSON.parse(raw) as Partial<ShippingAddress>) };
  } catch {
    return null;
  }
}

export function saveAddress(addr: ShippingAddress) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(ADDRESS_STORAGE_KEY, JSON.stringify(addr));
  } catch { /* quota or SSR */ }
}

export function validateAddress(addr: ShippingAddress): {
  ok: boolean;
  errors: Partial<Record<keyof ShippingAddress, string>>;
} {
  const errors: Partial<Record<keyof ShippingAddress, string>> = {};
  if (!addr.recipient.trim()) errors.recipient = "请填写收件人姓名";
  const postalDigits = addr.postal.replace(/[^0-9]/g, "");
  if (postalDigits.length !== 7) errors.postal = "邮编需 7 位数字";
  if (!addr.prefecture.trim()) errors.prefecture = "请选择都道府县";
  if (!addr.city.trim()) errors.city = "请填写市区町村";
  if (!addr.street.trim()) errors.street = "请填写番地 / 建物名";
  const phoneDigits = addr.phone.replace(/[^0-9]/g, "");
  if (phoneDigits.length < 10 || phoneDigits.length > 11) {
    errors.phone = "电话需 10–11 位数字";
  }
  return { ok: Object.keys(errors).length === 0, errors };
}

export const JAPAN_PREFECTURES = [
  "北海道", "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県",
  "茨城県", "栃木県", "群馬県", "埼玉県", "千葉県", "東京都", "神奈川県",
  "新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県",
  "岐阜県", "静岡県", "愛知県", "三重県",
  "滋賀県", "京都府", "大阪府", "兵庫県", "奈良県", "和歌山県",
  "鳥取県", "島根県", "岡山県", "広島県", "山口県",
  "徳島県", "香川県", "愛媛県", "高知県",
  "福岡県", "佐賀県", "長崎県", "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県",
] as const;

// ────────────────────────────────────────────────────────────────────
// Periodic reorder reminder pref — UI state only.
// A real reminder requires a cron + email/SMS provider; that lives in
// the upcoming HABA fulfillment backend, not in this client.
// ────────────────────────────────────────────────────────────────────
export type ReminderInterval = 4 | 8 | 12;

export type ReminderPref = {
  enabled: boolean;
  intervalWeeks: ReminderInterval;
  channel: "email" | "sms";
};

export const REMINDER_STORAGE_KEY = "haba_reminder_pref";

export function loadReminderPref(): ReminderPref | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(REMINDER_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ReminderPref;
  } catch {
    return null;
  }
}

export function saveReminderPref(pref: ReminderPref) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(REMINDER_STORAGE_KEY, JSON.stringify(pref));
  } catch { /* */ }
}
