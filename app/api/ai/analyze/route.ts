import { NextRequest, NextResponse } from 'next/server';
import { getLLMProvider } from '@/lib/llm';

export async function POST(req: NextRequest) {
  const start = Date.now();

  try {
    const body = await req.json();
    const { text, salesName, model, region } = body;

    if (!text) {
      return NextResponse.json({ error: 'text 为必填项' }, { status: 400 });
    }

    const provider = await getLLMProvider();

    if (!provider.isConfigured) {
      return NextResponse.json({
        success: false,
        error: `LLM Provider (${provider.provider}) 未配置 API Key，请检查环境变量`,
        provider: provider.provider,
      }, { status: 503 });
    }

    const result = await provider.analyze({ text, salesName, model, region });

    return NextResponse.json({
      success: true,
      data: result,
      provider: provider.provider,
      latency_ms: Date.now() - start,
    });

  } catch (e: any) {
    console.error('[LLM Analyze] Error:', e);
    return NextResponse.json({
      success: false,
      error: e.message || 'LLM 分析失败',
      latency_ms: Date.now() - start,
    }, { status: 500 });
  }
}
