<!--
  story.md — X402 Token Market · HABA Demo 叙事脚本
  用途：① 下午内部演示的串场故事　② GPT 图像生成（img2）的海报文案来源
  范围：HABA × Netstars 联合项目内部 demo；含未公开商品规划与合作意向，外部披露以双方书面文件为准。
-->

# 一勺甜，背后一条链

> **Logline（一句话）**
> 女儿为糖尿病的母亲买一瓶代糖——这个最普通的下午，背后是一个会自己思考、自己付费、自己上链结算的 AI 商务生态在悄悄运转。

---

## 0. 这个故事要证明什么

把抽象的「x402 Token Market」翻译成一句人话：

> **AI 帮人做选择，帮人花钱，帮人结算——全程自动、可计量、可上链验证。**

四个相关方，各司其职，独立部署，只靠 API / 协议握手：

| 角色 | 在故事里是谁 | 干什么 |
|---|---|---|
| **HABA / ハーバー研究所** | 开店的人 | 卖健康食品、买 AI 能力、把 AI 能力再转售 |
| **Netstars** | 收银台与账本 | x402 支付网关 + Token 计量与账本 |
| **WEA Japan** | 跑腿上链的人 | 把每一笔结算真实广播到公链 |
| **Solana** | 公开的真相 | USDC 稳定币在链上落定，谁都能查 |

---

## 1. 登场人物

- **美咲（Misaki）**，35 岁，东京。母亲查出糖尿病前期，她想买一瓶「能加进咖啡、也能下厨」的代糖，却被满货架的术语劝退。
- **HABA AI Advisor**，看不见的店员。它不睡觉、不催单、不推销，只根据卡路里、甜度、使用场景三件事，挑出最合适的那一款。
- **田中先生**，街角药局的药剂师。他不懂 AI，但他的收银屏幕背后，调用的正是同一个 HABA AI Advisor。
- **那台机器**，没有名字。它是一个终端 Agent——余额快用完时，它自己掏钱、自己充值、继续干活，全程没有人碰键盘。

---

## 2. 主线故事

### 幕一 · 一个普通的下午

美咲坐在厨房的餐桌前，手机屏幕的光打在脸上。她想给母亲买代糖，但「赤藓糖醇」「甜菊糖苷」「升糖指数」这些词像一堵墙。

她在 HABA 的页面上敲下一句最朴素的话：

> 「我想给糖尿病家人买低卡甜味料，最好可以做料理也能直接放饮料里。」

屏幕右上角，一颗小小的绿色光点亮起——**HABA AI Advisor 醒了**。

### 幕二 · 看不见的店员开口

几秒钟。Advisor 没有列术语，它直接递上两款 MARVIE 商品，每一款都附三条理由：**零卡路里**、**甜度是砂糖的 200 倍所以一两滴就够**、**冷热都能瞬溶**。

美咲松了口气，点下「全部加入购物车」。

> 而就在这一次回答完成的瞬间，页面顶端那枚 Token 余额，悄悄少了一点。
> 那是 HABA 为这次「AI 思考」付出的成本——精确到个位、实时记账。美咲看不见，但账本记得清清楚楚。

### 幕三 · 一笔钱，走完一条链

美咲结账，选择「USDC 钱包支付」。

进度条转起来——这一次不是动画在演戏，是真的在等：

1. HABA 发起支付请求
2. Netstars 的收银台返回金额、防重放随机数、收款地址
3. 钱包在浏览器里签名，私钥从不离开本地
4. WEA 接过结算单，把交易广播到 Solana
5. 链上确认，不到一秒
6. 回调层层返回，订单状态翻成「已支付」

十几秒后，屏幕绽放一枚脉冲绿环：**订单已确认**。下面是一串谁都能复制去区块链浏览器验证的 **真实交易哈希**。

> 美咲只看到「买好了」。她不知道，这一勺甜的背后，钱已经在一条公开的链上落定，永远查得到。

### 幕四 · 同一个店员，换上四张脸

镜头拉远。

街角，**田中先生**的药局。顾客掏出会员卡，扫码——他的收银屏幕弹出一模一样的推荐，只是这次穿着「药局前台」的皮肤。

医院的营养科、独立营养师的工作台、合作电商的首页挂件——**同一个 HABA AI Advisor，四种接入形态**。每一次调用，都记进 HABA 的月度套餐：`42 / 50,000`，数字在屏幕上真实地跳动。

> HABA 从 Netstars 买来 AI 能力，转身把它打包成「健康顾问」，按调用量卖给上游伙伴。
> **Token 在这条链上被消费了两次。** 一买，一卖，飞轮转起来了。

### 幕五 · 没有人在键盘前

