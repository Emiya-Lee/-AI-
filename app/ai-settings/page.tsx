'use client';
import { useEffect, useState } from 'react';

const PROVIDERS = [
  { id: 'claude', name: 'Claude (Anthropic)', icon: '🤖', model: 'claude-sonnet-4-20250514' },
  { id: 'openai', name: 'OpenAI', icon: '🔵', model: 'gpt-4o-mini' },
  { id: 'gemini', name: 'Google Gemini', icon: '💎', model: 'gemini-2.0-flash' },
  { id: 'mock', name: 'Mock (开发测试)', icon: '🧪', model: '-' },
];

const DIMENSIONS = ['品牌', '技术/功能', '竞品对比', '售后政策', '价格策略', '尺寸安装'];

export default function AISettingsPage() {
  const [provider, setProvider] = useState('mock');
  const [apiKeys, setApiKeys] = useState({ anthropic: '', openai: '', gemini: '' });
  const [useLlm, setUseLlm] = useState(false);
  const [fallbackToRules, setFallbackToRules] = useState(true);
  const [models, setModels] = useState({ claude: '', openai: '', gemini: '' });
  const [testText, setTestText] = useState('顾客问这个电视和海信比怎么样，价格能便宜多少，有没有保修，送不送货上门安装。');
  const [testResult, setTestResult] = useState<any>(null);
  const [testing, setTesting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  // Load config from API on mount
  useEffect(() => {
    fetch('/api/ai/config')
      .then(r => r.json())
      .then(({ data }) => {
        if (data) {
          setProvider(data.llm_provider || 'mock');
          setUseLlm(data.use_llm_analysis === 'true');
          setFallbackToRules(data.llm_fallback_to_rules !== 'false');
          setModels({
            claude: data.claude_model || 'claude-sonnet-4-20250514',
            openai: data.openai_model || 'gpt-4o-mini',
            gemini: data.gemini_model || 'gemini-2.0-flash',
          });
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    try {
      const res = await fetch('/api/ai/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          llm_provider: provider,
          use_llm_analysis: String(useLlm),
          llm_fallback_to_rules: String(fallbackToRules),
          anthropic_api_key: apiKeys.anthropic,
          openai_api_key: apiKeys.openai,
          gemini_api_key: apiKeys.gemini,
          claude_model: models.claude,
          openai_model: models.openai,
          gemini_model: models.gemini,
        }),
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } catch (e: any) {
      alert('保存失败: ' + e.message);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/ai/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: testText,
          salesName: '测试销代',
          model: '75Z11L',
          region: '华南',
        }),
      });
      const json = await res.json();
      setTestResult(json);
    } catch (e: any) {
      setTestResult({ success: false, error: e.message });
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 bg-surface rounded animate-pulse" />
        <div className="grid grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => <div key={i} className="h-24 bg-surface rounded-xl animate-pulse" />)}
        </div>
      </div>
    );
  }

  const selectedProvider = PROVIDERS.find(p => p.id === provider)!;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">🤖 AI 模型配置</h1>
        <p className="text-text-secondary text-sm mt-1">配置 LLM API 用于录音 AI 分析</p>
      </div>

      {/* Provider Selection */}
      <div className="bg-surface border border-border rounded-xl p-5">
        <h2 className="text-base font-semibold mb-4">选择 AI Provider</h2>
        <div className="grid grid-cols-2 gap-3">
          {PROVIDERS.map(p => (
            <button
              key={p.id}
              onClick={() => setProvider(p.id)}
              className={`p-4 rounded-lg border text-left transition ${
                provider === p.id
                  ? 'border-primary bg-primary/10'
                  : 'border-border hover:border-primary/50'
              }`}
            >
              <div className="text-xl mb-1">{p.icon}</div>
              <div className={`font-medium text-sm ${provider === p.id ? 'text-primary' : ''}`}>{p.name}</div>
              <div className="text-xs text-text-secondary mt-1">模型: {p.model}</div>
            </button>
          ))}
        </div>
      </div>

      {/* API Keys */}
      <div className="bg-surface border border-border rounded-xl p-5">
        <h2 className="text-base font-semibold mb-4">API Key 配置</h2>
        <div className="space-y-4">
          <div>
            <label className="text-xs text-text-secondary block mb-1">Anthropic API Key (Claude)</label>
            <input type="password" value={apiKeys.anthropic}
              onChange={e => setApiKeys(k => ({ ...k, anthropic: e.target.value }))}
              placeholder="sk-ant-..." className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-xs text-text-secondary block mb-1">OpenAI API Key</label>
            <input type="password" value={apiKeys.openai}
              onChange={e => setApiKeys(k => ({ ...k, openai: e.target.value }))}
              placeholder="sk-..." className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-xs text-text-secondary block mb-1">Google Gemini API Key</label>
            <input type="password" value={apiKeys.gemini}
              onChange={e => setApiKeys(k => ({ ...k, gemini: e.target.value }))}
              placeholder="AI..." className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm" />
          </div>
        </div>
      </div>

      {/* Behavior Settings */}
      <div className="bg-surface border border-border rounded-xl p-5">
        <h2 className="text-base font-semibold mb-4">行为设置</h2>
        <div className="space-y-3">
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={useLlm} onChange={e => setUseLlm(e.target.checked)}
              className="w-4 h-4 rounded border-border accent-primary" />
            <div>
              <div className="text-sm font-medium">启用 LLM 分析</div>
              <div className="text-xs text-text-secondary">转写完成后自动调用 LLM 分析录音内容</div>
            </div>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={fallbackToRules} onChange={e => setFallbackToRules(e.target.checked)}
              className="w-4 h-4 rounded border-border accent-primary" />
            <div>
              <div className="text-sm font-medium">LLM 失败时回退到关键词分析</div>
              <div className="text-xs text-text-secondary">LLM 调用失败时保留现有关键词分析结果</div>
            </div>
          </label>
        </div>
      </div>

      {/* Test Area */}
      <div className="bg-surface border border-border rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold">🧪 API 测试</h2>
          <button onClick={handleTest} disabled={testing}
            className="px-4 py-2 bg-primary text-white rounded-lg text-sm hover:bg-primary/80 disabled:opacity-50 transition">
            {testing ? '测试中...' : '发送测试请求'}
          </button>
        </div>
        <div className="mb-4">
          <label className="text-xs text-text-secondary block mb-1">测试文本（模拟录音转写）</label>
          <textarea value={testText} onChange={e => setTestText(e.target.value)} rows={3}
            className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm resize-none" />
        </div>

        {testResult && (
          <div className="space-y-4">
            <div className={`p-3 rounded-lg text-sm ${testResult.success ? 'bg-accent/10 text-accent' : 'bg-danger/10 text-danger'}`}>
              {testResult.success
                ? `✅ 调用成功 | Provider: ${testResult.provider} | 耗时: ${testResult.latency_ms}ms`
                : `❌ 调用失败: ${testResult.error}`}
            </div>
            {testResult.success && testResult.data && (
              <>
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-bg rounded-lg p-3 text-center">
                    <div className="text-text-secondary text-xs">讲解覆盖率</div>
                    <div className="text-xl font-bold text-primary font-mono">{testResult.data.explanation_coverage_rate}%</div>
                  </div>
                  <div className="bg-bg rounded-lg p-3 text-center">
                    <div className="text-text-secondary text-xs">成交意向</div>
                    <div className="text-xl font-bold text-accent font-mono">{testResult.data.deal_likelihood}%</div>
                  </div>
                  <div className="bg-bg rounded-lg p-3 text-center">
                    <div className="text-text-secondary text-xs">覆盖维度</div>
                    <div className="text-xl font-bold text-warning font-mono">{testResult.data.covered_dimensions?.length}/6</div>
                  </div>
                </div>
                <div>
                  <div className="text-xs text-text-secondary mb-2">各维度得分</div>
                  <div className="grid grid-cols-2 gap-2">
                    {DIMENSIONS.map(dim => {
                      const score = testResult.data.scores?.[dim] ?? 0;
                      return (
                        <div key={dim} className="flex items-center gap-2">
                          <span className="text-xs text-text-secondary w-20">{dim}</span>
                          <div className="flex-1 h-2 bg-border rounded-full overflow-hidden">
                            <div className="h-full rounded-full" style={{
                              width: `${score}%`,
                              backgroundColor: score >= 70 ? '#22c55e' : score >= 40 ? '#f59e0b' : '#ef4444',
                            }} />
                          </div>
                          <span className="text-xs font-mono w-8 text-right">{score}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-3">
                  <div className="bg-bg rounded-lg p-3">
                    <div className="text-xs text-text-secondary mb-1">薄弱点分析</div>
                    <div className="text-sm">{testResult.data.weakness_analysis}</div>
                  </div>
                  <div className="bg-bg rounded-lg p-3">
                    <div className="text-xs text-text-secondary mb-1">AI 总结</div>
                    <div className="text-sm">{testResult.data.summary}</div>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Save */}
      <div className="flex items-center gap-3">
        <button onClick={handleSave}
          className="px-6 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/80 transition">
          💾 保存配置
        </button>
        {saved && <span className="text-accent text-sm">✅ 配置已保存</span>}
      </div>
    </div>
  );
}
