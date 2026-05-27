# 明天去办公室要做的事情 — HABA Demo 完整激活清单

**背景**：代码已全部完成，下面的步骤都是"填入真实密钥 + 充值测试钱包"，不需要改代码。
按顺序完成后，`/cart` 结账就能触发真实 Solana Devnet USDC 链上交易，成功页会显示可在 Explorer 验证的 tx hash。

---

## ✅ Step 0 — 确认代码版本

```bash
cd ~/workplace/x402-token-market
git log --oneline -3
# 应该能看到最新 commit
docker compose ps   # 确认所有服务 healthy（需要先 make up）
```

---

## 🔑 Step 1 — 申请 Anthropic API Key（真实 LLM 调用）

1. 登录 https://console.anthropic.com
2. 用公司信用卡充值（建议先充 $10）
3. 创建 API Key（Project Key）
4. 复制 `sk-ant-api03-...` 开头的 key

然后编辑 `.env`：

```bash
# 打开 .env（在项目根目录）
nano .env
# 找到这一行：
#   ANTHROPIC_API_KEY=sk-ant-DUMMY
# 改为：
#   ANTHROPIC_API_KEY=sk-ant-api03-你的真实key...
```

**效果**：`/topup` 和 `/agent` 的"真打一次"按钮会调用真实 Claude claude-haiku-4-5 模型，回复内容更智能。
目前 stub 模式已能展示，如果 demo 时间紧可以先跳过这步。

---

## 💳 Step 2 — 生成演示钱包（一次性）

```bash
# 在 x402-api 容器内运行（它已安装 solders）
docker compose exec x402-api python /app/scripts/setup-devnet-wallet.py

# 或者本机有 Python + solders：
pip install 'solders>=0.21'
python scripts/setup-devnet-wallet.py
```

**脚本会打印类似这样的内容：**

```
  MERCHANT WALLET (receives USDC from customers)
    Public key:  AAA...bbb
    USDC ATA:    CCC...ddd

  DEMO PAYER WALLET (sends USDC in server-side checkout)
    Public key:  EEE...fff
    USDC ATA:    GGG...hhh

  DEMO_PAYER_PRIVATE_KEY_B64 (put this in .env):
    xxxxxxxx+yyyyyyy/zzzzzzzz==
```

**把以下两个值复制到 `.env`：**

```dotenv
DEPOSIT_RECIPIENT_ADDRESS=<merchant Public key 这里>
DEMO_PAYER_PRIVATE_KEY_B64=<base64 私钥这里>
```

> ⚠️ 私钥不要提交 git，`.env` 已在 `.gitignore` 中。

---

## 🪙 Step 3 — 给 Payer 钱包充 SOL（tx 手续费）

Solana 每笔交易需要约 0.000005 SOL 手续费。

**方法 A（推荐，不需要安装 solana-cli）：**

1. 浏览器打开：https://solfaucet.com 或 https://faucet.solana.com
2. 网络选 **Devnet**
3. 粘贴 DEMO PAYER 的 Public key
4. 请求 2 SOL（免费，测试用）

**方法 B（如果本机安装了 solana-cli）：**

```bash
solana airdrop 2 <PAYER_PUBLIC_KEY> --url devnet
```

**验证是否到账：**

```
# 浏览器打开（替换地址）:
https://explorer.solana.com/address/<PAYER_PUBLIC_KEY>?cluster=devnet
```

---

## 💵 Step 4 — 给 Payer 钱包充 devnet USDC

> Devnet USDC 不是真钱，只用于演示。

1. 浏览器打开：**https://faucet.circle.com**
2. 左侧选链：**Solana**
3. 右侧选网络：**Devnet** (Testnet)
4. 粘贴 **DEMO PAYER** 的 Public key
5. 点击"Get Tokens"，申请 10 USDC-Dev（免费）
6. 等 10-30 秒到账

