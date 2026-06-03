/**
 * WebAuthn-based biometric confirmation for stablecoin payments.
 *
 * The challenge passed to `navigator.credentials.create()` is bound to the
 * specific PaymentRequirements (sha256 over the requirements JSON). The
 * resulting credential's `clientDataJSON` therefore carries proof that
 * THIS specific payment was the one the user touched their fingerprint for —
 * not a generic "any payment" prompt.
 *
 * The credential's `attestationObject` (base64) is forwarded to the gateway
 * as `payload.userVerification` inside the X-PAYMENT body. The gateway logs
 * it for audit; it is not cryptographically verified server-side in this
 * MVP. Production would persist the credential at registration time and
 * verify subsequent assertions in WEA.
 *
 * Server-side credential storage / signature verification is not done here;
 * see DESIGN.md §payment-authz for the production model.
 */

export type BiometricSuccess = {
  ok: true;
  method: "platform";
  /** Base64 of the WebAuthn attestationObject from credentials.create(). */
  attestationObjectB64: string;
  /** Base64 of clientDataJSON — contains the challenge the user signed. */
  clientDataJsonB64: string;
  /** Base64-encoded JSON envelope ready to pass as X-PAYMENT.userVerification. */
  userVerificationEnvelope: string;
};

export type BiometricFailure = {
  ok: false;
  reason: "unsupported" | "cancelled" | "error";
  detail?: string;
};

export type BiometricResult = BiometricSuccess | BiometricFailure;

export async function isBiometricAvailable(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (!window.PublicKeyCredential) return false;
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

/**
 * Trigger Touch ID (or another platform authenticator) and bind the
 * resulting credential to a payment-specific challenge.
 *
 * @param paymentChallengeBytes  32 bytes derived from the PaymentRequirements
 *      the gateway issued. The browser puts this verbatim in
 *      clientDataJSON.challenge, the secure enclave signs the whole bundle,
 *      and we forward the result to the gateway as proof that the user
 *      authorised THIS payment (not just any payment).
 *
 * @param amountLabel  Human-readable string shown in the OS prompt
 *      ("HABA · ¥4,500 · 3.0 USDC").
 */
export async function requestBiometric(
  paymentChallengeBytes: Uint8Array,
  amountLabel: string,
): Promise<BiometricResult> {
  if (!(await isBiometricAvailable())) {
    return { ok: false, reason: "unsupported" };
  }
  try {
    const userId = crypto.getRandomValues(new Uint8Array(16));
    // Copy into a fresh ArrayBuffer so the WebAuthn types accept it
    // (TS 5.x narrows Uint8Array.buffer to ArrayBufferLike, which the spec
    // type BufferSource refuses).
    const challengeBuf = new ArrayBuffer(paymentChallengeBytes.byteLength);
    new Uint8Array(challengeBuf).set(paymentChallengeBytes);
    const userIdBuf = new ArrayBuffer(userId.byteLength);
    new Uint8Array(userIdBuf).set(userId);
    const credential = await navigator.credentials.create({
      publicKey: {
        challenge: challengeBuf,
        rp: { name: "HABA AI Commerce" },
        user: {
          id: userIdBuf,
          name: `haba-pay-${Date.now()}`,
          displayName: `HABA Payment · ${amountLabel}`,
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
    if (!credential || credential.type !== "public-key") {
      return { ok: false, reason: "cancelled" };
    }
    const att = (credential as PublicKeyCredential).response as AuthenticatorAttestationResponse;
    const attestationObjectB64 = arrayBufferToBase64(att.attestationObject);
    const clientDataJsonB64 = arrayBufferToBase64(att.clientDataJSON);
    const envelope = btoa(JSON.stringify({
      kind: "webauthn-attestation",
      attestationObject: attestationObjectB64,
      clientDataJSON: clientDataJsonB64,
      credentialId: arrayBufferToBase64((credential as PublicKeyCredential).rawId),
    }));
    return {
      ok: true,
      method: "platform",
      attestationObjectB64,
      clientDataJsonB64,
      userVerificationEnvelope: envelope,
    };
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

/**
 * Derive a 32-byte challenge for WebAuthn that uniquely binds a credential
 * creation to one specific payment-required round-trip.
 *
 * The challenge IS NOT secret — the gateway can recompute it from the same
 * requirements. The point is that the credential will only be valid if it
 * was created in response to this very requirements object.
 */
export async function paymentRequirementsChallenge(args: {
  resource: string;
  payTo: string;
  amountMicro: string;
  nonce?: string;
}): Promise<Uint8Array> {
  const data = new TextEncoder().encode(
    `x402-v1|${args.resource}|${args.payTo}|${args.amountMicro}|${args.nonce ?? ""}`,
  );
  // crypto.subtle.digest works in browsers and modern Node.
  const digest = await crypto.subtle.digest("SHA-256", data);
  return new Uint8Array(digest);
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin);
}
