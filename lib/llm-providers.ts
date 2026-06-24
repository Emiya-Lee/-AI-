/**
 * LLM Provider Implementations
 * Claude (Anthropic), OpenAI, Gemini, Mock
 */

import type { LLMClient, LLMProviderType, AnalysisContext, AnalysisResult } from './llm';

const DIMENSIONS = ['品牌', '技术/功能', '竞品对比', '售后政策', '价格策略', '尺寸安装'];

const SYSTEM_PROMPT = `你是一个专业的销售能力分析师。你的任务是根据录音转写文本，分析销代在销售讲解过程中的表现。

## 评分维度（每个维度0-100分）
- 品牌：是否介绍了品牌历史、技术实力、品牌优势
- 技术/功能：是否讲解了产品技术参数、功能特点、画质/音质等核心功能
- 竞品对比：是否进行了与竞品（索尼/三星/海信/创维等）的对比分析
- 售后政策：是否讲解了保修政策、安装服务、退换货等售后保障
- 价格策略：是否进行了价格谈判、优惠活动、价格构成等讨论
- 尺寸安装：是否介绍了产品尺寸、观看距离建议、安装方式等

## 输出要求
请严格输出以下JSON格式，不要包含任何其他内容：
{
  "explanation_coverage_rate": number,      // 讲解覆盖率 0-100
  "covered_dimensions": string[],           // 已覆盖的维度列表
  "missing_dimensions": string[],          // 未覆盖的维度列表
  "deal_likelihood": number,                // 成交意向 0-100
  "weakness_analysis": string,             // 薄弱点分析（不超过100字）
  "summary": string,                       // 总结（不超过150字）
  "scores": { [key: string]: number }     // 各维度得分 0-100
}

## 注意事项
- covered_dimensions 和 missing_dimensions 必须是 DIMENSIONS 中的子集
- scores 对象必须包含所有6个维度的得分
- 如果文本信息不足以判断某个维度，给出保守估计分数(30-50分)
- deal_likelihood 基于顾客意向信号和价格讨论程度综合判断
- weakness_analysis 要具体指出讲解中的不足之处`;

const USER_PROMPT_TEMPLATE = (ctx: AnalysisContext) => `
## 待分析录音
销代姓名：${ctx.salesName || '未知'}
产品型号：${ctx.model || '未知'}
区域：${ctx.region || '未知'}

## 录音转写文本：
${ctx.text || '(无转写文本)'}

请根据以上录音转写文本，分析销代讲解表现。
`;

// ── Claude Provider ──────────────────────────────────────────────

async function createClaudeProvider(): Promise<LLMClient> {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic();

  return {
    provider: 'claude',
    get isConfigured() {
      return !!process.env.ANTHROPIC_API_KEY;
    },
    async analyze(ctx: AnalysisContext): Promise<AnalysisResult> {
      const model = process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514';
      const msg = await client.messages.create({
        model,
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: [{
          role: 'user',
          content: USER_PROMPT_TEMPLATE(ctx),
        }],
      });

      const text = msg.content[0].type === 'text' ? msg.content[0].text : '';
      return parseJsonResponse(text);
    },
  };
}

// ── OpenAI Provider ──────────────────────────────────────────────

async function createOpenAIProvider(): Promise<LLMClient> {
  const { default: OpenAI } = await import('openai');
  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  return {
    provider: 'openai',
    get isConfigured() {
      return !!process.env.OPENAI_API_KEY;
    },
    async analyze(ctx: AnalysisContext): Promise<AnalysisResult> {
      const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
      const response = await client.chat.completions.create({
        model,
        max_tokens: 1024,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: USER_PROMPT_TEMPLATE(ctx) },
        ],
      });

      const text = response.choices[0]?.message?.content || '';
      return parseJsonResponse(text);
    },
  };
}

// ── Gemini Provider ──────────────────────────────────────────────

async function createGeminiProvider(): Promise<LLMClient> {
  return {
    provider: 'gemini',
    get isConfigured() {
      return !!process.env.GEMINI_API_KEY;
    },
    async analyze(ctx: AnalysisContext): Promise<AnalysisResult> {
      const apiKey = process.env.GEMINI_API_KEY!;
      const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

      const body = {
        contents: [{
          parts: [{
            text: `${SYSTEM_PROMPT}\n\n${USER_PROMPT_TEMPLATE(ctx)}`,
          }],
        }],
        generationConfig: { maxOutputTokens: 1024, temperature: 0.3 },
      };

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        throw new Error(`Gemini API error: ${res.status}`);
      }

      const data = await res.json() as any;
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      return parseJsonResponse(text);
    },
  };
}

