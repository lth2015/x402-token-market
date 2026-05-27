// Payment step diagrams — MOCK · documentation source.
//
// Two flavours, both 8 steps, both share the same X402PaymentStep type:
//   - x402TopupSteps:    场景 A · HABA 给自己充 AI Token（主线）
//   - x402CheckoutSteps: 场景 B · 终端消费者支付商品款给 HABA（P1）
//
// Actor labels are consumer-neutral (gateway / settler / chain). HABA's
// upstream payment vendor is a real external integration but is not
// surfaced on the consumer site — see types.ts PaymentActorKind comment.

import type { X402PaymentStep } from "./types";

// ──────────────────────────────────────────────────────────────────
// 场景 A · HABA 充 Token
// ──────────────────────────────────────────────────────────────────
export const x402TopupSteps: readonly X402PaymentStep[] = [
  {
    n: 1,
    fromActor: "haba",
    toActor: "gateway",
    label: "发起充值",
    note: "HABA SDK 检测到 Token 余额低于阈值，自动发起 10,000 Token 充值",
    detailZh: "由 HABA 站点内 SDK 触发，amount=10000，附幂等键避免重复扣款。",
  },
  {
    n: 2,
    fromActor: "gateway",
    toActor: "haba",
    label: "返回支付要求",
    note: "支付通道返回 amount / nonce / 收款地址等预签数据",
    detailZh: "包含 USDC 金额、防重放 nonce、链上收款地址。",
  },
  {
    n: 3,
    fromActor: "haba",
    toActor: "gateway",
    label: "提交客户端签名",
    note: "HABA 钱包客户端签名 USDC 转账并提交。私钥不离开浏览器。",
    detailZh: "client-side 签名是核心安全保证 — HABA 服务器不持有私钥。",
  },
  {
    n: 4,
    fromActor: "gateway",
    toActor: "settler",
    label: "转发结算",
    note: "支付通道将签名后的结算请求转给链上执行层（mTLS + HMAC）",
    detailZh: "网关层不直接上链，由独立的链上执行层负责广播。",
  },
  {
    n: 5,
    fromActor: "settler",
    toActor: "chain",
    label: "广播 USDC 转账",
    note: "执行层通过托管 RPC 把交易广播到公链",
    detailZh: "broadcaster worker 单进程 leader-elected，处理高并发结算。",
  },
  {
    n: 6,
    fromActor: "chain",
    toActor: "settler",
    label: "链上确认",
    note: "区块链确认（confirmed level，< 1s）",
    detailZh: "demo 用 mock RPC；prod 用 confirmed 或 finalized 取决于客户配置。",
  },
  {
    n: 7,
    fromActor: "settler",
    toActor: "gateway",
    label: "结算回调",
    note: "执行层通过 HMAC-signed webhook 把链上状态回调给支付通道",
    detailZh: "callback 失败时按 5m/15m/1h/6h/24h 5 档重试。",
  },
  {
    n: 8,
    fromActor: "gateway",
    toActor: "haba",
    label: "Token 入账",
    note: "支付通道更新 HABA Token 余额并 webhook 通知 HABA 站点",
    detailZh: "HABA 页面立即看到 Token 余额 +10,000，AI Advisor 可继续接收 B2B / C 端调用。",
  },
] as const satisfies readonly X402PaymentStep[];

// ──────────────────────────────────────────────────────────────────
// 场景 B · 消费者付商品款给 HABA（可选 P1 演示）
// ──────────────────────────────────────────────────────────────────
export const x402CheckoutSteps: readonly X402PaymentStep[] = [
  {
    n: 1,
    fromActor: "customer",
    toActor: "haba",
    label: "提交购物车结账",
    note: "消费者在 HABA 站点选择「USDC 钱包支付」结账方式",
    detailZh: "传统电商也可走信用卡 / 日元；此条只用于 USDC 演示。",
  },
  {
    n: 2,
    fromActor: "haba",
    toActor: "gateway",
    label: "创建订单",
    note: "HABA 站点以「HABA 为收款方」创建支付订单",
    detailZh: "注意：此处 HABA 是收款方，不是买方；钱流向 HABA。",
  },
  {
    n: 3,
    fromActor: "gateway",
    toActor: "customer",
    label: "返回支付要求",
    note: "支付通道把支付要求转给消费者的钱包客户端",
    detailZh: "消费者可用任意兼容钱包（Phantom / Solflare 等）签名。",
  },
  {
    n: 4,
    fromActor: "customer",
    toActor: "gateway",
    label: "提交客户端签名",
    note: "消费者钱包签名 USDC 转账并提交",
    detailZh: "tx 是 customer → HABA 的 USDC 转账。",
  },
  {
    n: 5,
    fromActor: "gateway",
    toActor: "settler",
    label: "转发结算",
    note: "支付通道转发结算给执行层",
    detailZh: "和场景 A 同一套基础设施。",
  },
  {
    n: 6,
    fromActor: "settler",
    toActor: "chain",
    label: "广播 USDC 转账",
    note: "执行层广播到公链",
  },
  {
    n: 7,
    fromActor: "settler",
    toActor: "gateway",
    label: "结算回调",
    note: "HMAC-signed webhook 回调",
  },
  {
    n: 8,
    fromActor: "haba",
    toActor: "customer",
    label: "订单确认",
    note: "HABA 收到入账回调，订单状态更新为 paid，消费者看到订单页",
    detailZh: "demo 中订单号为 #ord_XXXX 占位，真实履约不发生。",
  },
] as const satisfies readonly X402PaymentStep[];
