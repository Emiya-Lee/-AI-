'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';

export default function HomePage() {
  const [kpi, setKpi] = useState<any>(null);

  useEffect(() => {
    fetch('/api/analytics/sales')
      .then(r => r.json())
      .then(d => setKpi(d.kpi))
      .catch(console.error);
  }, []);

  const fmt = (n: number) => n.toLocaleString('zh-CN', { maximumFractionDigits: 0 });

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">首页仪表盘</h1>
          <p className="text-text-secondary text-sm mt-1">人效分析 · 实时数据概览</p>
        </div>
        <div className="flex gap-3">
          <Link href="/sales" className="px-4 py-2 bg-primary/20 text-primary border border-primary/30 rounded-lg text-sm hover:bg-primary/30 transition">
            📈 销量分析
          </Link>
          <Link href="/capability" className="px-4 py-2 bg-surface border border-border rounded-lg text-sm hover:border-primary/50 transition">
            🎯 记录能力
          </Link>
        </div>
      </div>

      {kpi ? (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          {[
            { label: '本月销售额', value: `¥${fmt(kpi.totalAmount)}`, color: 'text-accent' },
            { label: '本月销量', value: `${kpi.totalQuantity} 台`, color: 'text-primary' },
            { label: '活跃销代', value: `${kpi.salesCount} 人`, color: 'text-warning' },
            { label: '覆盖门店', value: `${kpi.storeCount ?? kpi.salesCount} 家`, color: 'text-accent' },
            { label: '能力记录成交率', value: `${kpi.dealRate}%`, color: kpi.dealRate >= 50 ? 'text-accent' : 'text-danger' },
          ].map((card) => (
            <div key={card.label} className="bg-surface border border-border rounded-xl p-5">
              <div className="text-text-secondary text-sm mb-2">{card.label}</div>
              <div className={`text-2xl font-bold font-mono ${card.color}`}>{card.value}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="bg-surface border border-border rounded-xl p-5 animate-pulse h-24" />
          ))}
        </div>
      )}

      <div className="bg-surface border border-border rounded-xl p-6">
        <h2 className="text-lg font-semibold mb-4">使用指南</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="border border-border rounded-lg p-4">
            <div className="text-primary font-medium mb-2">🏪 门店管理</div>
            <p className="text-text-secondary text-sm">建立门店档案，按区域和类型管理销售网点。销量数据按门店关联，支持区域维度聚合分析。</p>
          </div>
          <div className="border border-border rounded-lg p-4">
            <div className="text-primary font-medium mb-2">📈 销量分析</div>
            <p className="text-text-secondary text-sm">导入 Excel 零售报表，自动生成机型占比、月度趋势、区域对比、价位段分布、客户画像等图表。</p>
          </div>
          <div className="border border-border rounded-lg p-4">
            <div className="text-warning font-medium mb-2">🎯 能力缺陷</div>
            <p className="text-text-secondary text-sm">记录每次销售沟通，按机型和薄弱点分类追踪，系统对比每位销代每款机型的成交率与区域均值差距。</p>
          </div>
        </div>
      </div>
    </div>
  );
}
