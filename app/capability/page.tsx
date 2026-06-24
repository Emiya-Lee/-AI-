'use client';
import { useEffect, useState, useCallback } from 'react';
import { ConcernCompareChart, NegotiationChart, WeaknessWordCloud, WeaknessCategoryChart, RepModelCompareChart, InterestLevelChart, CoverageBarChart, RepTrendChart } from '@/components/CapabilityCharts';

const CONCERN_OPTIONS = ['价格', '质量', '售后', '品牌', '外观', '尺寸', '功能'];
const EXPLAINED_OPTIONS = ['价格', '质量', '售后', '品牌', '外观', '尺寸', '功能', '对比'];
const SALES_OPTIONS = ['康希凌', '黄家珍', '张三', '李四', '王五'];
const WEAKNESS_CATEGORIES = ['产品知识不足', '讲解思路不清', '讲解不够清晰落地', '价格拉扯不充分', '其他'];

export default function CapabilityPage() {
  const [analytics, setAnalytics] = useState<any>(null);
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [models, setModels] = useState<any[]>([]);
  const [stores, setStores] = useState<any[]>([]);

  // 筛选状态
  const [filterSalesName, setFilterSalesName] = useState('');
  const [filterModel, setFilterModel] = useState('');
  const [filterResult, setFilterResult] = useState('');
  const [filterWeakness, setFilterWeakness] = useState('');

  // 录音分析状态
  const [recordings, setRecordings] = useState<any[]>([]);
  const [recordingsLoading, setRecordingsLoading] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [activeTab, setActiveTab] = useState<'record' | 'capability' | 'knowledge'>('capability');
  const [editingRecording, setEditingRecording] = useState<any>(null);

  // 知识库状态
  const [questions, setQuestions] = useState<any[]>([]);
  const [insights, setInsights] = useState<any[]>([]);
  const [baselines, setBaselines] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);
  const [extractLoading, setExtractLoading] = useState(false);
  const [uploadForm, setUploadForm] = useState({
    sales_name: '',
    region: '',
    deal_result: ''
  });

  const [form, setForm] = useState({
    sales_name: '', store_id: '', region: '', model: '',
    communication_duration: 20, model_explanation_duration: 10,
    customer_interest_level: '中', customer_concerns: [] as string[],
    sales_explained: [] as string[], customer_understood: '',
    price_negotiation_count: 1, price_negotiation_result: '成交',
    weakness_category: '', weakness_desc: '',
    record_date: new Date().toISOString().split('T')[0],
  });

  useEffect(() => {
    fetch('/api/models').then(r => r.json()).then(d => setModels(d.data || [])).catch(() => {});
    fetch('/api/stores').then(r => r.json()).then(d => setStores(d.data || [])).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // 构建筛选查询
      const filterParams = new URLSearchParams();
      if (filterSalesName) filterParams.set('sales_name', filterSalesName);
      if (filterModel) filterParams.set('model', filterModel);
      if (filterResult) filterParams.set('result', filterResult);
      if (filterWeakness) filterParams.set('weakness', filterWeakness);
      const qs = filterParams.toString() ? `?${filterParams.toString()}` : '';

      const [anRes, recRes] = await Promise.all([
        fetch('/api/analytics/capability'),
        fetch(`/api/capability${qs}`),
      ]);
      const an = await anRes.json();
      const rec = await recRes.json();
      setAnalytics(an);
      setRecords(rec.data || []);
    } finally {
      setLoading(false);
    }
  }, [filterSalesName, filterModel, filterResult, filterWeakness]);

  useEffect(() => { load(); }, [load]);

  // 加载录音列表
  const loadRecordings = useCallback(async () => {
    setRecordingsLoading(true);
    try {
      const r = await fetch('/api/call-recordings');
      const d = await r.json();
      setRecordings(d.data || []);
    } finally {
      setRecordingsLoading(false);
    }
  }, []);

  useEffect(() => { loadRecordings(); }, []);

  // 清空全部录音记录
  const handleClearRecordings = async () => {
    if (!confirm('⚠️ 确认清空全部录音记录？此操作不可恢复！')) return;
    setClearing(true);
    try {
      await fetch('/api/call-recordings', { method: 'DELETE' });
      loadRecordings();
    } finally {
      setClearing(false);
    }
  };

  // 扫描新录音
  const scanRecordings = async () => {
    const r = await fetch('/api/call-recordings', { method: 'PATCH' });
    const d = await r.json();
    if (d.data && d.data.length > 0) {
      for (const f of d.data) {
        await fetch('/api/call-recordings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ file_name: f.name, file_path: f.path }),
        });
      }
    }
    loadRecordings();
  };

  // 转写录音
  const handleTranscribe = async () => {
    setTranscribing(true);
    try {
      await fetch('/api/call-recordings/transcribe', { method: 'POST' });
      loadRecordings();
    } finally {
      setTranscribing(false);
    }
  };

  // 更新录音关联的销代
  const updateRecordingSalesName = async (id: number, sales_name: string) => {
    await fetch(`/api/call-recordings?id=${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sales_name }),
    });
    loadRecordings();
  };

  // 删除录音记录
  const handleDeleteRecording = async (id: number) => {
    if (!confirm('确认删除该录音记录？')) return;
    await fetch(`/api/call-recordings?id=${id}`, { method: 'DELETE' });
    loadRecordings();
  };

  // 上传文件
  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    const fileInput = document.getElementById('file-upload') as HTMLInputElement;
    if (!fileInput?.files?.[0]) {
      alert('请选择文件');
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', fileInput.files[0]);
      formData.append('sales_name', uploadForm.sales_name);
      formData.append('region', uploadForm.region);
      formData.append('deal_result', uploadForm.deal_result);

      const r = await fetch('/api/call-recordings', { method: 'PUT', body: formData });
      if (!r.ok) throw new Error('上传失败');
      alert('上传成功');
      setUploadForm({ sales_name: '', region: '', deal_result: '' });
      fileInput.value = '';
      loadRecordings();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setUploading(false);
    }
  };

  // 加载知识库
  const loadKnowledge = useCallback(async () => {
    try {
      const [qRes, iRes, bRes] = await Promise.all([
        fetch('/api/knowledge?type=questions'),
        fetch('/api/knowledge?type=insights'),
        fetch('/api/knowledge?type=baselines'),
      ]);
      const q = await qRes.json();
      const i = await iRes.json();
      const b = await bRes.json();
      setQuestions(q.data || []);
      setInsights(i.data || []);
      setBaselines(b.data || []);
    } catch (e) {
      console.error('Failed to load knowledge', e);
    }
  }, []);

  // 提取知识库
  const handleExtractKnowledge = async () => {
    setExtractLoading(true);
    try {
      const r = await fetch('/api/knowledge', { method: 'POST' });
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      alert(d.message || '知识库提取完成');
      loadKnowledge();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setExtractLoading(false);
    }
  };

  // 更新录音的成交结果
  const updateRecordingDealResult = async (id: number, deal_result: string) => {
    await fetch(`/api/call-recordings?id=${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deal_result }),
    });
    loadRecordings();
  };

  const toggleArr = (field: 'customer_concerns' | 'sales_explained', val: string) => {
    setForm(f => {
      const arr = f[field];
      return { ...f, [field]: arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val] };
    });
  };

  const handleStoreChange = (storeId: string) => {
    const store = stores.find((s: any) => String(s.id) === storeId);
    setForm(f => ({
      ...f,
      store_id: storeId,
      region: store ? store.region : '',
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.sales_name || !form.record_date) return alert('请填写销代姓名和日期');
    if (!form.model) return alert('请选择讲解机型');
    setSubmitting(true);
    try {
      const r = await fetch('/api/capability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!r.ok) throw new Error('保存失败');
      setForm({
        sales_name: '', store_id: '', region: '', model: '',
        communication_duration: 20, model_explanation_duration: 10,
        customer_interest_level: '中', customer_concerns: [],
        sales_explained: [], customer_understood: '',
        price_negotiation_count: 1, price_negotiation_result: '成交',
        weakness_category: '', weakness_desc: '',
        record_date: new Date().toISOString().split('T')[0],
      });
      load();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('确认删除该记录？')) return;
    await fetch(`/api/capability?id=${id}`, { method: 'DELETE' });
    load();
  };

  const handleClearAll = async () => {
    if (!confirm('⚠️ 确认清空全部能力记录？此操作不可恢复！')) return;
    setClearing(true);
    try {
      const r = await fetch('/api/capability', { method: 'DELETE' });
      const d = await r.json();
      alert(d.message || '已清空');
      load();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setClearing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">🎯 能力诊断</h1>
        <p className="text-text-secondary text-sm mt-1">记录销代表现 + 录音 AI 分析</p>
      </div>

      {/* Tab Switch */}
      <div className="flex gap-2 border-b border-border">
        <button onClick={() => setActiveTab('capability')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition ${activeTab === 'capability' ? 'border-primary text-primary' : 'border-transparent text-text-secondary hover:text-text-primary'}`}>
          📋 能力记录
        </button>
        <button onClick={() => setActiveTab('record')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition ${activeTab === 'record' ? 'border-primary text-primary' : 'border-transparent text-text-secondary hover:text-text-primary'}`}>
          🎙️ 录音分析
        </button>
        <button onClick={() => { setActiveTab('knowledge'); loadKnowledge(); }}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition ${activeTab === 'knowledge' ? 'border-primary text-primary' : 'border-transparent text-text-secondary hover:text-text-primary'}`}>
          📚 资料库
        </button>
      </div>

      {/* 录音分析面板 */}
      {activeTab === 'record' && (
        <div className="space-y-4">
          {/* 文件上传 */}
          <div className="bg-surface border border-border rounded-xl p-5">
            <h2 className="text-base font-semibold mb-4">📤 上传录音/文档</h2>
            <form onSubmit={handleUpload} className="flex flex-wrap gap-3 items-end">
              <div className="flex-1 min-w-[200px]">
                <input type="file" id="file-upload" accept=".m4a,.mp3,.wav,.m4r,.docx" className="w-full text-sm text-text-secondary file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:bg-primary/10 file:text-primary hover:file:bg-primary/20" />
              </div>
              <div className="w-32">
                <select className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm"
                  value={uploadForm.sales_name} onChange={e => setUploadForm(f => ({ ...f, sales_name: e.target.value }))}>
                  <option value="">销代姓名</option>
                  {SALES_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="w-32">
                <input type="text" className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm"
                  placeholder="区域" value={uploadForm.region} onChange={e => setUploadForm(f => ({ ...f, region: e.target.value }))} />
              </div>
              <div className="w-32">
                <select className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm"
                  value={uploadForm.deal_result} onChange={e => setUploadForm(f => ({ ...f, deal_result: e.target.value }))}>
                  <option value="">成交结果</option>
                  <option value="成交">成交</option>
                  <option value="未成交">未成交</option>
                </select>
              </div>
              <button type="submit" disabled={uploading}
                className="px-4 py-2 bg-primary text-white rounded-lg text-sm hover:bg-primary/80 disabled:opacity-50">
                {uploading ? '上传中...' : '📤 上传'}
              </button>
            </form>
          </div>

          {/* 录音列表 */}
          <div className="bg-surface border border-border rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-semibold">录音合集</h2>
                <p className="text-xs text-text-secondary mt-1">Whisper AI 转写 + 能力评分</p>
              </div>
              <div className="flex gap-2">
                <button onClick={scanRecordings}
                  className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-white/5 transition">
                  🔍 扫描录音
                </button>
                <button onClick={handleTranscribe} disabled={transcribing}
                  className="px-4 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary/80 disabled:opacity-50 transition">
                  {transcribing ? '转写中...' : '🎙️ 转写全部'}
                </button>
              </div>
            </div>

            {recordingsLoading ? (
              <div className="text-center py-8 text-text-secondary">加载中...</div>
            ) : recordings.length === 0 ? (
              <div className="text-center py-8 text-text-secondary">
                暂无录音记录，点击「扫描录音」导入
              </div>
            ) : (
              <div className="space-y-3">
                {recordings.map((r: any) => (
                  <div key={r.id} className="border border-border/50 rounded-lg p-4 hover:bg-white/5 transition">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap mb-2">
                          <span className="font-medium text-sm">{r.file_name}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${/\.docx$/i.test(r.file_name) ? 'bg-purple-500/20 text-purple-400' : 'bg-blue-500/20 text-blue-400'}`}>
                            {/\.docx$/i.test(r.file_name) ? '📄 文档' : '🎙️ 录音'}
                          </span>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${r.status === 'analyzed' ? 'bg-accent/20 text-accent' : 'bg-warning/20 text-warning'}`}>
                            {r.status === 'analyzed' ? '已分析' : '待处理'}
                          </span>
                          {r.audio_duration > 0 && (
                            <span className="text-xs text-text-secondary">{Math.round(r.audio_duration / 60)}分钟</span>
                          )}
                        </div>

                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          <select value={r.sales_name} onChange={e => updateRecordingSalesName(r.id, e.target.value)}
                            className="bg-bg border border-border text-xs rounded-lg px-2 py-1">
                            <option value="">关联销代</option>
                            {SALES_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                          <select value={r.deal_result} onChange={e => updateRecordingDealResult(r.id, e.target.value)}
                            className={`bg-bg border text-xs rounded-lg px-2 py-1 ${r.deal_result === '成交' ? 'border-accent text-accent' : r.deal_result === '未成交' ? 'border-danger text-danger' : 'border-border'}`}>
                            <option value="">成交结果</option>
                            <option value="成交">成交</option>
                            <option value="未成交">未成交</option>
                          </select>
                          {r.region && <span className="text-xs text-text-secondary">{r.region}</span>}
                          {r.store_name && <span className="text-xs text-text-secondary">门店: {r.store_name}</span>}
                        </div>

                        {r.status === 'analyzed' && (
                          <div className="grid grid-cols-3 gap-3 text-xs">
                            <div className="bg-bg/50 rounded-lg p-2">
                              <div className="text-text-secondary">讲解覆盖率</div>
                              <div className="text-lg font-mono font-bold text-primary">{r.explanation_coverage_rate}%</div>
                            </div>
                            <div className="bg-bg/50 rounded-lg p-2">
                              <div className="text-text-secondary">成交意向</div>
                              <div className="text-lg font-mono font-bold text-accent">{r.deal_rate}%</div>
                            </div>
                            <div className="bg-bg/50 rounded-lg p-2">
                              <div className="text-text-secondary">兴趣指数</div>
                              <div className="text-lg font-mono font-bold text-warning">{r.avg_interest_score || 50}</div>
                            </div>
                          </div>
                        )}

                        {r.transcription && (
                          <details className="mt-2">
                            <summary className="text-xs text-text-secondary cursor-pointer hover:text-text-primary">
                              查看转写文本 ({r.transcription.length} 字)
                            </summary>
                            <p className="mt-2 text-xs text-text-secondary bg-bg/50 rounded p-2 max-h-32 overflow-y-auto">
                              {r.transcription.slice(0, 500)}{r.transcription.length > 500 ? '...' : ''}
                            </p>
                          </details>
                        )}

                        {r.ai_summary && (
                          <p className="mt-2 text-xs text-text-secondary italic">
                            💡 {r.ai_summary}
                          </p>
                        )}
                      </div>
                      <button onClick={() => handleDeleteRecording(r.id)} className="text-danger/60 hover:text-danger text-xs ml-2">删除</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 资料库面板 */}
      {activeTab === 'knowledge' && (
        <div className="space-y-4">
          <div className="bg-surface border border-border rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-semibold">📚 知识库</h2>
                <p className="text-xs text-text-secondary mt-1">从录音中提取高频问题和卖点，分析亮点与暗点</p>
              </div>
              <button onClick={handleExtractKnowledge} disabled={extractLoading}
                className="px-4 py-2 bg-primary text-white rounded-lg text-sm hover:bg-primary/80 disabled:opacity-50">
                {extractLoading ? '分析中...' : '🔄 重新提取'}
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* 常见问题 */}
              <div className="border border-border/50 rounded-lg p-4">
                <h3 className="text-sm font-medium mb-3 text-text-secondary">❓ 顾客常问问题</h3>
                {questions.length === 0 ? (
                  <p className="text-xs text-text-secondary">暂无数据</p>
                ) : (
                  <div className="space-y-2">
                    {questions.slice(0, 10).map((q: any) => (
                      <div key={q.id} className="flex items-center justify-between text-xs">
                        <span>{q.keyword}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-text-secondary">出现 {q.frequency} 次</span>
                          <span className={`px-1.5 py-0.5 rounded ${q.deal_freq > q.no_deal_freq ? 'bg-accent/20 text-accent' : 'bg-danger/20 text-danger'}`}>
                            成交 {q.deal_freq}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 亮点 */}
              <div className="border border-accent/30 rounded-lg p-4 bg-accent/5">
                <h3 className="text-sm font-medium mb-3 text-accent">✨ 亮点</h3>
                {insights.filter((i: any) => i.insight_type === 'bright').length === 0 ? (
                  <p className="text-xs text-text-secondary">暂无数据</p>
                ) : (
                  <div className="space-y-2">
                    {insights.filter((i: any) => i.insight_type === 'bright').slice(0, 5).map((i: any) => (
                      <div key={i.id} className="text-xs">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-medium">{i.keyword}</span>
                          <span className="text-accent">{i.deal_frequency}次成交</span>
                        </div>
                        <p className="text-text-secondary">{i.improvement}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 暗点 */}
              <div className="border border-danger/30 rounded-lg p-4 bg-danger/5">
                <h3 className="text-sm font-medium mb-3 text-danger">⚠️ 暗点</h3>
                {insights.filter((i: any) => i.insight_type === 'dark').length === 0 ? (
                  <p className="text-xs text-text-secondary">暂无数据</p>
                ) : (
                  <div className="space-y-2">
                    {insights.filter((i: any) => i.insight_type === 'dark').slice(0, 5).map((i: any) => (
                      <div key={i.id} className="text-xs">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-medium">{i.keyword}</span>
                          <span className="text-danger">{i.no_deal_frequency}次未成交</span>
                        </div>
                        <p className="text-text-secondary">{i.improvement}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 区域基准 */}
          {baselines.length > 0 && (
            <div className="bg-surface border border-border rounded-xl p-5">
              <h3 className="text-sm font-medium mb-3 text-text-secondary">📊 区域对比（偏差校正基准）</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {baselines.map((b: any) => (
                  <div key={b.id} className="border border-border/50 rounded-lg p-3">
                    <div className="text-sm font-medium mb-2">{b.region}</div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <div className="text-text-secondary">覆盖率</div>
                        <div className="font-mono text-primary">{b.avg_coverage_rate}%</div>
                      </div>
                      <div>
                        <div className="text-text-secondary">成交率</div>
                        <div className="font-mono text-accent">{b.avg_close_rate}%</div>
                      </div>
                    </div>
                    <div className="mt-2 text-xs text-text-secondary">
                      问题数: {b.question_count}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 能力记录表单 - 仅在 tab=capability 时显示 */}
      {activeTab === 'capability' && (
      <div className="bg-surface border border-border rounded-xl p-5">
        <h2 className="text-base font-semibold mb-4">📝 新增记录</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="text-xs text-text-secondary block mb-1">销代姓名 *</label>
              <select className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm" value={form.sales_name}
                onChange={e => setForm(f => ({ ...f, sales_name: e.target.value }))}>
                <option value="">请选择</option>
                {SALES_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-text-secondary block mb-1">讲解机型 *</label>
              <select className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm" value={form.model}
                onChange={e => setForm(f => ({ ...f, model: e.target.value }))}>
                <option value="">请选择机型</option>
                {models.map((m: any) => <option key={m.id} value={m.name}>{m.name} ({m.price_segment})</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-text-secondary block mb-1">门店</label>
              <select className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm" value={form.store_id}
                onChange={e => handleStoreChange(e.target.value)}>
                <option value="">请选择门店</option>
                {stores.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              {form.region && <div className="text-xs text-primary mt-1">区域: {form.region}</div>}
            </div>
            <div>
              <label className="text-xs text-text-secondary block mb-1">日期 *</label>
              <input type="date" className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm" value={form.record_date}
                onChange={e => setForm(f => ({ ...f, record_date: e.target.value }))} />
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="text-xs text-text-secondary block mb-1">总交流时长（分钟）</label>
              <input type="number" min={1} max={120} className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm" value={form.communication_duration}
                onChange={e => setForm(f => ({ ...f, communication_duration: parseInt(e.target.value) || 1 }))} />
            </div>
            <div>
              <label className="text-xs text-text-secondary block mb-1">讲解本机型时长</label>
              <input type="number" min={0} max={60} className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm" value={form.model_explanation_duration}
                onChange={e => setForm(f => ({ ...f, model_explanation_duration: parseInt(e.target.value) || 0 }))} />
            </div>
            <div>
              <label className="text-xs text-text-secondary block mb-1">顾客兴趣度</label>
              <div className="flex gap-1">
                {['高', '中', '低'].map(level => (
                  <button type="button" key={level} onClick={() => setForm(f => ({ ...f, customer_interest_level: level }))}
                    className={`flex-1 py-2 rounded-lg text-xs border transition ${
                      form.customer_interest_level === level
                        ? level === '高' ? 'bg-accent/20 border-accent text-accent'
                        : level === '中' ? 'bg-warning/20 border-warning text-warning'
                        : 'bg-danger/20 border-danger text-danger'
                        : 'border-border text-text-secondary'
                    }`}>
                    {level}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs text-text-secondary block mb-1">价格拉扯次数</label>
              <input type="number" min={0} max={20} className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm" value={form.price_negotiation_count}
                onChange={e => setForm(f => ({ ...f, price_negotiation_count: parseInt(e.target.value) || 0 }))} />
            </div>
          </div>

          <div>
            <label className="text-xs text-text-secondary block mb-1">顾客关注点（多选）</label>
            <div className="flex flex-wrap gap-2">
              {CONCERN_OPTIONS.map(o => (
                <button type="button" key={o} onClick={() => toggleArr('customer_concerns', o)}
                  className={`px-3 py-1 rounded-full text-xs border transition ${form.customer_concerns.includes(o) ? 'bg-primary/20 border-primary text-primary' : 'border-border text-text-secondary hover:border-primary/50'}`}>
                  {o}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs text-text-secondary block mb-1">销代讲解点（多选）</label>
            <div className="flex flex-wrap gap-2">
              {EXPLAINED_OPTIONS.map(o => (
                <button type="button" key={o} onClick={() => toggleArr('sales_explained', o)}
                  className={`px-3 py-1 rounded-full text-xs border transition ${form.sales_explained.includes(o) ? 'bg-accent/20 border-accent text-accent' : 'border-border text-text-secondary hover:border-accent/50'}`}>
                  {o}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs text-text-secondary block mb-1">顾客实际理解</label>
            <textarea className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm resize-none" rows={2}
              placeholder="顾客实际理解和接受了哪些点..."
              value={form.customer_understood} onChange={e => setForm(f => ({ ...f, customer_understood: e.target.value }))} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-text-secondary block mb-1">薄弱点分类</label>
              <select className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm" value={form.weakness_category}
                onChange={e => setForm(f => ({ ...f, weakness_category: e.target.value }))}>
                <option value="">无（表现良好）</option>
                {WEAKNESS_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-text-secondary block mb-1">薄弱描述</label>
              <input type="text" className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm"
                placeholder="如：讲解太专业听不懂..." value={form.weakness_desc}
                onChange={e => setForm(f => ({ ...f, weakness_desc: e.target.value }))} />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div>
              <label className="text-xs text-text-secondary block mb-1">是否成交</label>
              <div className="flex gap-2">
                {['成交', '未成交'].map(r => (
                  <button type="button" key={r} onClick={() => setForm(f => ({ ...f, price_negotiation_result: r }))}
                    className={`py-2 px-4 rounded-lg text-sm border transition ${form.price_negotiation_result === r ? (r === '成交' ? 'bg-accent/20 border-accent text-accent' : 'bg-danger/20 border-danger text-danger') : 'border-border text-text-secondary'}`}>
                    {r}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <button type="submit" disabled={submitting}
            className="px-6 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/80 disabled:opacity-50 transition">
            {submitting ? '保存中...' : '💾 保存记录'}
          </button>
        </form>
      </div>
      )}

      {/* Analytics charts - 仅在能力记录 tab 显示 */}
      {activeTab === 'capability' && (
      <>
      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => <div key={i} className="bg-surface border border-border rounded-xl animate-pulse h-48" />)}
        </div>
      ) : analytics ? (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-surface border border-border rounded-xl p-5">
              <h3 className="text-sm font-medium mb-4 text-text-secondary">顾客关注 vs 销代讲解</h3>
              <ConcernCompareChart concernFreq={analytics.concernFreq} explainedFreq={analytics.explainedFreq} />
            </div>
            <div className="bg-surface border border-border rounded-xl p-5">
              <h3 className="text-sm font-medium mb-4 text-text-secondary">价格拉扯与成交</h3>
              <NegotiationChart stats={analytics.negotiationStats} />
            </div>
            <div className="bg-surface border border-border rounded-xl p-5">
              <h3 className="text-sm font-medium mb-4 text-text-secondary">薄弱点分类分布</h3>
              <WeaknessCategoryChart data={analytics.weaknessByCategory} />
            </div>
            <div className="bg-surface border border-border rounded-xl p-5">
              <h3 className="text-sm font-medium mb-4 text-text-secondary">顾客兴趣度分布</h3>
              <InterestLevelChart data={analytics.interestLevelBreakdown} />
            </div>
          </div>

          {/* SOP v2.1: 讲解覆盖率 per rep */}
          <div className="bg-surface border border-border rounded-xl p-5">
            <h3 className="text-sm font-medium mb-4 text-text-secondary">
              📊 讲解覆盖率（按销代）
              <span className="ml-2 text-xs text-text-secondary">SOP标准：≥80%为合格</span>
            </h3>
            <CoverageBarChart data={analytics.coverageRates} standardDims={analytics.standardDimensions || []} />
          </div>

          {/* SOP v2.1: 30-day close rate trend per rep */}
          {analytics.rep30DayTrend && Object.keys(analytics.rep30DayTrend).length > 0 && (
            <div className="bg-surface border border-border rounded-xl p-5">
              <h3 className="text-sm font-medium mb-4 text-text-secondary">📈 30天成交率趋势（按销代）</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {Object.entries(analytics.rep30DayTrend).map(([name, data]: [string, any]) => (
                  <div key={name} className="border border-border/50 rounded-lg p-3">
                    <div className="text-sm font-medium mb-2">{name}</div>
                    <RepTrendChart data={data} repName={name} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Per-model per-rep matrix */}
          <div className="bg-surface border border-border rounded-xl p-5">
            <h3 className="text-sm font-medium mb-4 text-text-secondary">
              📊 销代 × 机型能力矩阵
              <span className="ml-2 text-xs text-text-secondary">（成交率 vs 区域均值）</span>
            </h3>
            <RepModelCompareChart data={analytics.perModelPerRep} />
          </div>

          {/* Avg duration + Word cloud */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-surface border border-border rounded-xl p-5">
              <h3 className="text-sm font-medium mb-4 text-text-secondary">平均沟通时长（按销代）</h3>
              {analytics.avgDuration.map((d: any) => (
                <div key={d.name} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
                  <span className="text-sm">{d.name}</span>
                  <div className="flex items-center gap-2">
                    <div className="w-24 h-2 bg-border rounded-full overflow-hidden">
                      <div className="h-full bg-primary rounded-full" style={{ width: `${Math.min(100, (d.avg / 60) * 100)}%` }} />
                    </div>
                    <span className="text-xs font-mono text-text-secondary w-16 text-right">{d.avg} 分钟</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="bg-surface border border-border rounded-xl p-5">
              <h3 className="text-sm font-medium mb-3 text-text-secondary">薄弱点高频词</h3>
              <WeaknessWordCloud words={analytics.topWeakness} />
            </div>
          </div>
        </>
      ) : null}

      {/* History */}
      <div className="bg-surface border border-border rounded-xl p-5">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <h3 className="text-sm font-semibold">历史记录 · 共 {records.length} 条</h3>
          <div className="flex items-center gap-2 flex-wrap">
            {/* 筛选器 */}
            <select value={filterSalesName} onChange={e => setFilterSalesName(e.target.value)}
              className="bg-bg border border-border text-text-primary text-xs rounded-lg px-2 py-1.5">
              <option value="">全部销代</option>
              {SALES_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={filterModel} onChange={e => setFilterModel(e.target.value)}
              className="bg-bg border border-border text-text-primary text-xs rounded-lg px-2 py-1.5">
              <option value="">全部机型</option>
              {models.map((m: any) => <option key={m.id} value={m.name}>{m.name}</option>)}
            </select>
            <select value={filterResult} onChange={e => setFilterResult(e.target.value)}
              className="bg-bg border border-border text-text-primary text-xs rounded-lg px-2 py-1.5">
              <option value="">全部结果</option>
              <option value="成交">成交</option>
              <option value="未成交">未成交</option>
            </select>
            <select value={filterWeakness} onChange={e => setFilterWeakness(e.target.value)}
              className="bg-bg border border-border text-text-primary text-xs rounded-lg px-2 py-1.5">
              <option value="">全部薄弱项</option>
              {WEAKNESS_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            {/* 重置筛选 */}
            {(filterSalesName || filterModel || filterResult || filterWeakness) && (
              <button onClick={() => { setFilterSalesName(''); setFilterModel(''); setFilterResult(''); setFilterWeakness(''); }}
                className="text-xs text-text-secondary hover:text-text-primary px-2 py-1">
                重置
              </button>
            )}
            {/* 清空数据 */}
            <button onClick={handleClearAll} disabled={clearing || records.length === 0}
              className="px-2 py-1.5 text-xs text-danger border border-danger/30 rounded-lg hover:bg-danger/10 disabled:opacity-30 transition">
              {clearing ? '清空中...' : '🗑️ 清空'}
            </button>
          </div>
        </div>
        <div className="space-y-3">
          {records.map((r: any) => (
            <div key={r.id} className="border border-border/50 rounded-lg p-4 hover:bg-white/5 transition">
              <div className="flex items-start justify-between">
                <div className="space-y-1 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{r.sales_name}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">{r.model || '未记录'}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-accent/10 text-accent">{r.store_name || '-'}</span>
                    <span className="text-xs text-text-secondary">{r.record_date}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${r.price_negotiation_result === '成交' ? 'bg-accent/20 text-accent' : 'bg-danger/20 text-danger'}`}>
                      {r.price_negotiation_result}
                    </span>
                  </div>
                  <div className="text-xs text-text-secondary">
                    机型讲解: {r.model_explanation_duration || '-'}分钟 · 兴趣: {r.customer_interest_level || '中'} ·
                    顾客关注：{safeParse(r.customer_concerns).join('、') || '-'} ·
                    讲解：{safeParse(r.sales_explained).join('、') || '-'} ·
                    拉扯 {r.price_negotiation_count} 次
                  </div>
                  {r.weakness_category && (
                    <div className="text-xs flex items-center gap-2">
                      <span className="px-1.5 py-0.5 rounded bg-warning/10 text-warning">{r.weakness_category}</span>
                      {r.weakness_desc && <span className="text-text-secondary">💡 {r.weakness_desc}</span>}
                    </div>
                  )}
                </div>
                <button onClick={() => handleDelete(r.id)} className="text-danger/60 hover:text-danger text-xs ml-2">删除</button>
              </div>
            </div>
          ))}
          {records.length === 0 && <div className="text-center text-text-secondary py-8">暂无记录</div>}
        </div>
      </div>
      </>
      )}
    </div>
  );
}

function safeParse(v: any): any[] {
  if (Array.isArray(v)) return v;
  try { return JSON.parse(v || '[]'); } catch { return []; }
}