最后一个镜头，没有人。

一台终端 Agent 在自动跑：读余额、连续发起十几次咨询、每一笔都精确扣费。跑到一半，余额跌破阈值——

它没有报警，没有等人。它**自己**发起了一笔 10 USDC 的充值，链上确认，余额回满，然后**继续干活**。

终端里的日志一行行刷过，像心跳。

> 这是这个故事真正的结尾：当买方也是一台机器，整条链路——选择、计量、付费、上链——**不再需要人。**

---

## 3. 演示串场对照表

| 幕 | 打开哪里 | 现场动作 | 观众该看到 |
|---|---|---|---|
| 幕一 / 二 | HABA 首页 `:3001` | 点一个场景 → 点「真打一次」 | 真 Claude 回复 + 顶部 Token 余额实时下降 |
| 幕三 | `/cart` | 加购物车 → 「USDC 钱包结账」 | 等 10–30s → 脉冲绿环 + **真 Devnet 交易哈希** + Explorer 验证按钮 |
| 幕四 | `/b2b` | 切换 4 个 persona → 任一「真打一次」 | 月度调用数 `41 → 42` 实时跳动 |
| 幕五 | `/agent` | Run「调到余额低 → 自动 topup」 | 终端日志连续调用 + 自动充值上链 |
| 收尾 | Netstars Console `:3000` | 打开 Live Activity Ticker | 刚才每一笔，跨表面同步可见——**同一份账本** |

> 演示提示：结账时的十几秒不是卡顿，是真在等 Solana 确认。大方地说出来——「我们正在等链上 confirmation」——那正是真实性的证据。

---

## 4. 海报生成 Prompt（GPT 图像 / img2）

> 统一基调：温暖、自然、健康；底层有一缕看不见的「数字电流」。
> 主色板：**HABA 翠绿 `#0F9D58` + 奶油白 `#FAFAF7` + 森林墨绿 `#0B3D2E`**，点缀琥珀金 `#F59E0B`。
> 排版：留白充足，不要赛博朋克，不要霓虹冷色；干净、明亮、有呼吸感。

### 海报 A — 主视觉「一勺甜，背后一条链」

```
A warm, bright editorial poster, cream-white background. In the foreground,
a single drop of clear liquid sweetener falling from a minimalist dropper
bottle into a cup of coffee on a sunlit kitchen table. From the ripple in
the coffee, a thin luminous emerald-green thread spirals outward and
transforms into a delicate flowing circuit line that travels across the
poster, linking four small glowing nodes labeled subtly: a storefront, a
ledger/receipt, a courier in motion, and a transparent blockchain cube.
Soft morning light, shallow depth of field, gentle film grain. Palette:
emerald #0F9D58, cream #FAFAF7, forest ink #0B3D2E, amber #F59E0B accents.
Calm, premium, healthy, human — NOT cyberpunk, NOT neon. Negative space at
top for a title. 3:4 vertical poster.
```

### 海报 B — 「同一个店员，四张脸」

```
A clean four-panel grid poster on warm cream background. Each panel shows
the same friendly abstract AI-assistant glyph (a soft emerald orb with a
single calm highlight) wearing a different context: a home kitchen, a
pharmacy counter, a hospital nutrition desk, an e-commerce storefront
widget. A continuous thin green circuit line stitches all four panels
together, implying one brain behind four faces. Flat, modern, editorial
illustration style. Palette emerald #0F9D58 + cream + forest ink, amber
accents. Bright, trustworthy, healthcare-grade. 4:3 horizontal.
```

### 海报 C — 「没有人在键盘前」（飞轮 / 自动化）

```
A minimalist conceptual poster: an empty wooden desk bathed in soft daylight,
a glowing terminal screen showing flowing green log lines, and NO person in
the chair. Above the desk, a translucent flywheel made of light slowly
turning, its spokes formed by emerald data threads connecting USDC coins,
a Token meter, and a Solana-like crystalline chain cube. Sense of quiet
autonomy and momentum. Warm cream + emerald palette, amber glints. Premium,
serene, slightly cinematic. NOT dark, NOT dystopian — bright and hopeful.
3:4 vertical poster, generous top negative space for a headline.
```

### 备用标题词（叠加在海报上，任选）

- 主标：**一勺甜，背后一条链**
- 副标：AI 帮你选 · 帮你付 · 帮你上链
- 英文：*One drop of sweetness. A whole chain behind it.*

---

## 5. 一句话收尾（演示结束时说）

> 「美咲只想给妈妈买瓶好用的代糖。
> 她得到了。
> 而我们，在她看不见的地方，让 AI 完成了一次会思考、会付费、会上链的完整交易——
> 这就是 X402 Token Market。」
