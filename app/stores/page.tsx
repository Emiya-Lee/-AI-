'use client';
import { useEffect, useState, useCallback } from 'react';
import StoreForm from '@/components/StoreForm';
import Link from 'next/link';

const REGIONS = ['华南', '华东', '华北', '西南', '华中', '西北', '东北'];

export default function StoresPage() {
  const [stores, setStores] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [regionFilter, setRegionFilter] = useState('');
  const [editingStore, setEditingStore] = useState<any>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = regionFilter ? `?region=${regionFilter}` : '';
      const r = await fetch(`/api/stores${params}`);
      const d = await r.json();
      setStores(d.data || []);
    } finally {
      setLoading(false);
    }
  }, [regionFilter]);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`确认删除门店 "${name}"？`)) return;
    await fetch(`/api/stores?id=${id}`, { method: 'DELETE' });
    load();
  };

  const handleEdit = (store: any) => {
    setEditingStore(store);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSaved = () => {
    setEditingStore(null);
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">🏪 门店管理</h1>
          <p className="text-text-secondary text-sm mt-1">管理各区域门店档案，关联到销量数据中</p>
        </div>
        <div className="flex gap-3 items-center">
          <select
            value={regionFilter}
            onChange={e => setRegionFilter(e.target.value)}
            className="bg-surface border border-border text-text-primary text-sm rounded-lg px-3 py-2"
          >
            <option value="">全部区域</option>
            {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: '门店总数', value: `${stores.length} 家`, color: 'text-primary' },
          { label: '覆盖区域', value: `${new Set(stores.map(s => s.region)).size} 个`, color: 'text-accent' },
          { label: '直营门店', value: `${stores.filter(s => s.store_type === '直营').length} 家`, color: 'text-warning' },
          { label: '商场/加盟', value: `${stores.filter(s => s.store_type !== '直营').length} 家`, color: 'text-text-primary' },
        ].map(card => (
          <div key={card.label} className="bg-surface border border-border rounded-xl p-5">
            <div className="text-text-secondary text-sm mb-2">{card.label}</div>
            <div className={`text-xl font-bold font-mono ${card.color}`}>{card.value}</div>
          </div>
        ))}
      </div>

      {/* Form */}
      <div className="bg-surface border border-border rounded-xl p-5">
        <h2 className="text-base font-semibold mb-4">{editingStore ? '✏️ 编辑门店' : '➕ 新增门店'}</h2>
        <StoreForm store={editingStore} onSave={handleSaved} onCancel={() => setEditingStore(null)} />
      </div>

      {/* Store list */}
      <div className="bg-surface border border-border rounded-xl p-5">
        <h3 className="text-sm font-semibold mb-4">门店列表 · 共 {stores.length} 家</h3>
        {loading ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => <div key={i} className="bg-bg rounded-lg animate-pulse h-14" />)}
          </div>
        ) : stores.length === 0 ? (
          <div className="text-center text-text-secondary py-8">暂无门店数据，请添加</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-text-secondary">
                  {['门店名称', '区域', '城市', '类型', '店长', '操作'].map(h => (
                    <th key={h} className="pb-3 pr-4 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {stores.map(s => (
                  <tr key={s.id} className="border-b border-border/50 hover:bg-white/5">
                    <td className="py-3 pr-4 font-medium">{s.name}</td>
                    <td className="py-3 pr-4">
                      <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs">{s.region}</span>
                    </td>
                    <td className="py-3 pr-4 text-text-secondary">{s.city || '-'}</td>
                    <td className="py-3 pr-4 text-text-secondary">{s.store_type}</td>
                    <td className="py-3 pr-4 text-text-secondary">{s.manager || '-'}</td>
                    <td className="py-3 pr-4">
                      <div className="flex gap-2">
                        <button onClick={() => handleEdit(s)} className="text-primary/70 hover:text-primary text-xs">编辑</button>
                        <button onClick={() => handleDelete(s.id, s.name)} className="text-danger/70 hover:text-danger text-xs">删除</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-4 pt-4 border-t border-border/50 text-xs text-text-secondary">
          💡 提示：销量数据中的门店信息可在 Excel 导入时通过"门店"列自动匹配。
        </div>
      </div>
    </div>
  );
}
