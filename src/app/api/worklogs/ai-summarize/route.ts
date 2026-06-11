import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";

/** AI 总结/优化工作日志内容 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const text = String(body.content ?? "").trim();
  const period = body.period === "MONTHLY" ? "月报" : "周报";
  if (!text) return NextResponse.json({ error: "请先填写工作进度内容" }, { status: 400 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "未配置 AI 功能（ANTHROPIC_API_KEY 缺失）" }, { status: 503 });
  }

  const prompt = `你是一个工作日志助手。请将以下原始工作进度记录总结优化为一份条理清晰的${period}内容。

要求：
- 按主题/项目分组，用条目化的方式呈现（用 1. 2. 3. 或 - 列表）
- 保留所有关键事实：数字、客户/项目名、完成状态、排期
- 语言精炼专业，去掉口语和重复
- 如有未完成事项或下一步计划，单独归入「下一步计划」
- 直接输出优化后的日志正文，不要任何前言或解释

原始记录：
${text.slice(0, 6000)}`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-3-5-haiku-20241022",
        max_tokens: 1500,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) {
      return NextResponse.json({ error: "AI 服务暂时不可用，请稍后重试" }, { status: 502 });
    }
    const data = await res.json();
    const result = data.content?.[0]?.text ?? "";
    if (!result.trim()) return NextResponse.json({ error: "AI 返回为空" }, { status: 500 });
    return NextResponse.json({ ok: true, content: result.trim() });
  } catch (e) {
    console.error("[worklogs ai-summarize]", e);
    return NextResponse.json({ error: "AI 总结失败，请重试" }, { status: 500 });
  }
}
