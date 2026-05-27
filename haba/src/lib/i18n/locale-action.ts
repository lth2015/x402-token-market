"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

const SUPPORTED = new Set(["zh-CN", "ja", "en"]);

/**
 * Persist the user's locale choice in a cookie. The next render reads it
 * via lib/i18n/request.ts negotiate(). Revalidates the root layout so the
 * top-bar pill text updates immediately on language change.
 */
export async function setLocaleCookie(locale: string): Promise<{ ok: true }> {
  if (!SUPPORTED.has(locale)) {
    throw new Error(`unsupported locale: ${locale}`);
  }
  const jar = await cookies();
  jar.set("locale", locale, {
    path: "/",
    sameSite: "lax",
    httpOnly: false,
    maxAge: 60 * 60 * 24 * 365, // 1 year
  });
  revalidatePath("/", "layout");
  return { ok: true };
}
