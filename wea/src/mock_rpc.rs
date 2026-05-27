// "Broadcast" via a stub — used in DEV because:
//   1. Apple Silicon can't run solanalabs/solana under QEMU (no AVX).
//   2. Production Wea will run on Wea Japan infra with a real RpcClient pool.
//
// The mock pretends a signed tx was accepted by Solana, returns a fake but
// well-shaped signature, and (on next confirmer tick) reports it as confirmed.
// To switch on real broadcast later, swap `MockRpc` with a trait impl that
// calls `solana_client::nonblocking::rpc_client::RpcClient::send_transaction`.

use anyhow::Result;
use std::time::Duration;

pub struct MockRpc;

impl MockRpc {
    /// "Broadcast" — sleeps briefly then returns a deterministic-ish signature.
    /// Real impl: decode tx, RPC `sendTransaction`, return the base58 sig.
    pub async fn send_transaction(&self, signed_tx_b64: &str) -> Result<String> {
        tokio::time::sleep(Duration::from_millis(50)).await;
        // Hash the signed tx so identical inputs return identical tx_hashes —
        // surfaces the "should have been idempotent" class of bugs sooner.
        use sha2::{Digest, Sha256};
        let mut h = Sha256::new();
        h.update(signed_tx_b64.as_bytes());
        let digest = h.finalize();
        Ok(format!("WEA_MOCK_{}", hex::encode(&digest[..16])))
    }

    /// "Get signature status" — returns `Some(Ok(()))` (confirmed) once 200ms
    /// have passed since broadcast. Real impl: RPC `getSignatureStatuses`.
    pub async fn get_signature_status(
        &self,
        _tx_hash: &str,
        broadcast_age: Duration,
    ) -> Result<Option<Result<(), String>>> {
        if broadcast_age >= Duration::from_millis(200) {
            Ok(Some(Ok(())))
        } else {
            Ok(None) // still pending
        }
    }
}
