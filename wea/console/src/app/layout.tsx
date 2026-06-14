import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Wea Facilitator Console",
  description: "Wea Facilitator observability — x402 verify + Solana USDC settlement telemetry.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">{children}</body>
    </html>
  );
}
