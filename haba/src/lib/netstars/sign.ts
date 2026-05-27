/**
 * HMAC-SHA256 signing for Netstars Token API — TypeScript port of
 * sdk/src/netstars/transport.py `sign_request`. Keep the two in lock-step;
 * if the server-side string-to-sign format changes in token-api/auth.py,
 * update BOTH files.
 *
 * NOTE: this is a server-only module — it reads env vars and uses the
 * node `crypto` module. Never import it from a client component.
 */
import "server-only";
import { createHash, createHmac, randomBytes } from "node:crypto";

export type NetstarsSignedHeaders = {
  Authorization: string;
  "X-Netstars-Timestamp": string;
  "X-Netstars-Nonce": string;
  "X-Netstars-Signature": string;
};

export function signRequest(args: {
  method: string;
  /** Path only — must NOT include query string (server signs request.url.path) */
  path: string;
  body: string | Buffer;
  apiKeyId: string;
  apiKeySecret: string;
}): NetstarsSignedHeaders {
  const { method, path, body, apiKeyId, apiKeySecret } = args;
  const ts = Math.floor(Date.now() / 1000).toString();
  const nonce = randomBytes(16).toString("hex");
  const bodyBuf = typeof body === "string" ? Buffer.from(body, "utf-8") : body;
  const bodySha = createHash("sha256").update(bodyBuf).digest("hex");
  const stringToSign = `${method.toUpperCase()}\n${path}\n${ts}\n${nonce}\n${bodySha}`;
  const sig = createHmac("sha256", apiKeySecret).update(stringToSign).digest("hex");
  return {
    Authorization: `Bearer ${apiKeyId}`,
    "X-Netstars-Timestamp": ts,
    "X-Netstars-Nonce": nonce,
    "X-Netstars-Signature": sig,
  };
}
