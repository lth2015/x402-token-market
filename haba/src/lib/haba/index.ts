/**
 * HABA mock data — unified entry point.
 *
 * Consumers should import from "@/lib/haba" only:
 *   import { habaMerchant, marvieProducts, type MarvieProduct } from "@/lib/haba";
 *
 * Don't reach into "@/lib/haba/products" etc. directly — keeps refactors cheap
 * (the only place that knows the file layout is this barrel).
 */

export * from "./types";
export { habaMerchant } from "./merchant";
export { marvieProducts, getProductById, getProductBySku } from "./products";
export * from "./enterprise";
