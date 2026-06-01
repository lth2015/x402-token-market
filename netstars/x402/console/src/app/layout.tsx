import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NetStars X402 Console",
  description: "Standard x402 protocol observability — 402 challenges, X-PAYMENT proofs, WEA facilitator settlements on Solana USDC.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">{children}</body>
    </html>
  );
}
