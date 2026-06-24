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

// Lazy-load provider implementations
let _factory: typeof import('./llm-providers') | null = null;
let _cachedProvider: LLMClient | null = null;
let _cachedProviderType: string = '';

// ── Config (reads from DB) ──────────────────────────────────────

async function getConfigFromDb() {
  // Avoid circular import by lazy loading
  const { getDb } = await import('./db');
  const db = await getDb();
  return db.getAllConfig();
}

function getEnv(key: string, fallback: string): string {
  return process.env[key] || fallback;
}

// ── Provider getter ─────────────────────────────────────────────

export async function getLLMProvider(): Promise<LLMClient> {
  const config = await getConfigFromDb();

  const providerType = (
    config.llm_provider ||
    getEnv('LLM_PROVIDER', 'mock')
  ) as LLMProviderType;

  // Cache per process lifetime, but re-create if provider type changed
  if (_cachedProvider && _cachedProviderType === providerType) {
    return _cachedProvider;
  }

  if (!_factory) {
    _factory = await import('./llm-providers');
  }

  _cachedProviderType = providerType;
  _cachedProvider = _factory.createProvider(providerType, config);
  return _cachedProvider;
}

export async function isLLMEnabled(): Promise<boolean> {
  const config = await getConfigFromDb();
  return config.use_llm_analysis === 'true' || getEnv('USE_LLM_ANALYSIS', 'false') === 'true';
}

export async function shouldFallbackToRules(): Promise<boolean> {
  const config = await getConfigFromDb();
  return config.llm_fallback_to_rules !== 'false'; // default true
}

// Sync versions for hot paths (read env directly to avoid async)
export function isLLMEnabledSync(): boolean {
  return getEnv('USE_LLM_ANALYSIS', 'false') === 'true';
}
