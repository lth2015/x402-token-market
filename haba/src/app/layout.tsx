import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import "./globals.css";

import { HabaTopBar } from "@/components/layout/HabaTopBar";
import { HabaFooter } from "@/components/layout/HabaFooter";
import { CartProvider } from "@/lib/cart/store";

export const metadata: Metadata = {
  title: "HABA AI Commerce",
  description:
    "HABA / ハーバー研究所 — AI 智能商品顾问 · MARVIE Medical Foods 全系列 · 帮你做更聪明的饮食选择",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const messages = await getMessages();
  return (
    <html lang={locale} suppressHydrationWarning>
      <body className="font-sans antialiased">
        <NextIntlClientProvider messages={messages}>
          <CartProvider>
            <HabaTopBar />
            {children}
            <HabaFooter />
          </CartProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
