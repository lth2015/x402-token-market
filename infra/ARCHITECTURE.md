# Infrastructure Architecture（AWS EKS / Aurora MySQL / ALB · QA 单一环境）

> **范围**：AWS 账户、网络、EKS、Aurora MySQL RDS、ALB、Secrets、K8s YAML 资源结构
> **属于**：[../ARCHITECTURE.md](../ARCHITECTURE.md)
> **版本**：v1.2 · **日期**：2026-05-26
> **关键决策（v1.2）**：
> - **单一 QA 环境**（local 用 docker-compose；prod 等业务再开）
> - **手写 K8s YAML**（不引入 Terraform / Kustomize / Helm）
> - **Aurora MySQL 8.0**（不用 PostgreSQL）

---

## 1. AWS 账户结构（极简）

```
netstars-qa            统一 AWS 账户（v1 阶段）
   ├─ EKS cluster: netstars-qa
   ├─ Aurora MySQL: 3 clusters (x402-qa, token-qa, wea-qa)
   ├─ ElastiCache: redis-qa
   ├─ ECR: 4 repos
   ├─ Secrets Manager
   └─ ALB / Route 53 / WAF / ACM

wea-qa                  Wea Japan 独立账户
   ├─ EKS cluster: wea-qa
   ├─ Aurora MySQL: wea-qa
   ├─ KMS (CMK, ap-northeast-1): wallet keys (encrypt-at-rest for Ed25519 keypair)
   └─ Solana RPC clients
```

> 未来开 prod 时再增一个 `netstars-prod` 账户，避免 blast radius。

---

## 2. 网络拓扑

### 2.1 VPC（单 region: ap-northeast-1 Tokyo）
```
VPC: vpc-netstars-qa (10.0.0.0/16)
├─ Public Subnets   10.0.0.0/20    (3 AZ: 1a/1c/1d, ALB + NAT GW)
├─ Private Subnets  10.0.16.0/20   (3 AZ, EKS worker nodes)
└─ DB Subnets       10.0.48.0/20   (3 AZ, Aurora + ElastiCache)

Egress：经 NAT GW；尽量用 VPC Endpoint 减少出口流量
├─ VPC Endpoint: S3 (Gateway, free)
├─ VPC Endpoint: ECR (Interface)
├─ VPC Endpoint: Secrets Manager (Interface)
└─ VPC Endpoint: STS / CloudWatch Logs (Interface)
```

### 2.2 跨账户连接（Netstars ↔ Wea）
- **VPC Peering**（Master PRD D4 默认选择）
- CIDR：netstars `10.0.0.0/16` ↔ wea `10.1.0.0/16`（不重叠）
- 仅允许特定子网（X402 namespace 的 service IP 范围 ↔ Wea API endpoint）

---

## 3. EKS 集群

### 3.1 集群配置
```
Cluster: netstars-qa
├─ Kubernetes: 1.30+
├─ Control Plane: AWS-managed Multi-AZ
├─ API endpoint: 私网（通过 bastion / SSM Session Manager 访问）
├─ Node Groups:
│   ├─ system-ng    (m6i.large × 3, taint=system, addons only)
│   └─ workload-ng  (m6i.large × 3, autoscaling 3-10, 业务 Pod 跑这里)
└─ Addons:
    ├─ aws-load-balancer-controller  (ALB Ingress)
    ├─ external-secrets-operator     (Secrets Manager → K8s Secret)
    ├─ external-dns                  (Route 53 自动)
    ├─ aws-ebs-csi-driver / vpc-cni / coredns
    ├─ aws-otel-collector (DaemonSet → CloudWatch + X-Ray)
    └─ kube-prometheus-stack (Helm install)   ← Tier 3
```

> **未引入**：Karpenter（用 cluster-autoscaler 即可，简单）、Istio（v1 不要 service mesh）、ArgoCD（GH Actions 直部署）。

### 3.2 Namespace 划分
```
default            (空)
kube-system        (addons)
external-secrets   (operator)
ingress            (ALB controller)
observability      (OTel + 监控)
x402               (X402 网关)
token              (Token API + Console + Worker)
                   (wea 不在本 cluster；在 wea-qa 账户)
```

### 3.3 IRSA（IAM Roles for ServiceAccounts）

每个模块的 ServiceAccount → 独立 IAM Role。最小权限。

```
sa: x402-api    → iam-role: x402-api-role
  - secrets:GetSecretValue → /qa/x402/*
  - kms:Decrypt → arn:.../key/x402-data-key

sa: token-api   → iam-role: token-api-role
  - secrets:GetSecretValue → /qa/token/*
  - kms:Decrypt → arn:.../key/token-data-key
  - s3:PutObject → arn:aws:s3:::netstars-invoices-qa/*

sa: token-worker → iam-role: token-worker-role
  - 含 token-api 权限 + ses:SendEmail (告警邮件)
```

---

## 4. Aurora MySQL 8.0 RDS

