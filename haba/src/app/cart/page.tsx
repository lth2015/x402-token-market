/**
 * /cart — consumer checkout flow.
 *
 * Three states inside one page (all client-side):
 *   1. cart-view   — list items + total + "USDC 钱包结账"
 *   2. processing  — x402CheckoutSteps animation + concurrent API call
 *   3. success     — order id + tx hash + "继续购物"
 *
 * Real backend: POST /api/checkout/order creates a merchant-checkout x402
 * payment. It can produce a real tx_hash without crediting the Netstars
 * Token ledger, keeping product payment separate from AI metering.
 */
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { SectionTitle } from "@/components/shared/SectionTitle";
import { CheckoutFlow } from "@/components/checkout/CheckoutFlow";

export const dynamic = "force-dynamic";

export default function CartPage() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-16 lg:px-12 lg:py-20">
      <Link
        href="/"
        className="mb-4 inline-flex items-center gap-1 text-caption text-ink-tertiary hover:text-brand-primary"
      >
        <ArrowLeft className="h-3 w-3" aria-hidden /> 返回首页
      </Link>

      <SectionTitle
        eyebrow="购物车"
        title="MARVIE 购物车"
        description="确认商品无误后,下一步填写送货地址并完成支付确认。"
      />

      <CheckoutFlow />
    </main>
  );
}
