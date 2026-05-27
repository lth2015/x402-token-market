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
export {
  marvieProducts,
  selectByTags,
  getProductById,
  type RecallSortBy,
} from "./products";
export {
  habaAgentScenarios,
  bundleSuggestions,
  getScenarioById,
  getBundleById,
  getConsumerScenarios,
  getB2BScenarios,
} from "./scenarios";
export {
  tokenResalePlans,
  resaleChainNarrative,
  getPlanById,
} from "./resale";
export {
  habaB2BPartners,
  getPartnerById,
} from "./partners";
export {
  x402TopupSteps,
  x402CheckoutSteps,
} from "./payment";
