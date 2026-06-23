'use client';
import { useEffect, useState, useCallback } from 'react';
import StorePerformanceForm from '@/components/StorePerformanceForm';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

export default function StoreEfficiencyPage() {
  const [perfs, setPerfs] = useState<any[]>([]);
  const [competitors, setCompetitors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingStoreId, setEditingStoreId] = useState<number | null>(null);
  const [expandedStore, setExpandedStore] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [spRes, compRes] = await Promise.all([
        fetch('/api/store-performance').then(r => r.json()),
        fetch('/api/competitor-sales').then(r => r.json()),
      ]);
      setPerfs(spRes.data || []);
      setCompetitors(compRes.data || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSaved = () => {
    setEditingStoreId(null);
    load();
  };

  const getCompetitorsForStore = (storeId: number) =>
    competitors.filter(c => c.store_id === storeId);

  const fmt = (n: number) => (n || 0).toLocaleString('zh-CN', { maximumFractionDigits: 0 });
  const fmtMoney = (n: number) => {
    if (n >= 10000) return `${(n / 10000).toFixed(1)}万`;
    return fmt(n);
  };

  // KPI — 使用自动计算值
  const totalOurSales = perfs.reduce((s, p) => s + (p.auto_sales_amount || p.our_total_sales || 0), 0);
  const totalOurQty = perfs.reduce((s, p) => s + (p.auto_sales_quantity || p.our_total_quantity || 0), 0);
  const avgStructuralRatio = perfs.length > 0
    ? Math.round(perfs.reduce((s, p) => s + (p.structural_ratio || 0), 0) / perfs.length)
    : 0;
  const avgEfficiencyScore = perfs.filter(p => p.store_efficiency_score > 0).length > 0
    ? Math.round(perfs.filter(p => p.store_efficiency_score > 0).reduce((s, p) => s + (p.store_efficiency_score || 0), 0) / perfs.filter(p => p.store_efficiency_score > 0).length * 10) / 10
    : 0;

  // 竞品对比图表数据
  const comparisonData = perfs.map(p => {
    const comps = getCompetitorsForStore(p.store_id);
    const compTotal = comps.reduce((s, c) => s + (c.sales_quantity || 0), 0);
    return {
      name: p.store_name?.length > 6 ? p.store_name.slice(0, 6) + '...' : (p.store_name || '未知'),
      '我司销量': p.our_total_quantity || 0,
      '竞品总销量': compTotal,
      region: p.region,
    };
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">🏪 店效分析</h1>
          <p className="text-text-secondary text-sm mt-1">
            门店整体销量 · 友商竞品对比 · 店效综合系数
          </p>
        </div>
      </div>

      {/* KPI 卡片 */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {[
          { label: '已录入门店', value: `${perfs.length} 家`, color: 'text-primary' },
          { label: '门店总销售额', value: `¥${fmtMoney(totalOurSales)}`, color: 'text-accent' },
          { label: '门店总销量', value: `${fmt(totalOurQty)} 台`, color: 'text-primary' },
          { label: '平均结构占比', value: `${avgStructuralRatio}%`, color: avgStructuralRatio >= 30 ? 'text-accent' : 'text-warning' },
          { label: '平均店效系数', value: `${avgEfficiencyScore}`, color: avgEfficiencyScore >= 10 ? 'text-accent' : 'text-warning' },
        ].map(card => (
          <div key={card.label} className="bg-surface border border-border rounded-xl p-5">
            <div className="text-text-secondary text-sm mb-2">{card.label}</div>
            <div className={`text-xl font-bold font-mono ${card.color}`}>{card.value}</div>
          </div>
        ))}
      </div>

      {/* 竞品对比图表 */}
      {comparisonData.length > 0 && (
        <div className="bg-surface border border-border rounded-xl p-5">
          <h3 className="text-sm font-medium mb-4 text-text-secondary">📊 门店销量 vs 竞品对比</h3>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={comparisonData}
              margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2e3340" />
              <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 12 }} />
              <YAxis tick={{ fill: '#94a3b8', fontSize: 12 }} />
              <Tooltip
                contentStyle={{ backgroundColor: '#1a1d27', border: '1px solid #2e3340', borderRadius: '8px' }}
                labelStyle={{ color: '#f1f5f9' }}
                itemStyle={{ color: '#f1f5f9' }}
              />
              <Legend wrapperStyle={{ color: '#94a3b8', fontSize: '12px' }} />
              <Bar dataKey="我司销量" fill="#6366f1" radius={[4, 4, 0, 0]} />
              <Bar dataKey="竞品总销量" fill="#ef4444" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* 编辑表单 */}
      <div className="bg-surface border border-border rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold">
            {editingStoreId ? '✏️ 编辑店效数据' : '➕ 录入店效数据'}
          </h2>
          {editingStoreId && (
            <button onClick={() => setEditingStoreId(null)}
              className="text-sm text-text-secondary hover:text-text-primary">
              取消编辑
            </button>
          )}
        </div>
        <StorePerformanceForm
          key={editingStoreId ?? 0}
          storeId={editingStoreId ?? undefined}
          onSave={handleSaved}
          onCancel={() => setEditingStoreId(null)}
        />
      </div>

      {/* 门店绩效表格 */}
      <div className="bg-surface border border-border rounded-xl p-5">
        <h3 className="text-sm font-semibold mb-4">门店绩效明细 · 共 {perfs.length} 家</h3>
        {loading ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => <div key={i} className="bg-bg rounded-lg animate-pulse h-14" />)}
          </div>
        ) : perfs.length === 0 ? (
          <div className="text-center text-text-secondary py-8">暂无店效数据，请在上方表单中选择门店录入</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-text-secondary">
                  {['门店名称', '区域', '我们销量', '结构占比', '竞品数', '竞品总销量', '店效系数', '操作'].map(h => (
                    <th key={h} className="pb-3 pr-4 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {perfs.map(p => {
                  const comps = getCompetitorsForStore(p.store_id);
                  const compTotalQty = comps.reduce((s, c) => s + (c.sales_quantity || 0), 0);
                  const expanded = expandedStore === p.store_id;
                  return (
                    <>
                      <tr key={p.store_id}
                        className={`border-b border-border/50 hover:bg-white/5 cursor-pointer ${expanded ? 'bg-primary/5' : ''}`}
                        onClick={() => setExpandedStore(expanded ? null : p.store_id)}>
                        <td className="py-3 pr-4 font-medium">{p.store_name || '未知'}</td>
                        <td className="py-3 pr-4">
                          <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs">{p.region || '-'}</span>
                        </td>
                        <td className="py-3 pr-4 font-mono text-right">
                          {p.our_total_quantity || 0} 台 / ¥{fmtMoney(p.our_total_sales || 0)}
                          {p.auto_sales_quantity > 0 && !p.store_efficiency_score && (
                            <span className="block text-[10px] text-text-secondary">自动同步</span>
                          )}
                        </td>
                        <td className="py-3 pr-4 font-mono text-right">
                          <span className={p.structural_ratio >= 30 ? 'text-accent' : 'text-warning'}>
                            {p.structural_ratio || 0}%
                          </span>
                        </td>
                        <td className="py-3 pr-4 font-mono text-center">{comps.length}</td>
                        <td className="py-3 pr-4 font-mono text-right text-danger">
                          {compTotalQty} 台 / ¥{fmtMoney(comps.reduce((s: number, c: any) => s + (c.sales_amount || 0), 0))}
                        </td>
                        <td className="py-3 pr-4 font-mono text-right">
                          <span className={`font-bold ${(p.store_efficiency_score || 0) >= 10 ? 'text-accent' : (p.store_efficiency_score || 0) > 0 ? 'text-warning' : 'text-text-secondary'}`}>
                            {p.store_efficiency_score || '-'}
                          </span>
                        </td>
                        <td className="py-3 pr-4">
                          <button onClick={(e) => { e.stopPropagation(); setEditingStoreId(p.store_id); }}
                            className="text-primary/70 hover:text-primary text-xs">
                            编辑
                          </button>
                        </td>
                      </tr>
                      {/* 展开：竞品明细 */}
                      {expanded && comps.length > 0 && (
                        <tr key={`${p.store_id}-comp`}>
                          <td colSpan={8} className="py-2 px-4 bg-bg/50">
                            <div className="text-xs text-text-secondary mb-2">友商竞品明细：</div>
                            <div className="overflow-x-auto">
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="text-text-secondary">
                                    <th className="text-left pb-1 pr-2">品牌</th>
                                    <th className="text-left pb-1 pr-2">型号</th>
                                    <th className="text-right pb-1 pr-2">销量</th>
                                    <th className="text-right pb-1 pr-2">销售额</th>
                                    <th className="text-left pb-1">备注</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {comps.map((c: any) => (
                                    <tr key={c.id} className="border-t border-border/30">
                                      <td className="py-1 pr-2 font-medium">{c.competitor_brand || '-'}</td>
                                      <td className="py-1 pr-2 font-mono text-text-secondary">{c.model_name || '-'}</td>
                                      <td className="py-1 pr-2 font-mono text-right">{c.sales_quantity || 0} 台</td>
                                      <td className="py-1 pr-2 font-mono text-right">¥{fmtMoney(c.sales_amount || 0)}</td>
                                      <td className="py-1 text-text-secondary">{c.notes || '-'}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-4 pt-4 border-t border-border/50 text-xs text-text-secondary">
          💡 点击门店行可展开查看竞品明细。销量数据自动从零售报表同步，点击"编辑"可录入结构机型数和竞品数据。
        </div>
      </div>
    </div>
  );
}
