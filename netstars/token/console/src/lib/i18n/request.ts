import { getRequestConfig } from "next-intl/server";
import { cookies, headers } from "next/headers";

const SUPPORTED = ["ja", "en"] as const;
const DEFAULT_LOCALE = "en";

export default getRequestConfig(async () => {
  const cookieLocale = (await cookies()).get("locale")?.value;
  const acceptLanguage = (await headers()).get("accept-language") ?? "";
  let locale: (typeof SUPPORTED)[number] = DEFAULT_LOCALE;

  if (cookieLocale && SUPPORTED.includes(cookieLocale as any)) {
    locale = cookieLocale as any;
  } else if (acceptLanguage.toLowerCase().startsWith("en")) {
    locale = "en";
  }

  return {
    locale,
    messages: (await import(`../../../messages/${locale}.json`)).default,
    timeZone: "Asia/Tokyo",
    now: new Date(),
  };
});
