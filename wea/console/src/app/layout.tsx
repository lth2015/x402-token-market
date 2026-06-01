import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Wea Facilitator Console",
  description: "x402 Facilitator observability — verify + settle traffic, Solana RPC, demo wallet on Devnet.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">{children}</body>
    </html>
  );
}
