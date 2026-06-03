import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { Jost } from "next/font/google";
import "./globals.css";

import { EnterpriseSidebar } from "@/components/enterprise/EnterpriseSidebar";

const jost = Jost({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-jost",
  display: "swap",
  preload: true,
});

export const metadata: Metadata = {
  title: "HABA Enterprise — AI Token Platform",
  description: "HABA Enterprise · AI Token Billing Dashboard · GPT-4o Usage Monitoring",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const messages = await getMessages();
  return (
    <html lang={locale} className={jost.variable} suppressHydrationWarning>
      <body className="font-sans antialiased">
        <NextIntlClientProvider messages={messages}>
          <div className="flex h-screen overflow-hidden">
            <EnterpriseSidebar />
            <div className="flex flex-1 flex-col overflow-y-auto">
              {children}
            </div>
          </div>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