// ── Mock Provider (dev / no API key) ────────────────────────────

function createMockProvider(): LLMClient {
  return {
    provider: 'mock',
    get isConfigured() { return true; },
    async analyze(ctx: AnalysisContext): Promise<AnalysisResult> {
      // Deterministic fake result based on text length
      const len = ctx.text.length;
      const covered = len > 100
        ? DIMENSIONS.slice(0, 4)
        : DIMENSIONS.slice(0, 2);
      const missing = DIMENSIONS.filter(d => !covered.includes(d));

      return {
        explanation_coverage_rate: Math.round((covered.length / DIMENSIONS.length) * 100),
        covered_dimensions: covered,
        missing_dimensions: missing,
        deal_likelihood: Math.min(95, Math.round(40 + (len % 50))),
        weakness_analysis: '（Mock模式：未调用真实LLM）讲解维度覆盖不完整，建议补充竞品对比和价格策略讲解。',
        summary: `（Mock模式）录音文本长${len}字，讲解覆盖${covered.length}/6个维度，成交意向中等。建议销代加强产品技术讲解和价格谈判技巧。`,
        scores: Object.fromEntries(DIMENSIONS.map((d, i) => [d, covered.includes(d) ? 70 + (i * 5) : 30 + (i * 3)])),
      };
    },
  };
}

// ── JSON Response Parser ────────────────────────────────────────

function parseJsonResponse(text: string): AnalysisResult {
  // Try to extract JSON from markdown code blocks or raw text
  const match = text.match(/```(?:json)?\s*([\s\S]*?)```|([\s\S]*)/);
  const jsonStr = (match?.[1] || match?.[2] || text).trim();

  try {
    const parsed = JSON.parse(jsonStr);
    // Validate and fill defaults
    return {
      explanation_coverage_rate: Number(parsed.explanation_coverage_rate) || 0,
      covered_dimensions: Array.isArray(parsed.covered_dimensions) ? parsed.covered_dimensions : [],
      missing_dimensions: Array.isArray(parsed.missing_dimensions) ? parsed.missing_dimensions : [],
      deal_likelihood: Number(parsed.deal_likelihood) || 0,
      weakness_analysis: String(parsed.weakness_analysis || ''),
      summary: String(parsed.summary || ''),
      scores: typeof parsed.scores === 'object' && parsed.scores !== null
        ? parsed.scores
        : Object.fromEntries(DIMENSIONS.map(d => [d, 50])),
    };
  } catch (e) {
    console.error('[LLM] Failed to parse JSON response:', e);
    // Fall back to mock-like result
    return {
      explanation_coverage_rate: 50,
      covered_dimensions: DIMENSIONS.slice(0, 3),
      missing_dimensions: DIMENSIONS.slice(3),
      deal_likelihood: 50,
      weakness_analysis: 'LLM响应格式解析失败，请检查LLM输出',
      summary: '分析完成，但LLM返回格式异常',
      scores: Object.fromEntries(DIMENSIONS.map(d => [d, 50])),
    };
  }
}

// ── Factory ─────────────────────────────────────────────────────

export function createProvider(type: LLMProviderType): LLMClient {
  switch (type) {
    case 'claude':
      if (!process.env.ANTHROPIC_API_KEY) {
        console.warn('[LLM] ANTHROPIC_API_KEY not set, falling back to mock');
        return createMockProvider();
      }
      // Return async wrapper
      return {
        provider: 'claude',
        get isConfigured() { return !!process.env.ANTHROPIC_API_KEY; },
        analyze: (ctx) => createClaudeProvider().then(p => p.analyze(ctx)),
      };
    case 'openai':
      if (!process.env.OPENAI_API_KEY) {
        console.warn('[LLM] OPENAI_API_KEY not set, falling back to mock');
        return createMockProvider();
      }
      return {
        provider: 'openai',
        get isConfigured() { return !!process.env.OPENAI_API_KEY; },
        analyze: (ctx) => createOpenAIProvider().then(p => p.analyze(ctx)),
      };
    case 'gemini':
      if (!process.env.GEMINI_API_KEY) {
        console.warn('[LLM] GEMINI_API_KEY not set, falling back to mock');
        return createMockProvider();
      }
      return {
        provider: 'gemini',
        get isConfigured() { return !!process.env.GEMINI_API_KEY; },
        analyze: (ctx) => createGeminiProvider().then(p => p.analyze(ctx)),
      };
    case 'mock':
    default:
      return createMockProvider();
  }
}
