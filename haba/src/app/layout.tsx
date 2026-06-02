import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { Bodoni_Moda, Jost } from "next/font/google";
import "./globals.css";

import { HabaTopBar } from "@/components/layout/HabaTopBar";
import { HabaFooter } from "@/components/layout/HabaFooter";
import { CartProvider } from "@/lib/cart/store";

// Display serif — Bodoni Moda: high-contrast editorial, luxury feel
// Only preload regular + medium weight (critical for hero); italic loaded too for Bodoni flair
const bodoniModa = Bodoni_Moda({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  variable: "--font-bodoni",
  display: "swap",
  preload: true,
});

// Body sans — Jost: geometric, clean, pairs perfectly with Bodoni
const jost = Jost({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-jost",
  display: "swap",
  preload: true,
});

export const metadata: Metadata = {
  title: "HABA — あなたの甘味顾问",
  description:
    "HABA / ハーバー研究所 — AI 個人健康甜味顧問 · MARVIE 全系列 · 控糖 · 低卡 · 料理搭配",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const messages = await getMessages();
  return (
    <html
      lang={locale}
      className={`${bodoniModa.variable} ${jost.variable}`}
      suppressHydrationWarning
    >
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
