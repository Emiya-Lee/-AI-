'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';

export default function HomePage() {
  const [kpi, setKpi] = useState<any>(null);
  const [capAnalytics, setCapAnalytics] = useState<any>(null);
  const [storeKpi, setStoreKpi] = useState<any>(null);

  useEffect(() => {
    Promise.all([
      fetch('/api/analytics/sales').then(r => r.json()),
      fetch('/api/analytics/capability').then(r => r.json()),
      fetch('/api/store-performance').then(r => r.json()),
    ])
      .then(([salesData, capData, spData]) => {
        setKpi(salesData.kpi);
        setCapAnalytics({
          stdDeviation: capData.stdDeviation,
          correlationR: capData.correlationR,
          coverageRates: capData.coverageRates,
          weekOverWeek: capData.weekOverWeek,
        });
        const perfs = spData.data || [];
        const totalStoreSales = perfs.reduce((s: number, p: any) => s + (p.our_total_sales || 0), 0);
        const totalStoreQty = perfs.reduce((s: number, p: any) => s + (p.our_total_quantity || 0), 0);
        const avgEff = perfs.length > 0
          ? Math.round(perfs.reduce((s: number, p: any) => s + (p.store_efficiency_score || 0), 0) / perfs.length * 10) / 10
          : 0;
        setStoreKpi({
          storeCount: perfs.length,
          totalStoreSales,
          totalStoreQty,
          avgEfficiency: avgEff,
        });
      })
      .catch(console.error);
  }, []);

  const fmt = (n: number) => n?.toLocaleString?.('zh-CN', { maximumFractionDigits: 0 }) ?? (n ?? 0);
  const avgCoverage = capAnalytics?.coverageRates?.length
    ? Math.round(capAnalytics.coverageRates.reduce((s: number, r: any) => s + r.coverageRate, 0) / capAnalytics.coverageRates.length)
    : 0;

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
          <Link href="/store-efficiency" className="px-4 py-2 bg-surface border border-accent/30 rounded-lg text-sm hover:border-accent/50 transition text-accent">
            📊 店效分析
          </Link>
          <Link href="/capability" className="px-4 py-2 bg-surface border border-border rounded-lg text-sm hover:border-primary/50 transition">
            🎯 能力诊断
          </Link>
        </div>
      </div>

      {kpi ? (
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
          {[
            { label: '本月销售额', value: `¥${fmt(kpi.totalAmount)}`, color: 'text-accent' },
            { label: '本月销量', value: `${kpi.totalQuantity} 台`, color: 'text-primary' },
            { label: '活跃销代', value: `${kpi.salesCount} 人`, color: 'text-warning' },
            { label: '覆盖门店', value: `${kpi.storeCount ?? kpi.salesCount} 家`, color: 'text-accent' },
            { label: '成交率', value: `${kpi.dealRate}%`, color: kpi.dealRate >= 50 ? 'text-accent' : 'text-danger' },
            { label: '讲解覆盖率', value: `${avgCoverage}%`, color: avgCoverage >= 80 ? 'text-accent' : 'text-warning' },
          ].map((card) => (
            <div key={card.label} className="bg-surface border border-border rounded-xl p-5">
              <div className="text-text-secondary text-sm mb-2">{card.label}</div>
              <div className={`text-2xl font-bold font-mono ${card.color}`}>{card.value}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-surface border border-border rounded-xl p-5 animate-pulse h-24" />
          ))}
        </div>
      )}

      {/* 店效 KPI 行 */}
      {storeKpi && storeKpi.storeCount > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: '已录入店效门店', value: `${storeKpi.storeCount} 家`, color: 'text-primary' },
            { label: '门店总销量', value: `${(storeKpi.totalStoreQty || 0).toLocaleString()} 台`, color: 'text-accent' },
            { label: '门店总销售额', value: `¥${(storeKpi.totalStoreSales || 0).toLocaleString('zh-CN', { maximumFractionDigits: 0 })}`, color: 'text-accent' },
            { label: '平均店效系数', value: `${storeKpi.avgEfficiency}`, color: storeKpi.avgEfficiency >= 10 ? 'text-accent' : 'text-warning' },
          ].map((card) => (
            <div key={card.label} className="bg-surface border border-accent/20 rounded-xl p-5">
              <div className="text-text-secondary text-sm mb-2">{card.label}</div>
              <div className={`text-xl font-bold font-mono ${card.color}`}>{card.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* SOP 核心指标行：人效离散度 + 相关性R + 周环比 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-surface border border-border rounded-xl p-5">
          <div className="text-text-secondary text-sm mb-2">人效离散度</div>
          <div className="flex items-end gap-2">
            <span className={`text-2xl font-bold font-mono ${(capAnalytics?.stdDeviation ?? 0) < 15 ? 'text-accent' : 'text-warning'}`}>
              {capAnalytics?.stdDeviation ?? '—'}
            </span>
            <span className="text-text-secondary text-sm mb-1">标准差</span>
          </div>
          <div className="text-xs text-text-secondary mt-2">
            {capAnalytics?.stdDeviation < 10 ? '✅ 销代间能力差距小，团队均衡' :
             capAnalytics?.stdDeviation < 20 ? '⚠️ 存在一定能力差距，需关注落后人员' :
             '🔴 能力差距大，建议专项培训'}
          </div>
        </div>
        <div className="bg-surface border border-border rounded-xl p-5">
          <div className="text-text-secondary text-sm mb-2">讲解率→成交率 相关性</div>
          <div className="flex items-end gap-2">
            <span className={`text-2xl font-bold font-mono ${(capAnalytics?.correlationR ?? 0) >= 0.5 ? 'text-accent' : (capAnalytics?.correlationR ?? 0) > 0 ? 'text-warning' : 'text-danger'}`}>
              R = {capAnalytics?.correlationR ?? '—'}
            </span>
          </div>
          <div className="text-xs text-text-secondary mt-2">
            {(capAnalytics?.correlationR ?? 0) >= 0.7 ? '✅ 强正相关，讲解越好成交越高' :
             (capAnalytics?.correlationR ?? 0) >= 0.3 ? '⚠️ 中等相关，继续积累数据' :
             (capAnalytics?.correlationR ?? 0) > 0 ? '📊 弱相关，样本不足或需引入更多变量' :
             '📊 等待更多数据（需≥3个销代有记录）'}
          </div>
        </div>
        <div className="bg-surface border border-border rounded-xl p-5">
          <div className="text-text-secondary text-sm mb-2">讲解覆盖率趋势（周环比）</div>
          <div className="flex items-end gap-3">
            <div>
              <div className="text-xs text-text-secondary">本周</div>
              <div className="text-xl font-bold font-mono text-primary">{capAnalytics?.weekOverWeek?.thisWeek ?? '—'}%</div>
            </div>
            <div className={`text-lg font-mono font-bold ${(capAnalytics?.weekOverWeek?.trend) === 'up' ? 'text-accent' : (capAnalytics?.weekOverWeek?.trend) === 'down' ? 'text-danger' : 'text-text-secondary'}`}>
              {capAnalytics?.weekOverWeek?.change > 0 ? `↑ +${capAnalytics.weekOverWeek.change}` :
               capAnalytics?.weekOverWeek?.change < 0 ? `↓ ${capAnalytics.weekOverWeek.change}` :
               '→ 0'}%
            </div>
          </div>
          <div className="text-xs text-text-secondary mt-2">
            上周 {capAnalytics?.weekOverWeek?.lastWeek ?? '—'}% · SOP建议≥80%
          </div>
        </div>
      </div>

      <div className="bg-surface border border-border rounded-xl p-6">
        <h2 className="text-lg font-semibold mb-4">使用指南</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="border border-border rounded-lg p-4">
            <div className="text-primary font-medium mb-2">🏪 门店档案</div>
            <p className="text-text-secondary text-sm">建立门店档案，按区域和类型管理销售网点。销量数据按门店关联，支持区域维度聚合分析。</p>
          </div>
          <div className="border border-border rounded-lg p-4">
            <div className="text-accent font-medium mb-2">📊 店效分析</div>
            <p className="text-text-secondary text-sm">录入门店整体销量和友商竞品数据。系统自动计算结构占比、区域系数和店效综合系数，用数据说话。</p>
          </div>
          <div className="border border-border rounded-lg p-4">
            <div className="text-primary font-medium mb-2">📈 数据导入</div>
            <p className="text-text-secondary text-sm">每周从已有系统导出 Excel 零售报表，一键导入。自动去重，支持门店匹配和机型自动识别。</p>
          </div>
          <div className="border border-border rounded-lg p-4">
            <div className="text-warning font-medium mb-2">🎯 能力诊断</div>
            <p className="text-text-secondary text-sm">记录每次销售沟通，按机型和薄弱点分类追踪。系统自动计算讲解覆盖率、成交率趋势、与团队均值的差距。</p>
          </div>
          <div className="border border-border rounded-lg p-4">
            <div className="text-accent font-medium mb-2">📋 问题跟进</div>
            <p className="text-text-secondary text-sm">跟踪销代提交的问题反馈（产品知识/话术/竞品），按紧迫性排序。紧急问题当天跟进，形成培训闭环。</p>
          </div>
        </div>
      </div>
    </div>
  );
}
