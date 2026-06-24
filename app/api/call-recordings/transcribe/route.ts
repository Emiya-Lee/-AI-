import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';
import { getDb } from '@/lib/db';
import { isLLMEnabled, shouldFallbackToRules, getLLMProvider } from '@/lib/llm';

export async function POST(): Promise<NextResponse> {
  const scriptPath = path.join(process.cwd(), 'scripts', 'transcribe.py');
  const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';

  // Run Python script as child process
  const transcriptionResult = await new Promise<{ code: number; stdout: string; stderr: string }>((resolve) => {
    const proc = spawn(pythonCmd, [scriptPath], {
      cwd: process.cwd(),
      shell: true,
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => { stdout += data.toString(); });
    proc.stderr.on('data', (data) => { stderr += data.toString(); });

    proc.on('close', (code) => resolve({ code: code || 0, stdout, stderr }));
    proc.on('error', (err) => resolve({ code: 1, stdout: '', stderr: err.message }));
  });

  if (transcriptionResult.code !== 0) {
    return NextResponse.json({
      success: false,
      error: transcriptionResult.stderr || transcriptionResult.stdout || '转写失败',
      code: transcriptionResult.code,
    }, { status: 500 });
  }

  // ── LLM Analysis (after transcription) ──────────────────────────
  let llmResult: { analyzed: number; errors: string[] } | null = null;

  if (isLLMEnabled()) {
    try {
      llmResult = await runLLMAnalysis();
    } catch (e: any) {
      console.error('[Transcribe] LLM analysis error:', e);
      if (!shouldFallbackToRules()) {
        return NextResponse.json({
          success: false,
          error: `LLM分析失败: ${e.message}`,
          transcription_ok: true,
          llm_error: true,
        }, { status: 500 });
      }
      // Fall through: keep rule-based results
    }
  }

  return NextResponse.json({
    success: true,
    output: transcriptionResult.stdout,
    transcription_ok: true,
    llm: llmResult
      ? { analyzed: llmResult.analyzed, errors: llmResult.errors }
      : null,
    llm_skipped: !isLLMEnabled(),
  });
}

// ── LLM Analysis Helper ──────────────────────────────────────────

async function runLLMAnalysis(): Promise<{ analyzed: number; errors: string[] }> {
  const db = await getDb();
  const provider = await getLLMProvider();

  if (!provider.isConfigured) {
    console.warn('[Transcribe] LLM provider not configured, skipping analysis');
    return { analyzed: 0, errors: ['LLM provider not configured'] };
  }

  // Get all pending recordings that have transcription text
  const pending = db.prepare(`
    SELECT * FROM call_recordings
    WHERE status = 'pending' AND length(transcription) > 0
  `).all() as any[];

  if (pending.length === 0) {
    return { analyzed: 0, errors: [] };
  }

  const errors: string[] = [];
  let analyzed = 0;

  for (const rec of pending) {
    try {
      const result = await provider.analyze({
        text: rec.transcription,
        salesName: rec.sales_name,
        model: rec.model || '',
        region: rec.region || '',
      });

      // Update with LLM results (overwrite rule-based)
      db.prepare(`
        UPDATE call_recordings SET
          status = 'analyzed',
          explanation_coverage_rate = ?,
          deal_rate = ?,
          avg_interest_score = ?,
          weakness_analysis = ?,
          ai_summary = ?,
          scores = ?
        WHERE id = ?
      `).run(
        result.explanation_coverage_rate,
        result.deal_likelihood,
        50, // avg_interest_score not in result schema, use default
        result.weakness_analysis,
        result.summary,
        JSON.stringify(result.scores),
        rec.id,
      );
      analyzed++;

    } catch (e: any) {
      errors.push(`Recording ${rec.id}: ${e.message}`);
      // Mark as analyzed (keep rule-based from Python)
      db.prepare(`UPDATE call_recordings SET status = 'analyzed' WHERE id = ?`).run(rec.id);
    }
  }

  return { analyzed, errors };
}
