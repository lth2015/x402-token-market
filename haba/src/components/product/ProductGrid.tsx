import { getTranslations } from "next-intl/server";
import { marvieProducts } from "@/lib/haba";
import { SectionTitle } from "@/components/shared/SectionTitle";
import { ProductCard } from "./ProductCard";

/**
 * Full MARVIE catalog grid. 7 SKUs (M2 data layer), 2-column tablet,
 * 3-column desktop.
 */
export async function ProductGrid() {
  const t = await getTranslations("products");
  return (
    <section className="mx-auto max-w-6xl px-6 py-16 lg:px-12 lg:py-20">
      <SectionTitle
        eyebrow={t("eyebrow")}
        title={t("sectionTitle")}
        description={t("sectionDescription")}
        right={
          <span className="rounded-full bg-surface-muted px-3 py-1 text-caption text-ink-tertiary">
            {t("count", { n: marvieProducts.length })}
          </span>
        }
      />

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {marvieProducts.map((p) => (
          <ProductCard key={p.id} product={p} />
        ))}
      </div>
    </section>
  );
}
