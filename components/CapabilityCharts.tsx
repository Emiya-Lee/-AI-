'use client';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis } from 'recharts';

const COLORS = { primary: '#6366f1', accent: '#22c55e', warning: '#f59e0b', danger: '#ef4444' };

export function ConcernCompareChart({ concernFreq, explainedFreq }: { concernFreq: Record<string, number>; explainedFreq: Record<string, number> }) {
  const allKeys = Array.from(new Set([...Object.keys(concernFreq), ...Object.keys(explainedFreq)]));
  if (allKeys.length === 0) return <div className="text-text-secondary text-sm">暂无数据</div>;
  const data = allKeys.map(k => ({
    name: k,
    '顾客关注': concernFreq[k] || 0,
    '销代讲解': explainedFreq[k] || 0,
  }));
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#2e3340" />
        <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 12 }} />
        <YAxis tick={{ fill: '#94a3b8', fontSize: 12 }} />
        <Tooltip contentStyle={{ background: '#1a1d27', border: '1px solid #2e3340', borderRadius: 8 }} />
        <Bar dataKey="顾客关注" fill={COLORS.primary} radius={[4, 4, 0, 0]} />
        <Bar dataKey="销代讲解" fill={COLORS.accent} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function NegotiationChart({ stats }: { stats: { avgCount: number; dealCount: number; totalCount: number; dealRate: number } }) {
  const data = [
    { name: '成交', value: stats.dealCount, fill: COLORS.accent },
    { name: '未成交', value: Math.max(0, stats.totalCount - stats.dealCount), fill: COLORS.danger },
  ];
  if (stats.totalCount === 0) return <div className="text-text-secondary text-sm">暂无数据</div>;
  return (
    <div className="space-y-4">
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data} layout="vertical">
          <CartesianGrid strokeDasharray="3 3" stroke="#2e3340" horizontal={false} />
          <XAxis type="number" tick={{ fill: '#94a3b8', fontSize: 12 }} />
          <YAxis type="category" dataKey="name" tick={{ fill: '#94a3b8', fontSize: 12 }} width={60} />
          <Tooltip contentStyle={{ background: '#1a1d27', border: '1px solid #2e3340', borderRadius: 8 }} />
          <Bar dataKey="value" radius={[0, 4, 4, 0]}>
            {data.map((d, i) => <rect key={i} fill={d.fill} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <div className="flex justify-between text-sm">
        <div className="text-text-secondary">平均拉扯次数 <span className="text-warning font-mono font-bold">{stats.avgCount}</span> 次</div>
        <div className="text-accent">成交率 <span className="font-mono font-bold">{stats.dealRate}%</span></div>
      </div>
    </div>
  );
}

export function WeaknessWordCloud({ words }: { words: { word: string; count: number }[] }) {
  if (!words || words.length === 0) return <div className="text-text-secondary text-sm">暂无数据</div>;
  const max = words[0]?.count || 1;
  return (
    <div className="flex flex-wrap gap-2">
      {words.map(({ word, count }) => {
        const ratio = count / max;
        const size = 12 + ratio * 16;
        const opacity = 0.5 + ratio * 0.5;
        return (
          <span key={word} className="text-primary cursor-default" style={{ fontSize: `${size}px`, opacity }}>
            {word}({count})
          </span>
        );
      })}
    </div>
  );
}

// ── New chart components for v2.0 ──

export function WeaknessCategoryChart({ data }: { data: { category: string; count: number; pct: number }[] }) {
  if (!data || data.length === 0) return <div className="text-text-secondary text-sm">暂无数据</div>;
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} layout="vertical">
        <CartesianGrid strokeDasharray="3 3" stroke="#2e3340" horizontal={false} />
        <XAxis type="number" tick={{ fill: '#94a3b8', fontSize: 12 }} />
        <YAxis type="category" dataKey="category" tick={{ fill: '#94a3b8', fontSize: 12 }} width={96} />
        <Tooltip contentStyle={{ background: '#1a1d27', border: '1px solid #2e3340', borderRadius: 8 }} formatter={(v: number, name: string) => [`${v} 次 (${data.find(d => d.count === v)?.pct}%)`, name]} />
        <Bar dataKey="count" fill="#6366f1" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function RepModelCompareChart({ data }: { data: { sales_name: string; model: string; deal_rate: number; total_attempts: number; avg_explanation_duration: number; regional_avg_deal_rate: number; gap: number }[] }) {
  if (!data || data.length === 0) return <div className="text-text-secondary text-sm">暂无数据</div>;
  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-text-secondary text-xs">
              <th className="pb-2 pr-3 font-medium">销代</th>
              <th className="pb-2 pr-3 font-medium">机型</th>
              <th className="pb-2 pr-3 font-medium text-center">尝试次数</th>
              <th className="pb-2 pr-3 font-medium text-center">成交率</th>
              <th className="pb-2 pr-3 font-medium text-center">区域均值</th>
              <th className="pb-2 pr-3 font-medium text-center">差距</th>
              <th className="pb-2 pr-3 font-medium text-center">讲解时长</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d, i) => (
              <tr key={i} className="border-b border-border/50 hover:bg-white/5">
                <td className="py-2 pr-3 text-sm">{d.sales_name}</td>
                <td className="py-2 pr-3 text-primary text-xs font-mono">{d.model}</td>
                <td className="py-2 pr-3 text-center font-mono text-xs">{d.total_attempts}</td>
                <td className="py-2 pr-3 text-center font-mono font-medium" style={{ color: d.deal_rate >= 50 ? '#22c55e' : '#ef4444' }}>{d.deal_rate}%</td>
                <td className="py-2 pr-3 text-center text-text-secondary font-mono text-xs">{d.regional_avg_deal_rate}%</td>
                <td className="py-2 pr-3 text-center font-mono font-bold" style={{ color: d.gap >= 0 ? '#22c55e' : '#ef4444' }}>{d.gap >= 0 ? `+${d.gap}` : d.gap}%</td>
                <td className="py-2 pr-3 text-center text-text-secondary text-xs">{d.avg_explanation_duration}分钟</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap gap-3 text-xs text-text-secondary">
        {data.filter(d => d.gap < 0).length > 0 && (
          <div className="bg-danger/10 border border-danger/30 rounded-lg px-3 py-2">
            ⚠️ <span className="text-danger font-medium">{data.filter(d => d.gap < 0).length}</span> 项低于区域平均水平，需重点关注
          </div>
        )}
        {data.filter(d => d.gap >= 0).length > 0 && (
          <div className="bg-accent/10 border border-accent/30 rounded-lg px-3 py-2">
            ✅ <span className="text-accent font-medium">{data.filter(d => d.gap >= 0).length}</span> 项达到或超过区域平均水平
          </div>
        )}
      </div>
    </div>
  );
}