### 4.1 集群拓扑
| 业务 | 集群名 | 实例规格 | Multi-AZ | 备注 |
|------|--------|---------|---------|------|
| X402 | `x402-qa` | db.r6g.large × 2 (writer + reader) | ✓ | reader 用于报表 |
| Token | `token-qa` | db.r6g.xlarge × 2 | ✓ | 读多写多，规格大些 |
| Wea | `wea-qa` (在 wea 账户) | db.r6g.large × 2 | ✓ | 由 Wea 团队管理 |

**为何按模块拆**：故障隔离；migration 互不阻塞；权限边界清晰；Aurora 集群级备份独立。

### 4.2 Aurora 关键参数（cluster parameter group）
```
character_set_server         = utf8mb4
collation_server             = utf8mb4_0900_ai_ci
time_zone                    = +00:00              (UTC)
sql_mode                     = STRICT_TRANS_TABLES,NO_ENGINE_SUBSTITUTION,ONLY_FULL_GROUP_BY
innodb_lock_wait_timeout     = 30
transaction_isolation        = READ-COMMITTED       (默认 REPEATABLE-READ；改成 RC 减少 gap lock 降低锁竞争)
require_secure_transport     = 1                    (强制 TLS)
log_bin_trust_function_creators = 1
performance_schema           = 1
```

实例 parameter group：
```
slow_query_log               = 1
long_query_time              = 0.5
log_queries_not_using_indexes = 1
```

### 4.3 连接策略
- **Writer endpoint**：所有写操作 + 强一致读
- **Reader endpoint**：报表 / Console dashboard 聚合查询
- v1 不引入 ProxySQL；每 Pod 内嵌连接池（应用层 e.g. SQLAlchemy pool: min=2 max=10）
- v2 引入 RDS Proxy（managed 连接池，Aurora 友好）

### 4.4 备份 / 恢复
- 自动备份：保留 7 天（QA），未来 prod 升 35 天
- 手动 snapshot：每月一次，跨 region 复制到 ap-northeast-3
- PITR：开启（RPO ≤ 5 分钟）
- 季度演练：snapshot → 临时 cluster → 验证应用启动 + 关键查询

### 4.5 加密
- **At-rest**：Aurora 默认 KMS 加密（每模块独立 KMS CMK）
- **In-transit**：强制 SSL（`require_secure_transport=1`）
- **PII 字段**：应用层 AES-256-GCM；数据 key 用 KMS data key（envelope encryption）

### 4.6 用户管理
```
-- 应用账号（最小权限）
CREATE USER 'x402_app'@'%' IDENTIFIED BY '<rotate-30d>';
GRANT SELECT, INSERT, UPDATE ON x402_qa.* TO 'x402_app'@'%';
REVOKE DELETE ON x402_qa.audit_log FROM 'x402_app'@'%';
REVOKE UPDATE ON x402_qa.audit_log FROM 'x402_app'@'%';

-- 只读账号（报表/排障）
CREATE USER 'x402_ro'@'%' IDENTIFIED BY '<rotate-30d>';
GRANT SELECT ON x402_qa.* TO 'x402_ro'@'%';
```

凭证存在 Secrets Manager；30 天自动轮换（RDS Secrets Manager 集成开启）。

---

## 5. ALB + Route 53 + WAF

### 5.1 域名规划（v1 / QA）
```
qa.api.netstars.jp              → token-api (主对外 API)
qa.gateway.netstars.jp          → x402-api
qa.app.netstars.jp              → token-console
qa.developer.netstars.jp        → SDK docs (CloudFront + S3, 可选)
qa.status.netstars.jp           → status page

未来 prod 上线时：去掉 `qa.` 前缀
```

### 5.2 ALB 配置
- TLS 1.3 only
- ACM 证书：单张通配证书 `*.netstars.jp`（自动续期）
- WAF：AWSManagedRulesCommonRuleSet + AWSManagedRulesKnownBadInputsRuleSet + Rate limit 1000 req/5min/IP
- 健康检查：`/readyz`
- Access log 写到 S3 + Athena 可查

### 5.3 Ingress 实现：每模块一个 K8s Ingress 对象
详见 [k8s/x402/ingress.yaml](k8s/x402/ingress.yaml) / [k8s/token/ingress.yaml](k8s/token/ingress.yaml)

---

## 6. Secrets Manager

### 6.1 路径约定
```
/qa/x402/db-credentials              { username, password, host, port, dbname }
/qa/x402/wea-callback-hmac
/qa/x402/internal-mtls-cert
/qa/token/db-credentials
/qa/token/anthropic-api-key
/qa/token/openai-api-key
/qa/token/grok-api-key
/qa/token/gemini-api-key
/qa/token/pii-data-key               (KMS data key, base64)
/qa/wea/x402-callback-hmac           (in wea AWS account)
/qa/wea/solana-wallet-master-id      (在 wea 账户 KMS 中)
```

### 6.2 External Secrets Operator 同步
统一 ClusterSecretStore（详见 [k8s/_shared/external-secrets.yaml](k8s/_shared/external-secrets.yaml)）+ 每模块的 ExternalSecret 对象。

