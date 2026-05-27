# Wea · K8s Manifests (TEMPLATE)

> **重要**：Wea 实际运行在 **Wea Japan 独立 AWS 账户** 的 EKS cluster。
> 本目录的 manifests 是 Netstars × Wea 双方共同遵守的 **架构模板**；Wea 团队复制到他们的仓库后落地。
> Netstars cluster **不部署** 本目录内容。

文件清单（与 x402 / token 对称）：
- `serviceaccount.yaml`  — wea-api / wea-worker / wea-callback 三个 SA（IRSA 指向 wea AWS 账户的 role）
- `configmap.yaml`       — Solana RPC URLs、callback URL（指向 Netstars x402）等
- `externalsecret.yaml`  — DB creds、HMAC secret、Solana KMS key ID
- `deployment.yaml`      — api + worker (leader) + callback
- `service.yaml`         — ClusterIP (Wea 内部；不对外暴露 ALB)
- `ingress.yaml`         — 内部 ALB；仅 VPC Peering 来的 traffic 可访问
- `hpa.yaml` / `pdb.yaml` / `networkpolicy.yaml`

关键差异（vs Netstars 模块）：
- `runtime`: Rust (静态 musl binary; scratch image; ~20MB)
- `worker`: 必须 **leader 单实例**（链上广播不可并发）
- `KMS`: 通过 IRSA 给 wea-worker SA 授权访问 Solana 钱包 KMS key
- ingress 是 **internal-facing**（不暴露公网）；调用方仅 Netstars VPC

详细架构见 [../../../wea/ARCHITECTURE.md](../../../wea/ARCHITECTURE.md) 与 [../../../wea/DESIGN.md](../../../wea/DESIGN.md)。
