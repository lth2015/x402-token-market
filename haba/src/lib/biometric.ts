/**
 * WebAuthn-based biometric confirmation for stablecoin payments.
 *
 * On macOS Chrome / Safari, this triggers the native Touch ID dialog via the
 * platform authenticator. The credential created is discarded — WebAuthn is
 * used here purely as a presence + user-verification gate before releasing
 * USDC on-chain (which is irreversible).
 *
 * Server-side credential storage / signature verification is NOT done here.
 * For a production stablecoin gate you would persist the credential and
 * re-verify on subsequent payments; this is a client-side intent-to-pay UX.
 */

export type BiometricResult =
  | { ok: true; method: "platform" }
  | { ok: false; reason: "unsupported" | "cancelled" | "error"; detail?: string };

export async function isBiometricAvailable(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (!window.PublicKeyCredential) return false;
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

export async function requestBiometric(amountLabel: string): Promise<BiometricResult> {
  if (!(await isBiometricAvailable())) {
    return { ok: false, reason: "unsupported" };
  }
  try {
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const userId = crypto.getRandomValues(new Uint8Array(16));
    const credential = await navigator.credentials.create({
      publicKey: {
        challenge,
        rp: { name: "HABA AI Commerce" },
        user: {
          id: userId,
          name: `haba-pay-${Date.now()}`,
          displayName: `HABA 支付确认 · ${amountLabel}`,
        },
        pubKeyCredParams: [
          { type: "public-key", alg: -7 },   // ES256
          { type: "public-key", alg: -257 }, // RS256
        ],
        authenticatorSelection: {
          authenticatorAttachment: "platform",
          userVerification: "required",
          requireResidentKey: false,
        },
        timeout: 60_000,
        attestation: "none",
      },
    });
    if (!credential) return { ok: false, reason: "cancelled" };
    return { ok: true, method: "platform" };
  } catch (e) {
    const name = e instanceof Error ? e.name : "Unknown";
    if (name === "NotAllowedError" || name === "AbortError") {
      return { ok: false, reason: "cancelled" };
    }
    return {
      ok: false,
      reason: "error",
      detail: e instanceof Error ? e.message : String(e),
    };
  }
}
