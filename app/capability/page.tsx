'use client';
import { useEffect, useState, useCallback } from 'react';
import { ConcernCompareChart, NegotiationChart, WeaknessWordCloud, WeaknessCategoryChart, RepModelCompareChart, InterestLevelChart } from '@/components/CapabilityCharts';

const CONCERN_OPTIONS = ['价格', '质量', '售后', '品牌', '外观', '尺寸', '功能'];
const EXPLAINED_OPTIONS = ['价格', '质量', '售后', '品牌', '外观', '尺寸', '功能', '对比'];
const SALES_OPTIONS = ['康希凌', '黄家珍', '张三', '李四', '王五'];
const WEAKNESS_CATEGORIES = ['产品知识不足', '讲解思路不清', '讲解不够清晰落地', '价格拉扯不充分', '其他'];

export default function CapabilityPage() {
  const [analytics, setAnalytics] = useState<any>(null);
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [models, setModels] = useState<any[]>([]);
  const [stores, setStores] = useState<any[]>([]);

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
      const [anRes, recRes] = await Promise.all([
        fetch('/api/analytics/capability'),
        fetch('/api/capability'),
      ]);
      const an = await anRes.json();
      const rec = await recRes.json();
      setAnalytics(an);
      setRecords(rec.data || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">🎯 能力缺陷记录</h1>
        <p className="text-text-secondary text-sm mt-1">记录销售沟通细节，诊断机型级讲解能力短板</p>
      </div>

      {/* Enhanced form */}
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

      {/* Analytics charts */}
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
        <h3 className="text-sm font-semibold mb-4">历史记录 · 共 {records.length} 条</h3>
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
    </div>
  );
}

function safeParse(v: any): any[] {
  if (Array.isArray(v)) return v;
  try { return JSON.parse(v || '[]'); } catch { return []; }
}
