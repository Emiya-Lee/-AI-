'use client';
import { useState, useEffect } from 'react';

interface CompetitorEntry {
  id?: number;
  store_id?: number;
  competitor_brand: string;
  model_name: string;
  sales_amount: number;
  sales_quantity: number;
  period: string;
  notes: string;
}

interface StorePerformance {
  id?: number;
  store_id: number;
  period: string;
  structural_model_count: number;
  category_total_count: number;
}

interface Props {
  storeId?: number;
  onSave: () => void;
  onCancel?: () => void;
}

function fmtMoney(n: number) {
  if (n >= 10000) return `${(n / 10000).toFixed(1)}万`;
  return n.toLocaleString('zh-CN', { maximumFractionDigits: 0 });
}

export default function StorePerformanceForm({ storeId, onSave, onCancel }: Props) {
  const [stores, setStores] = useState<any[]>([]);
  const [perf, setPerf] = useState<StorePerformance>({
    store_id: storeId || 0,
    period: '',
    structural_model_count: 0,
    category_total_count: 0,
  });
  const [competitors, setCompetitors] = useState<CompetitorEntry[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // 自动计算的销量（从 store-performance API 获取）
  const [autoSales, setAutoSales] = useState({ amount: 0, quantity: 0 });

  // 加载门店列表
  useEffect(() => {
    fetch('/api/stores').then(r => r.json()).then(d => setStores(d.data || [])).catch(() => {});
  }, []);

  // 加载已有绩效数据 + 竞品数据 + 自动销量
  useEffect(() => {
    if (!storeId) return;
    Promise.all([
      fetch(`/api/store-performance?store_id=${storeId}`).then(r => r.json()),
      fetch(`/api/competitor-sales?store_id=${storeId}`).then(r => r.json()),
    ]).then(([spData, compData]) => {
      const sp = spData.data?.[0];
      if (sp) {
        setPerf({
          store_id: sp.store_id,
          period: sp.period || '',
          structural_model_count: sp.structural_model_count || 0,
          category_total_count: sp.category_total_count || 0,
        });
        setAutoSales({
          amount: sp.auto_sales_amount || sp.our_total_sales || 0,
          quantity: sp.auto_sales_quantity || sp.our_total_quantity || 0,
        });
      }
      setCompetitors((compData.data || []).map((c: any) => ({
        id: c.id,
        store_id: c.store_id,
        competitor_brand: c.competitor_brand || '',
        model_name: c.model_name || '',
        sales_amount: c.sales_amount || 0,
        sales_quantity: c.sales_quantity || 0,
        period: c.period || '',
        notes: c.notes || '',
      })));
    }).catch(() => {});
  }, [storeId]);

  // 当切换门店时，自动加载该门店的销量
  useEffect(() => {
    if (!perf.store_id || storeId) return; // 编辑模式已在上面加载
    fetch(`/api/store-performance?store_id=${perf.store_id}`)
      .then(r => r.json())
      .then(d => {
        const sp = d.data?.[0];
        if (sp) {
          setAutoSales({
            amount: sp.auto_sales_amount || sp.our_total_sales || 0,
            quantity: sp.auto_sales_quantity || sp.our_total_quantity || 0,
          });
          setPerf(p => ({
            ...p,
            structural_model_count: sp.structural_model_count || 0,
            category_total_count: sp.category_total_count || 0,
            period: sp.period || p.period,
          }));
        } else {
          setAutoSales({ amount: 0, quantity: 0 });
        }
      }).catch(() => {});
  }, [perf.store_id]);

  const updatePerf = (key: string, value: any) => setPerf(f => ({ ...f, [key]: value }));
  const updateComp = (idx: number, key: string, value: any) => {
    setCompetitors(prev => prev.map((c, i) => i === idx ? { ...c, [key]: value } : c));
  };

  const addCompetitor = () => {
    setCompetitors(prev => [...prev, {
      competitor_brand: '', model_name: '',
      sales_amount: 0, sales_quantity: 0,
      period: perf.period, notes: '',
    }]);
  };

  const removeCompetitor = async (idx: number) => {
    const c = competitors[idx];
    if (c.id) {
      await fetch(`/api/competitor-sales?id=${c.id}`, { method: 'DELETE' });
    }
    setCompetitors(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const sid = storeId || perf.store_id;
    if (!sid) return alert('请选择门店');

    setSubmitting(true);
    try {
      // 1. 保存门店绩效（仅结构机型数和品类总量）
      const spRes = await fetch('/api/store-performance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...perf, store_id: sid }),
      });
      if (!spRes.ok) throw new Error('保存门店绩效失败');

      // 2. 保存竞品销量
      for (const c of competitors) {
        if (!c.competitor_brand) continue;
        if (c.id) {
          await fetch(`/api/competitor-sales?id=${c.id}`, { method: 'DELETE' });
        }
        await fetch('/api/competitor-sales', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...c, store_id: sid, period: perf.period }),
        });
      }

      onSave();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const hasData = !!(storeId || perf.store_id);

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* 基本信息 */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div>
          <label className="text-xs text-text-secondary block mb-1">门店 *</label>
          <select
            className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm"
            value={perf.store_id || ''}
            onChange={e => updatePerf('store_id', parseInt(e.target.value) || 0)}
            disabled={!!storeId}
          >
            <option value="">请选择门店</option>
            {stores.map((s: any) => (
              <option key={s.id} value={s.id}>{s.name} ({s.region})</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-text-secondary block mb-1">统计周期</label>
          <input type="text" className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm"
            value={perf.period} onChange={e => updatePerf('period', e.target.value)}
            placeholder="如：2026-06" />
        </div>
        <div>
          <label className="text-xs text-text-secondary block mb-1">结构机型销量（台）</label>
          <input type="number" className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm"
            value={perf.structural_model_count || ''} onChange={e => updatePerf('structural_model_count', parseInt(e.target.value) || 0)} />
          <div className="text-xs text-text-secondary mt-1">💡 高毛利/主推机型</div>
        </div>
        <div>
          <label className="text-xs text-text-secondary block mb-1">智屏品类总销量（台）</label>
          <input type="number" className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm"
            value={perf.category_total_count || ''} onChange={e => updatePerf('category_total_count', parseInt(e.target.value) || 0)} />
          <div className="text-xs text-text-secondary mt-1">💡 含所有品牌</div>
        </div>
      </div>

      {/* 自动计算的销量展示 */}
      {hasData && (
        <div className="bg-bg border border-primary/20 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs text-primary font-medium">📊 自动销量统计</span>
            <span className="text-[10px] text-text-secondary bg-surface px-2 py-0.5 rounded-full">从零售报表自动同步</span>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-xs text-text-secondary mb-1">门店销售额</div>
              <div className="text-lg font-mono font-bold text-accent">
                ¥{fmtMoney(autoSales.amount)}
              </div>
            </div>
            <div>
              <div className="text-xs text-text-secondary mb-1">门店销量</div>
              <div className="text-lg font-mono font-bold text-primary">
                {autoSales.quantity.toLocaleString()} 台
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 结构占比预览 */}
      {perf.category_total_count > 0 && (
        <div className="bg-bg rounded-lg p-3 flex items-center gap-4 text-sm">
          <span className="text-text-secondary">结构机型占比：</span>
          <span className="font-mono font-bold text-primary">
            {Math.round((perf.structural_model_count / perf.category_total_count) * 100)}%
          </span>
          <span className="text-xs text-text-secondary">
            = {perf.structural_model_count} ÷ {perf.category_total_count} × 100%
          </span>
        </div>
      )}

      {/* 友商竞品销量 */}
      <div className="border-t border-border pt-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold">🏪 友商竞品销量</h3>
          <button type="button" onClick={addCompetitor}
            className="px-3 py-1.5 text-xs bg-primary/20 text-primary border border-primary/30 rounded-lg hover:bg-primary/30 transition">
            ➕ 添加竞品
          </button>
        </div>

        {competitors.length === 0 ? (
          <div className="text-center text-text-secondary text-sm py-4 border border-dashed border-border rounded-lg">
            暂无竞品数据，点击"添加竞品"开始录入
          </div>
        ) : (
          <div className="space-y-3">
            {competitors.map((c, idx) => (
              <div key={idx} className="bg-bg border border-border/50 rounded-lg p-3 relative">
                <button type="button" onClick={() => removeCompetitor(idx)}
                  className="absolute top-2 right-2 text-danger/60 hover:text-danger text-xs">✕ 删除</button>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 pr-8">
                  <div>
                    <label className="text-xs text-text-secondary block mb-0.5">品牌 *</label>
                    <input type="text" className="w-full bg-surface border border-border rounded px-2 py-1.5 text-sm"
                      value={c.competitor_brand} onChange={e => updateComp(idx, 'competitor_brand', e.target.value)}
                      placeholder="如：海信 / Hisense" />
                  </div>
                  <div>
                    <label className="text-xs text-text-secondary block mb-0.5">竞品型号</label>
                    <input type="text" className="w-full bg-surface border border-border rounded px-2 py-1.5 text-sm"
                      value={c.model_name} onChange={e => updateComp(idx, 'model_name', e.target.value)}
                      placeholder="如：75E5N" />
                  </div>
                  <div>
                    <label className="text-xs text-text-secondary block mb-0.5">统计周期</label>
                    <input type="text" className="w-full bg-surface border border-border rounded px-2 py-1.5 text-sm"
                      value={c.period} onChange={e => updateComp(idx, 'period', e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs text-text-secondary block mb-0.5">竞品销量（台）</label>
                    <input type="number" className="w-full bg-surface border border-border rounded px-2 py-1.5 text-sm"
                      value={c.sales_quantity || ''} onChange={e => updateComp(idx, 'sales_quantity', parseInt(e.target.value) || 0)} />
                  </div>
                  <div>
                    <label className="text-xs text-text-secondary block mb-0.5">竞品销售额（元）</label>
                    <input type="number" className="w-full bg-surface border border-border rounded px-2 py-1.5 text-sm"
                      value={c.sales_amount || ''} onChange={e => updateComp(idx, 'sales_amount', parseFloat(e.target.value) || 0)} />
                  </div>
                  <div>
                    <label className="text-xs text-text-secondary block mb-0.5">备注</label>
                    <input type="text" className="w-full bg-surface border border-border rounded px-2 py-1.5 text-sm"
                      value={c.notes} onChange={e => updateComp(idx, 'notes', e.target.value)} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 提交按钮 */}
      <div className="flex gap-2 border-t border-border pt-4">
        <button type="submit" disabled={submitting}
          className="px-6 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/80 disabled:opacity-50 transition">
          {submitting ? '保存中...' : hasData ? '💾 保存店效数据' : '➕ 添加店效数据'}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel}
            className="px-4 py-2 border border-border rounded-lg text-sm text-text-secondary hover:text-text-primary transition">
            取消
          </button>
        )}
      </div>

      <div className="text-xs text-text-secondary text-center">
        💡 销售额/销量自动从导入的零售报表统计，无需手动填写。仅需录入结构机型数、品类总量和竞品数据。
      </div>
    </form>
  );
}
