import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET() {
  const db = await getDb();
  const config = db.getAllConfig();

  // 隐藏 API Key 值
  const safe = { ...config };
  if (safe.anthropic_api_key) safe.anthropic_api_key = safe.anthropic_api_key ? '***' : '';
  if (safe.openai_api_key) safe.openai_api_key = safe.openai_api_key ? '***' : '';
  if (safe.gemini_api_key) safe.gemini_api_key = safe.gemini_api_key ? '***' : '';

  return NextResponse.json({ data: safe });
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const db = await getDb();

    const keys = [
      'llm_provider', 'use_llm_analysis', 'llm_fallback_to_rules',
      'anthropic_api_key', 'openai_api_key', 'gemini_api_key',
      'claude_model', 'openai_model', 'gemini_model',
    ];

    for (const key of keys) {
      if (body[key] !== undefined) {
        db.setConfig(key, String(body[key]));
      }
    }

    return NextResponse.json({ message: '配置已保存' });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
