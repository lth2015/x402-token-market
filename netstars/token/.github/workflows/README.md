# Token System · GitHub Actions Workflows

> **Tier 1 完整样板**：本目录是所有模块 CI/CD 的**主参考实现**。其他模块（sdk / x402 / wea）通过 stub workflow 引用本目录的设计原则；Tier 2 会复制并按模块特性调整。

## Workflows

| File | Trigger | Purpose |
|------|---------|---------|
| [ci.yml](ci.yml) | PR + main push (paths-filtered) | Lint / typecheck / test / SAST / dependency audit / build / Trivy 镜像扫描 |
| [deploy.yml](deploy.yml) | main → dev (auto) / release → prod (manual) / workflow_dispatch | Kustomize-driven EKS deploy with rollback |
| `e2e.yml` (Tier 2) | cron 02:00 JST | 跨模块 E2E（真实 Devnet） |

## 关键设计决策

### 1. AWS 鉴权：OIDC 模式
所有 AWS 操作通过 GitHub OIDC + IAM Role 信任策略，**无长期凭证**。Role ARN 按 env 区分：
```
arn:aws:iam::<dev_account>:role/gh-actions-token-deployer        ← dev
arn:aws:iam::<staging_account>:role/gh-actions-token-deployer    ← staging
arn:aws:iam::<prod_account>:role/gh-actions-token-deployer       ← prod
```

每个 Role 的 trust policy 严格限制：
- Repo: `netstars/x402-token-market`
- Branch: `main` / `release/*` / tag `v*.*.*`
- Workflow: 仅本目录下

### 2. 并发与隔离
- `concurrency: ci-token-${{ github.ref }}` + `cancel-in-progress: true` — 同 PR 多次 push 自动取消旧 CI
- Deploy 用 `cancel-in-progress: false` — prod 部署绝不并行

### 3. 镜像安全
- 多阶段构建（Dockerfile 在 `<service>/Dockerfile`）
- Trivy 扫描；CRITICAL / HIGH 直接阻断 merge
- SBOM + provenance 默认开启
- buildx cache 加速二次构建

### 4. 环境保护
GitHub Environments 配置：
- `dev` — 无审批
- `staging` — 无审批；但只接受 `release/*` 分支
- `prod` — **2 人审批**；只接受 `v*.*.*` tag；分批 rollout（rolling 25% → 50% → 100%）

### 5. 数据库迁移
- 每 PR 跑 `alembic upgrade head` 对 dev DB
- prod 部署前 `migration-check` job 强制人工 review
- 数据迁移与代码部署解耦（先 migration → 再 deploy 新代码 → 验证 → 才清理 legacy）

### 6. Rollback
任何 smoke test 失败自动 `kubectl rollout undo`（保留 3 个 revision history）。

## 其他模块如何复制

### SDK 模块（[sdk/.github/workflows/](../../../../sdk/.github/workflows/)）
不需要 EKS deploy；改成 PyPI publish workflow：
- `ci.yml`：同结构，去掉 console/service 相关
- `release.yml`：tag 触发 → build wheel → upload TestPyPI → 人工 approve → PyPI

### X402 / Wea 模块
- 复制 [ci.yml](ci.yml) → 改 path filter + 服务名 + Postgres seed
- 复制 [deploy.yml](deploy.yml) → 改 namespace + service list
- Wea 实际由 Wea Japan 在他们的 GitHub repo 维护；保持同样的 standard

## Secrets 清单（GitHub repo secrets）

| Secret | 用途 |
|--------|------|
| `AWS_ACCOUNT_ID_DEV` / `_STAGING` / `_PROD` / `_TOOLING` | OIDC role assumption |
| `ECR_REGISTRY` | Container registry URL |
| `CODECOV_TOKEN` | Code coverage upload |
| `SLACK_WEBHOOK_DEPLOYMENTS` | Deploy notification |
| `PYPI_API_TOKEN` (SDK only) | PyPI publish |

## 待补全（Tier 2）

- [ ] `e2e.yml` — 跨模块端到端测试（用 Playwright + 真实 Devnet）
- [ ] `release.yml`（SDK）—— PyPI / npm publish
- [ ] `infra-tf.yml` —— Terraform plan/apply（infra/ 仓库或子目录）
- [ ] `nightly.yml` —— DR drill + 性能基线
- [ ] `dependabot.yml` —— 依赖自动升级 PR
- [ ] CODEOWNERS + branch protection rules
