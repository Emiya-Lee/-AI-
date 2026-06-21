'use client';
import { PieChart, Pie, Cell, BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#14b8a6'];

export function ModelPieChart({ data }: { data: { model: string; amount: number }[] }) {
  if (!data || data.length === 0) return <div className="text-text-secondary text-sm">暂无数据</div>;
  const total = data.reduce((s, d) => s + d.amount, 0);
  return (
    <ResponsiveContainer width="100%" height={300}>
      <PieChart>
        <Pie data={data} dataKey="amount" nameKey="model" cx="50%" cy="50%" outerRadius={110} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
          {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
        </Pie>
        <Tooltip formatter={(v: number) => `¥${v.toLocaleString()}`} contentStyle={{ background: '#1a1d27', border: '1px solid #2e3340', borderRadius: 8 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function MonthlyLineChart({ data }: { data: { month: string; amount: number }[] }) {
  if (!data || data.length === 0) return <div className="text-text-secondary text-sm">暂无数据</div>;
  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#2e3340" />
        <XAxis dataKey="month" tick={{ fill: '#94a3b8', fontSize: 12 }} />
        <YAxis tick={{ fill: '#94a3b8', fontSize: 12 }} tickFormatter={v => `¥${(v / 1000).toFixed(0)}k`} />
        <Tooltip formatter={(v: number) => `¥${v.toLocaleString()}`} contentStyle={{ background: '#1a1d27', border: '1px solid #2e3340', borderRadius: 8 }} />
        <Line type="monotone" dataKey="amount" stroke="#6366f1" strokeWidth={2} dot={{ fill: '#6366f1', r: 4 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function SalesRankChart({ data }: { data: { sales_name: string; amount: number }[] }) {
  if (!data || data.length === 0) return <div className="text-text-secondary text-sm">暂无数据</div>;
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} layout="vertical">
        <CartesianGrid strokeDasharray="3 3" stroke="#2e3340" horizontal={false} />
        <XAxis type="number" tick={{ fill: '#94a3b8', fontSize: 12 }} tickFormatter={v => `¥${(v / 1000).toFixed(0)}k`} />
        <YAxis type="category" dataKey="sales_name" tick={{ fill: '#94a3b8', fontSize: 12 }} width={60} />
        <Tooltip formatter={(v: number) => `¥${v.toLocaleString()}`} contentStyle={{ background: '#1a1d27', border: '1px solid #2e3340', borderRadius: 8 }} />
        <Bar dataKey="amount" fill="#6366f1" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── New chart components for v2.0 ──

export function RegionalBarChart({ data }: { data: { region: string; amount: number; quantity: number }[] }) {
  if (!data || data.length === 0) return <div className="text-text-secondary text-sm">暂无数据</div>;
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} layout="horizontal">
        <CartesianGrid strokeDasharray="3 3" stroke="#2e3340" />
        <XAxis dataKey="region" tick={{ fill: '#94a3b8', fontSize: 12 }} />
        <YAxis tick={{ fill: '#94a3b8', fontSize: 12 }} tickFormatter={v => `¥${(v / 1000).toFixed(0)}k`} />
        <Tooltip formatter={(v: number) => `¥${v.toLocaleString()}`} contentStyle={{ background: '#1a1d27', border: '1px solid #2e3340', borderRadius: 8 }} />
        <Bar dataKey="amount" fill="#22c55e" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function StoreTypePieChart({ data }: { data: { store_type: string; amount: number }[] }) {
  if (!data || data.length === 0) return <div className="text-text-secondary text-sm">暂无数据</div>;
  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie data={data} dataKey="amount" nameKey="store_type" cx="50%" cy="50%" outerRadius={90} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
          {data.map((_, i) => <Cell key={i} fill={['#6366f1', '#22c55e', '#f59e0b', '#ef4444'][i % 4]} />)}
        </Pie>
        <Tooltip formatter={(v: number) => `¥${v.toLocaleString()}`} contentStyle={{ background: '#1a1d27', border: '1px solid #2e3340', borderRadius: 8 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function PriceSegmentChart({ data }: { data: { price_segment: string; amount: number; quantity: number }[] }) {
  if (!data || data.length === 0) return <div className="text-text-secondary text-sm">暂无数据</div>;
  const segColors: Record<string, string> = { '入门': '#94a3b8', '中端': '#6366f1', '高端': '#22c55e', '旗舰': '#f59e0b' };
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#2e3340" />
        <XAxis dataKey="price_segment" tick={{ fill: '#94a3b8', fontSize: 12 }} />
        <YAxis tick={{ fill: '#94a3b8', fontSize: 12 }} tickFormatter={v => `¥${(v / 1000).toFixed(0)}k`} />
        <Tooltip formatter={(v: number) => `¥${v.toLocaleString()}`} contentStyle={{ background: '#1a1d27', border: '1px solid #2e3340', borderRadius: 8 }} />
        <Bar dataKey="amount" radius={[4, 4, 0, 0]}>
          {data.map((d, i) => <Cell key={i} fill={segColors[d.price_segment] || COLORS[i % COLORS.length]} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