export function InterestLevelChart({ data }: { data: Record<string, number> }) {
  if (!data || Object.keys(data).length === 0) return <div className="text-text-secondary text-sm">暂无数据</div>;
  const total = (data['高'] || 0) + (data['中'] || 0) + (data['低'] || 0);
  const colors: Record<string, string> = { '高': '#22c55e', '中': '#f59e0b', '低': '#ef4444' };
  return (
    <div className="space-y-3">
      {['高', '中', '低'].map(level => {
        const count = data[level] || 0;
        const pct = total > 0 ? Math.round((count / total) * 100) : 0;
        return (
          <div key={level} className="flex items-center gap-3">
            <span className="text-sm w-8">{level}</span>
            <div className="flex-1 h-3 bg-border rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.max(pct, 2)}%`, backgroundColor: colors[level] }} />
            </div>
            <span className="text-xs font-mono text-text-secondary w-16 text-right">{count} 人 ({pct}%)</span>
          </div>
        );
      })}
    </div>
  );
}

// ── SOP v2.1 New Charts ──

export function CoverageBarChart({ data, standardDims }: { data: { sales_name: string; coverageRate: number; coveredDims: string[]; missingDims: string[]; closeRate: number }[]; standardDims: string[] }) {
  if (!data || data.length === 0) return <div className="text-text-secondary text-sm">暂无数据</div>;
  return (
    <div className="space-y-3">
      {data.map(r => (
        <div key={r.sales_name} className="space-y-1">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">{r.sales_name}</span>
            <div className="flex items-center gap-2">
              <span className={`text-xs px-2 py-0.5 rounded-full ${r.coverageRate >= 80 ? 'bg-accent/10 text-accent' : r.coverageRate >= 50 ? 'bg-warning/10 text-warning' : 'bg-danger/10 text-danger'}`}>
                覆盖率 {r.coverageRate}%
              </span>
              <span className="text-xs text-text-secondary">· 成交率 {r.closeRate}%</span>
            </div>
          </div>
          <div className="h-2.5 bg-border rounded-full overflow-hidden flex">
            {standardDims.map((dim) => {
              const covered = r.coveredDims.includes(dim);
              return (
                <div
                  key={dim}
                  className={`h-full flex-1 border-r border-bg/50 transition-all ${covered ? 'bg-primary' : 'bg-surface'}`}
                  title={`${dim}: ${covered ? '已覆盖' : '未覆盖'}`}
                />
              );
            })}
          </div>
          <div className="flex justify-between text-xs text-text-secondary px-0.5">
            {standardDims.map(dim => (
              <span key={dim} className={`truncate max-w-[60px] text-center ${r.missingDims.includes(dim) ? 'text-danger/70' : ''}`}>
                {dim}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function RepTrendChart({ data, repName }: { data: { date: string; attempts: number; deals: number; rate: number }[]; repName: string }) {
  if (!data || data.length === 0) return <div className="text-text-secondary text-xs">暂无趋势数据</div>;
  return (
    <ResponsiveContainer width="100%" height={120}>
      <LineChart data={data}>
        <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 10 }} />
        <YAxis domain={[0, 100]} tick={{ fill: '#94a3b8', fontSize: 10 }} tickFormatter={v => `${v}%`} width={40} />
        <Tooltip contentStyle={{ background: '#1a1d27', border: '1px solid #2e3340', borderRadius: 8, fontSize: 12 }}
          formatter={(v: number) => `${v}%`} labelFormatter={l => `${repName} · ${l}`} />
        <Line type="monotone" dataKey="rate" stroke="#6366f1" strokeWidth={2} dot={{ fill: '#6366f1', r: 3 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function CoverageRadarChart({ data }: { data: { dimension: string; repsCovered: number; totalReps: number; pct: number }[] }) {
  if (!data || data.length === 0) return <div className="text-text-secondary text-sm">暂无数据</div>;
  const radarData = data.map(d => ({ dimension: d.dimension, '团队覆盖率': d.pct }));
  return (
    <ResponsiveContainer width="100%" height={280}>
      <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="75%">
        <PolarGrid stroke="#2e3340" />
        <PolarAngleAxis dataKey="dimension" tick={{ fill: '#94a3b8', fontSize: 11 }} />
        <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fill: '#94a3b8', fontSize: 10 }} tickFormatter={v => `${v}%`} />
        <Radar name="团队覆盖率" dataKey="团队覆盖率" stroke="#6366f1" fill="#6366f1" fillOpacity={0.2} strokeWidth={2} />
      </RadarChart>
    </ResponsiveContainer>
  );
}
