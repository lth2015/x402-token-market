/**
 * Checkout amount policy shared by the cart UI and checkout route.
 *
 * Demo transactions are intentionally kept below 10 USDC so the Devnet payer
 * wallet survives repeated executive demos while still producing real on-chain
 * evidence.
 */
export const USDC_RATE_JPY = 150;
export const MIN_CHECKOUT_USDC = 0.10;
export const MAX_CHECKOUT_USDC = 9.00;

export function jpyToRawUsdc(totalJpy: number): number {
  return +(totalJpy / USDC_RATE_JPY).toFixed(4);
}

export function clampCheckoutUsdc(rawUsdc: number): number {
  if (rawUsdc < MIN_CHECKOUT_USDC) return MIN_CHECKOUT_USDC;
  if (rawUsdc > MAX_CHECKOUT_USDC) return MAX_CHECKOUT_USDC;
  return rawUsdc;
}

export function jpyToCheckoutUsdc(totalJpy: number): number {
  return clampCheckoutUsdc(jpyToRawUsdc(totalJpy));
}

export function getCheckoutClampState(totalJpy: number) {
  const rawUsdc = jpyToRawUsdc(totalJpy);
  const checkoutUsdc = clampCheckoutUsdc(rawUsdc);
  return {
    rawUsdc,
    checkoutUsdc,
    isFloorApplied: rawUsdc < MIN_CHECKOUT_USDC,
    isCapApplied: rawUsdc > MAX_CHECKOUT_USDC,
  };
}
