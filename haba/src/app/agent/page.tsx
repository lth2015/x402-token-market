/**
 * /agent — 终端 AI Agent 演示页面。
 *
 * PRD §3.1 P3 persona ("终端 AI Agent / 机器用户") 的 UI 入口。模拟
 * 一台 Agent 用 API key 自动跑工作流：读余额 → 多次调用 Advisor →
 * 余额低时自动 topup → 继续 → 收尾总结。整个过程是 HABA 站点上唯一
 * 由"机器主导"的演示场景。
 */
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { SectionTitle } from "@/components/shared/SectionTitle";
import { AgentRunner } from "@/components/agent-runner/AgentRunner";

export const dynamic = "force-dynamic";

export default function AgentRunnerPage() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-16 lg:px-12 lg:py-20">
      <Link
        href="/"
        className="mb-4 inline-flex items-center gap-1 text-caption text-ink-tertiary hover:text-brand-primary"
      >
        <ArrowLeft className="h-3 w-3" aria-hidden /> 返回首页
      </Link>

      <SectionTitle
        eyebrow="终端 Agent · 高级演示"
        title="一台机器用户自动跑完 HABA 工作流"
        description="选一个剧本，点 Run — 下面的 terminal 会真打出每一笔后端 HTTP 调用、每一次 Token 扣减、以及自动触发的余额补足。整个过程是真的，跨终端可在 Netstars Console Live Activity Ticker 同步看到。"
      />

      <AgentRunner />
    </main>
  );
}