**验证 USDC ATA 是否到账：**

```
# 替换地址后浏览器打开：
https://explorer.solana.com/address/<PAYER_USDC_ATA>?cluster=devnet
```

> 每次 `/cart` 结账最多花 $9 USDC（MAX_USDC 限制）。
> 10 USDC 约能演示 1 轮完整流程，用完再从 faucet 申请即可。

---

## 🔁 Step 5 — 重建 x402-api 并重启

填好 `.env` 后，需要重建才能让环境变量生效：

```bash
# 在项目根目录
docker compose build x402-api
docker compose up -d --no-deps x402-api

# 等待 x402-api 变成 healthy（约30秒）
docker compose ps x402-api
```

---

## ✔ Step 6 — 验证配置

```bash
# 检查 demo_payer_configured 是否为 true
curl -s http://localhost:8081/ | python3 -m json.tool | grep demo_payer

# 预期输出：
#   "demo_payer_configured": true,
```

如果看到 `"demo_payer_configured": false`，检查 `.env` 中的 `DEMO_PAYER_PRIVATE_KEY_B64` 是否正确填入。

---

## 🎬 Step 7 — 完整链路 smoke test

1. 打开 http://localhost:3001/
2. 将任意商品加入购物车（点"加入购物车"）
3. 点右上角购物车图标 → 进入 `/cart`
4. 点击"USDC 钱包结账"
5. 等待 10-30 秒（Solana Devnet 确认时间）
6. 成功页应显示：
   - ✅ "真实 Devnet 链上交易" 绿色徽章
   - tx hash（链上真实值）
   - "在 Solana Explorer 查看" 按钮（点击可跳转验证）

---

## 📋 完成后检查清单

| 项目 | 状态 |
|------|------|
| `ANTHROPIC_API_KEY` 填入 `.env` | ⬜ |
| `DEPOSIT_RECIPIENT_ADDRESS` 填入 `.env` | ⬜ |
| `DEMO_PAYER_PRIVATE_KEY_B64` 填入 `.env` | ⬜ |
| Payer 钱包有 SOL（手续费）| ⬜ |
| Payer 钱包有 USDC-Dev（≥10）| ⬜ |
| x402-api 重建并重启 | ⬜ |
| `curl localhost:8081/ → demo_payer_configured: true` | ⬜ |
| `/cart` 结账出现 Explorer 链接 | ⬜ |

---

## 🆘 常见问题排查

**问题：`demo_payer_configured: false`**
→ 检查 `.env` 的 `DEMO_PAYER_PRIVATE_KEY_B64` 是否有空格或换行；rebuild x402-api。

**问题：结账后 chain_mode 是 "dev"（没有走真链）**
→ 查看 x402-api 日志：`docker compose logs x402-api --tail=50`
→ 常见原因：Devnet RPC 超时（Devnet 偶尔不稳），重试即可；或 USDC 余额不足。

**问题：Solana Explorer 显示"Transaction not found"**
→ Devnet Explorer 有时延迟，等 1-2 分钟刷新。

**问题：USDC 余额不足（支付失败）**
→ 回到 https://faucet.circle.com 再申请 10 USDC。每天可申请多次。

**问题：SOL 余额不足（手续费）**
→ 回到 https://solfaucet.com 再 airdrop。

---

## 🔐 安全备忘

- `.env` 内的私钥 (`DEMO_PAYER_PRIVATE_KEY_B64`) 只是演示钱包，持有少量 devnet 测试币（不是真钱）。
- 不要把 `.env` 提交 git（已在 `.gitignore`）。
- 演示结束后可随时废弃这对密钥对，再运行 `setup-devnet-wallet.py` 生成新的。
- KMS 约定：生产环境的私钥管理用 **AWS KMS ap-northeast-1** 直调，禁 CloudHSM / 内部 KMS。

---

*Last updated: 2026-05-27 · 对应代码 commit: 见 git log*