### 6.3 轮换
- DB 凭证：30 天（RDS Secrets Manager 集成）
- HMAC secrets：90 天，双 secret 滚动（新旧并存 7 天）
- AI Provider key：手动（涉及合同变更）

---

## 7. CI/CD 拓扑（简化为单一 QA）

```
Developer commit
   │
   ▼
GitHub Actions (ci.yml)
   - lint / type / test / SAST / dep audit
   - build docker → push ECR :main-<sha>
   - Trivy scan (HIGH 阻断)
   │
   ▼ on main merge
GitHub Actions (deploy.yml)
   - aws sts assume-role-with-web-identity (OIDC)
   - kubectl apply -f infra/k8s/<module>/ (按文件夹批量)
   - rollout status wait
   - smoke test
   - rollback on failure
   │
   ▼
EKS Cluster: netstars-qa
```

**无需 staging/prod 分支**：v1 main 直接进 QA；prod 上线时再加 release branch + manual approval。

---

## 8. K8s YAML 文件组织

```
infra/k8s/
├─ _shared/
│   ├─ namespaces.yaml             所有 namespace
│   ├─ external-secrets.yaml       ClusterSecretStore (AWS Secrets Manager)
│   ├─ alb-config.yaml             AWS Load Balancer Controller config
│   └─ networkpolicy-default.yaml  默认 deny-all
├─ x402/
│   ├─ deployment.yaml             api + worker (一个文件，资源相关聚合)
│   ├─ service.yaml
│   ├─ ingress.yaml
│   ├─ hpa.yaml
│   ├─ pdb.yaml
│   ├─ serviceaccount.yaml         (含 IRSA annotation)
│   ├─ externalsecret.yaml         (DB / HMAC creds)
│   └─ configmap.yaml
├─ token/
│   └─ ...同上 (但有 api + worker + console 3 个 Deployment)
└─ wea/                              (本 repo 提供模板；实际部署在 wea 账户)
    └─ ...
```

**部署命令**（开发者本机或 CI）：
```bash
# 全量
kubectl apply -f infra/k8s/_shared/
kubectl apply -f infra/k8s/x402/
kubectl apply -f infra/k8s/token/

# 单模块滚动更新
kubectl set image -n x402 deploy/x402-api api=<NEW_IMAGE>
kubectl rollout status -n x402 deploy/x402-api

# 滚回
kubectl rollout undo -n x402 deploy/x402-api
```

---

## 9. 观测性栈（QA 阶段简化）

| 关注点 | QA 方案 | Prod 升级 |
|--------|---------|----------|
| Logs | CloudWatch Logs（aws-otel-collector → CW） | 加 S3 归档 + Athena 查询 |
| Metrics | CloudWatch Metrics（Pod 暴露 `/metrics` → 由 OTel Collector scrape） | 加 Grafana Cloud / 自建 Prometheus |
| Traces | AWS X-Ray | 同 |
| Alerts | CloudWatch Alarms → SNS → Slack/Email | 加 PagerDuty |
| Dashboard | CloudWatch Dashboards（手动建几个） | 完整 SLO dashboard |

> v1 QA 阶段**不引入 Prometheus + Grafana**；用 CloudWatch 足够（少运维）。生产阶段再评估。

---

## 10. 灾难恢复（QA 阶段轻量）

| 风险 | QA 应对 |
|------|---------|
| EKS cluster down | 重新 `eksctl create` + `kubectl apply -f infra/k8s/` 全量（< 60 分钟） |
| Aurora 主库 down | Multi-AZ 自动 failover（< 2 分钟） |
| Region 不可用 | QA 不做 cross-region；prod 时加 |
| 应用 bug 致数据损坏 | Aurora PITR 恢复到事故前时间点 |

---

## 11. 成本估算（月度 · QA 单一环境）

| 项 | 估算 |
|----|------|
| EKS Control Plane | ¥10K |
| EC2 (3-10 nodes m6i.large) | ¥30-100K |
| Aurora MySQL (3 clusters × db.r6g.large/xlarge) | ¥80-150K |
| ElastiCache (cache.t4g.small × 2) | ¥10K |
| ALB / WAF / Route 53 | ¥10K |
| CloudWatch / X-Ray / S3 | ¥10K |
| ECR / Secrets / Data transfer | ¥10K |
| **QA 月度合计** | **¥160-300K** |

未来开 prod 后总成本增 2-3 倍（参考 Master ARCH §10）。

---

## 12. 与本架构对齐的下层文档

- [k8s/_shared/](k8s/_shared/) — 共享资源
- [k8s/x402/](k8s/x402/) — X402 模块
- [k8s/token/](k8s/token/) — Token 模块
- [k8s/wea/](k8s/wea/) — Wea 模块（template）
- 各模块 DESIGN.md：实现细节
- 各模块 db/SCHEMA.sql：MySQL DDL
- 各模块 db/migrations/：版本化迁移
