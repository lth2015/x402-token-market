// HABA i18n — independent from Netstars Console.
// Default: zh-CN (per product requirements: "文案中文为主").
// Fallback chain: cookie > Accept-Language > zh-CN default.

import { getRequestConfig } from "next-intl/server";
import { cookies, headers } from "next/headers";

const SUPPORTED = ["zh-CN", "ja", "en"] as const;
type SupportedLocale = (typeof SUPPORTED)[number];
const DEFAULT_LOCALE: SupportedLocale = "zh-CN";

function negotiate(cookieLocale: string | undefined, acceptLanguage: string): SupportedLocale {
  if (cookieLocale && (SUPPORTED as readonly string[]).includes(cookieLocale)) {
    return cookieLocale as SupportedLocale;
  }
  const lower = acceptLanguage.toLowerCase();
  if (lower.startsWith("zh")) return "zh-CN";
  if (lower.startsWith("ja")) return "ja";
  if (lower.startsWith("en")) return "en";
  return DEFAULT_LOCALE;
}

export default getRequestConfig(async () => {
  const cookieLocale = (await cookies()).get("locale")?.value;
  const acceptLanguage = (await headers()).get("accept-language") ?? "";
  const locale = negotiate(cookieLocale, acceptLanguage);

  return {
    locale,
    messages: (await import(`../../../messages/${locale}.json`)).default,
    timeZone: "Asia/Tokyo",
    now: new Date(),
  };
});
