# HABA AI Commerce · Demo Site

HABA / ハーバー研究所 のヘルスフード EC のデモサイト。
独立部署的 Next.js 应用，跟 `netstars/`、`wea/`、`sdk/` 平级。

## 4-actor topology

```
[ HABA AI Commerce ]  ──购买 AI Token──▶  [ Netstars Token Gateway ]
   (this app)              x402 USDC               │
                                                   │ 委托
                                                   ▼
                                          [ WEA Japan Settlement ]
                                                   │
                                                   │ submit
                                                   ▼
                                          [ Solana — USDC SPL ]
```

详细背景见 [`docs/haba-demo-requirements.md`](../docs/haba-demo-requirements.md)。

## Tech stack

- Next.js 15 · React 19 · TypeScript
- Tailwind CSS（HABA 独立 design tokens — warm green + cream，跟 Console 的 tech blue 解耦）
- next-intl（zh-CN 主 / ja / en）

## Local dev

```bash
cd haba
npm install --legacy-peer-deps  # next@15.0.3 peer-deps issue, same as Console
npm run dev                     # → http://localhost:3001
```

或者通过 docker compose 启动：

```bash
docker compose up -d haba-site  # → http://localhost:3001
```

## Project layout

```
haba/
├── messages/{zh-CN,ja,en}.json       i18n
├── src/app/
│   ├── layout.tsx
│   ├── page.tsx                      Hero placeholder (M1)
│   └── globals.css
├── src/lib/
│   └── i18n/request.ts               next-intl request config
├── tailwind.config.ts                HABA design tokens
├── next.config.mjs
├── tsconfig.json
└── Dockerfile                        standalone output, port 3001
```

后续 milestones 会按 [`docs/haba-technical-plan.md §7`](../docs/haba-technical-plan.md#7-实现步骤5-个-milestone--按先项目骨架再页面顺序) 顺序补 `lib/haba/` mock + `components/` 业务组件。

## Independence from Netstars Console

按 [`docs/haba-technical-plan.md §5.1`](../docs/haba-technical-plan.md#51-跟-netstars-console-的隔离原则) 的隔离原则：

- **不** import `netstars/token/console/src/components/*`
- HABA 自己的 design tokens（这里）
- 共用工具（`cn()` 等）各自实现一份

如未来要抽公共 design-system 包，HABA 和 Console 再一起依赖；目前**两边各自演进**。
