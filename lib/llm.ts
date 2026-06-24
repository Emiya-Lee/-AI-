/**
 * LLM Provider Interface
 * Supports: claude, openai, gemini, mock
 */

export type LLMProviderType = 'claude' | 'openai' | 'gemini' | 'mock';

export interface AnalysisContext {
  salesName: string;
  model: string;
  region: string;
  text: string;
}

export interface AnalysisResult {
  explanation_coverage_rate: number;   // 0-100
  covered_dimensions: string[];
  missing_dimensions: string[];
  deal_likelihood: number;            // 0-100
  weakness_analysis: string;
  summary: string;
  scores: Record<string, number>;       // per-dimension scores 0-100
}

export interface LLMClient {
  readonly provider: LLMProviderType;
  readonly isConfigured: boolean;
  analyze(ctx: AnalysisContext): Promise<AnalysisResult>;
}

// Lazy-load provider implementations to avoid import errors when not needed
let _factory: typeof import('./llm-providers') | null = null;
async function getFactory() {
  if (!_factory) {
    _factory = await import('./llm-providers');
  }
  return _factory;
}

let _cachedProvider: LLMClient | null = null;

/**
 * Get the configured LLM provider based on LLM_PROVIDER env var.
 * Caches the result for the lifetime of the process.
 */
export async function getLLMProvider(): Promise<LLMClient> {
  if (_cachedProvider) return _cachedProvider;

  const providerType = (process.env.LLM_PROVIDER || 'mock') as LLMProviderType;
  const factory = await getFactory();

  _cachedProvider = factory.createProvider(providerType);
  return _cachedProvider;
}

/**
 * Check if LLM analysis is enabled via env var.
 */
export function isLLMEnabled(): boolean {
  return process.env.USE_LLM_ANALYSIS === 'true';
}

/**
 * Check if fallback to rules is enabled when LLM fails.
 */
export function shouldFallbackToRules(): boolean {
  return process.env.LLM_FALLBACK_TO_RULES !== 'false'; // default true
}
