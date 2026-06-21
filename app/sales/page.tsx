'use client';
import { useEffect, useState, useCallback } from 'react';
import ExcelImporter from '@/components/ExcelImporter';
import { ModelPieChart, MonthlyLineChart, SalesRankChart, RegionalBarChart, StoreTypePieChart, PriceSegmentChart } from '@/components/SalesCharts';

const MONTHS = ['2026-06', '2026-05', '2026-04', '2026-03', '2026-02', '2026-01'];

export default function SalesPage() {
  const [analytics, setAnalytics] = useState<any>(null);
  const [records, setRecords] = useState<any[]>([]);
  const [month, setMonth] = useState('');
  const [region, setRegion] = useState('');
  const [storeId, setStoreId] = useState('');
  const [regions, setRegions] = useState<string[]>([]);
  const [stores, setStores] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);

  // Load region list
  useEffect(() => {
    fetch('/api/stores/regions').then(r => r.json()).then(d => setRegions(d.regions || [])).catch(() => {});
    fetch('/api/stores').then(r => r.json()).then(d => setStores(d.data || [])).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (month) params.set('month', month);
      if (region) params.set('region', region);
      if (storeId) params.set('store_id', storeId);
      const qs = params.toString() ? `?${params.toString()}` : '';
      const [anRes, recRes] = await Promise.all([
        fetch(`/api/analytics/sales${qs}`),
        fetch(`/api/sales${qs}`),
      ]);
      const an = await anRes.json();
      const rec = await recRes.json();
      setAnalytics(an);
      setRecords(rec.data || []);
    } finally {
      setLoading(false);
    }
  }, [month, region, storeId]);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async () => {
    if (!confirm('确认清空所有销量数据？')) return;
    setDeleting(true);
    await fetch('/api/sales', { method: 'DELETE' });
    setDeleting(false);
    load();
  };

  const fmt = (n: number) => (n || 0).toLocaleString('zh-CN', { maximumFractionDigits: 0 });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">📈 销量分析</h1>
          <p className="text-text-secondary text-sm mt-1">门店维度 · 客户画像 · 区域对比</p>
        </div>
        <div className="flex gap-3 items-center flex-wrap">
          <select value={month} onChange={e => setMonth(e.target.value)}
            className="bg-surface border border-border text-text-primary text-sm rounded-lg px-3 py-2">
            <option value="">全部月份</option>
            {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          <select value={region} onChange={e => { setRegion(e.target.value); setStoreId(''); }}
            className="bg-surface border border-border text-text-primary text-sm rounded-lg px-3 py-2">
            <option value="">全部区域</option>
            {regions.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          <select value={storeId} onChange={e => setStoreId(e.target.value)}
            className="bg-surface border border-border text-text-primary text-sm rounded-lg px-3 py-2">
            <option value="">全部门店</option>
            {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <button onClick={handleDelete} disabled={deleting}
            className="px-3 py-2 text-danger text-sm border border-danger/30 rounded-lg hover:bg-danger/10 disabled:opacity-50">
            {deleting ? '清空中...' : '🗑️ 清空数据'}
          </button>
        </div>
      </div>

      {/* Excel导入 */}
      <div className="bg-surface border border-border rounded-xl p-5">
        <h2 className="text-base font-semibold mb-3">📤 导入 Excel</h2>
        <ExcelImporter onImported={load} />
      </div>

      {loading ? (
        <div className="space-y-4">
          {[...Array(4)].map((_, i) => <div key={i} className="bg-surface border border-border rounded-xl p-6 animate-pulse h-48" />)}
        </div>
      ) : analytics ? (
        <>
          {/* KPI */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            {[
              { label: '销售额', value: `¥${fmt(analytics.kpi.totalAmount)}`, color: 'text-accent' },
              { label: '销量', value: `${fmt(analytics.kpi.totalQuantity)} 台`, color: 'text-primary' },
              { label: '活跃销代', value: `${fmt(analytics.kpi.salesCount)} 人`, color: 'text-warning' },
              { label: '覆盖门店', value: `${fmt(analytics.kpi.storeCount)} 家`, color: 'text-accent' },
              { label: '成交率', value: `${fmt(analytics.kpi.dealRate)}%`, color: 'text-text-primary' },
            ].map(card => (
              <div key={card.label} className="bg-surface border border-border rounded-xl p-5">
                <div className="text-text-secondary text-sm mb-2">{card.label}</div>
                <div className={`text-xl font-bold font-mono ${card.color}`}>{card.value}</div>
              </div>
            ))}
          </div>

          {/* Row 1: Pie + Line */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-surface border border-border rounded-xl p-5">
              <h3 className="text-sm font-medium mb-4 text-text-secondary">机型销售额占比</h3>
              <ModelPieChart data={analytics.modelShare} />
            </div>
            <div className="bg-surface border border-border rounded-xl p-5">
              <h3 className="text-sm font-medium mb-4 text-text-secondary">月度销量趋势</h3>
              <MonthlyLineChart data={analytics.monthly} />
            </div>
          </div>

          {/* Row 2: Regional + Store Type */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-surface border border-border rounded-xl p-5">
              <h3 className="text-sm font-medium mb-4 text-text-secondary">区域销量对比</h3>
              <RegionalBarChart data={analytics.regionalSales} />
            </div>
            <div className="bg-surface border border-border rounded-xl p-5">
              <h3 className="text-sm font-medium mb-4 text-text-secondary">门店类型分布</h3>
              <StoreTypePieChart data={analytics.storeTypeSales} />
            </div>
          </div>

          {/* Row 3: Sales Rank + Price Segment */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-surface border border-border rounded-xl p-5">
              <h3 className="text-sm font-medium mb-4 text-text-secondary">销代销售额排行</h3>
              <SalesRankChart data={analytics.salesRank} />
            </div>
            <div className="bg-surface border border-border rounded-xl p-5">
              <h3 className="text-sm font-medium mb-4 text-text-secondary">价位段分布</h3>
              <PriceSegmentChart data={analytics.priceSegmentShare} />
            </div>
          </div>

          {/* Row 4: Customer Profiling */}
          <div className="bg-surface border border-border rounded-xl p-5">
            <h3 className="text-sm font-medium mb-4 text-text-secondary">客户画像概览</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <div className="text-xs text-text-secondary mb-3">复购潜力分布</div>
                <div className="space-y-2">
                  {['高', '中', '低'].map(level => {
                    const count = analytics.customerProfiling.repurchaseDistribution[level] || 0;
                    const total = Object.values(analytics.customerProfiling.repurchaseDistribution as Record<string,number>).reduce((s:number, v:number) => s + v, 0);
                    const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                    const colors: Record<string, string> = { '高': '#22c55e', '中': '#f59e0b', '低': '#ef4444' };
                    return (
                      <div key={level} className="flex items-center gap-3">
                        <span className="text-sm w-8">{level}</span>
                        <div className="flex-1 h-2.5 bg-border rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${Math.max(pct, 3)}%`, backgroundColor: colors[level] }} />
                        </div>
                        <span className="text-xs font-mono text-text-secondary w-20 text-right">{count} 人 ({pct}%)</span>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div>
                <div className="text-xs text-text-secondary mb-3">客户区域 TOP 5</div>
                {analytics.customerProfiling.topAddresses.length === 0 ? (
                  <div className="text-text-secondary text-sm">暂无数据</div>
                ) : (
                  <div className="space-y-1.5">
                    {analytics.customerProfiling.topAddresses.map((a: any, i: number) => (
                      <div key={i} className="flex items-center justify-between text-xs">
                        <span className="text-text-primary">{a.customer_address}</span>
                        <span className="text-text-secondary font-mono">{a.count} 次</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Data Table */}
          <div className="bg-surface border border-border rounded-xl p-5">
            <h3 className="text-sm font-semibold mb-4">明细数据 · 共 {records.length} 条</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-text-secondary">
                    {['日期', '门店', '销代', '机型', '数量', '单价', '金额', '客户区域'].map(h => (
                      <th key={h} className="pb-3 pr-4 font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {records.slice(0, 30).map((r: any) => (
                    <tr key={r.id} className="border-b border-border/50 hover:bg-white/5">
                      <td className="py-3 pr-4 font-mono text-xs">{r.sale_date}</td>
                      <td className="py-3 pr-4 text-xs">{r.store_name || '-'}</td>
                      <td className="py-3 pr-4">{r.sales_name}</td>
                      <td className="py-3 pr-4 text-primary text-xs">{r.model}</td>
                      <td className="py-3 pr-4 text-right font-mono">{r.quantity}</td>
                      <td className="py-3 pr-4 text-right font-mono">¥{r.unit_price?.toLocaleString()}</td>
                      <td className="py-3 pr-4 text-right font-mono text-accent">¥{r.amount?.toLocaleString()}</td>
                      <td className="py-3 pr-4 text-text-secondary text-xs max-w-[120px] truncate">{r.customer_address || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {records.length === 0 && <div className="text-center text-text-secondary py-8">暂无数据，请先导入 Excel</div>}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
