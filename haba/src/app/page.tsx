/**
 * HABA AI Commerce home — composition.
 *
 * (TopBar / Footer come from app/layout.tsx so every route shares them.)
 *
 *   1. HabaHero                  — brand block + consumer segments
 *   2. ConsumerScenarioSection   — 5 C-end Agent flows
 *   3. ProductGrid               — 7 MARVIE SKUs
 *   4. SubpageTeaserGrid         — 3 cards → /topup, /resale, /b2b
 */
import { HabaHero } from "@/components/hero/HabaHero";
import { ConsumerScenarioSection } from "@/components/agent/ConsumerScenarioSection";
import { ProductGrid } from "@/components/product/ProductGrid";
import { SubpageTeaserGrid } from "@/components/home/SubpageTeaserGrid";

export const dynamic = "force-dynamic";

export default function HabaHomePage() {
  return (
    <main>
      <HabaHero />
      <ConsumerScenarioSection />
      <ProductGrid />
      <SubpageTeaserGrid />
    </main>
  );
}
