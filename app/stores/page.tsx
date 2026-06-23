'use client';
import { useEffect, useState, useCallback } from 'react';
import StoreForm from '@/components/StoreForm';
import { X } from 'lucide-react';

const CHANNELS = ['KA渠道', '传统渠道'];
const STORE_TYPES = ['直营', '加盟', '商场专柜', '社区店'];

export default function StoresPage() {
  const [stores, setStores] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [channelFilter, setChannelFilter] = useState('');
  const [cityFilter, setCityFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [editingStore, setEditingStore] = useState<any>(null);
  const [showModal, setShowModal] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const filterParams = new URLSearchParams();
      if (channelFilter) filterParams.set('channel', channelFilter);
      if (cityFilter) filterParams.set('city', cityFilter);
      if (typeFilter) filterParams.set('store_type', typeFilter);
      const qs = filterParams.toString() ? `?${filterParams.toString()}` : '';
      const r = await fetch(`/api/stores${qs}`);
      const d = await r.json();
      setStores(d.data || []);
    } finally {
      setLoading(false);
    }
  }, [channelFilter, cityFilter, typeFilter]);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`确认删除门店 "${name}"？`)) return;
    await fetch(`/api/stores?id=${id}`, { method: 'DELETE' });
    load();
  };

  const handleEdit = (store: any) => {
    setEditingStore(store);
    setShowModal(true);
  };

  const handleAdd = () => {
    setEditingStore(null);
    setShowModal(true);
  };

  const handleSaved = () => {
    setEditingStore(null);
    setShowModal(false);
    load();
  };

  const handleCloseModal = () => {
    setEditingStore(null);
    setShowModal(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">🏪 门店管理</h1>
          <p className="text-text-secondary text-sm mt-1">管理各区域门店档案，关联到销量数据中</p>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          <select
            value={channelFilter}
            onChange={e => setChannelFilter(e.target.value)}
            className="bg-surface border border-border text-text-primary text-sm rounded-lg px-3 py-2"
          >
            <option value="">全部渠道</option>
            {CHANNELS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
            className="bg-surface border border-border text-text-primary text-sm rounded-lg px-3 py-2"
          >
            <option value="">全部类型</option>
            {STORE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <input
            type="text"
            value={cityFilter}
            onChange={e => setCityFilter(e.target.value)}
            placeholder="搜索城市..."
            className="bg-surface border border-border text-text-primary text-sm rounded-lg px-3 py-2 w-28"
          />
          {(channelFilter || cityFilter || typeFilter) && (
            <button onClick={() => { setChannelFilter(''); setCityFilter(''); setTypeFilter(''); }}
              className="text-xs text-text-secondary hover:text-text-primary px-2 py-1">
              重置
            </button>
          )}
          <button onClick={handleAdd}
            className="px-4 py-2 bg-primary text-white text-sm rounded-lg hover:bg-primary/80 transition font-medium">
            ➕ 新增门店
          </button>
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: '门店总数', value: `${stores.length} 家`, color: 'text-primary' },
          { label: 'KA渠道', value: `${stores.filter(s => s.channel === 'KA渠道').length} 家`, color: 'text-accent' },
          { label: '传统渠道', value: `${stores.filter(s => s.channel === '传统渠道').length} 家`, color: 'text-warning' },
          { label: '直营门店', value: `${stores.filter(s => s.store_type === '直营').length} 家`, color: 'text-text-primary' },
        ].map(card => (
          <div key={card.label} className="bg-surface border border-border rounded-xl p-5">
            <div className="text-text-secondary text-sm mb-2">{card.label}</div>
            <div className={`text-xl font-bold font-mono ${card.color}`}>{card.value}</div>
          </div>
        ))}
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
                  {['门店编码', '门店名称', '城市', '渠道', '类型', '销代', '操作'].map(h => (
                    <th key={h} className="pb-3 pr-4 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {stores.map(s => (
                  <tr key={s.id} className="border-b border-border/50 hover:bg-white/5">
                    <td className="py-3 pr-4 font-mono text-xs text-text-secondary">{s.store_code || '-'}</td>
                    <td className="py-3 pr-4 font-medium">{s.name}</td>
                    <td className="py-3 pr-4 text-text-secondary">{s.city || '-'}</td>
                    <td className="py-3 pr-4">
                      <span className={`px-2 py-0.5 rounded-full text-xs ${s.channel === 'KA渠道' ? 'bg-accent/10 text-accent' : 'bg-warning/10 text-warning'}`}>{s.channel || '-'}</span>
                    </td>
                    <td className="py-3 pr-4 text-text-secondary">{s.store_type}</td>
                    <td className="py-3 pr-4 text-text-secondary">{s.manager || '-'}</td>
                    <td className="py-3 pr-4">
                      <div className="flex gap-3">
                        <button onClick={() => handleEdit(s)} className="text-primary hover:text-primary/80 text-xs font-medium">编辑</button>
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

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={handleCloseModal}>
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          {/* Card */}
          <div className="relative bg-surface border border-border rounded-xl p-6 w-full max-w-xl max-h-[90vh] overflow-y-auto shadow-2xl"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold">
                {editingStore ? `✏️ 编辑门店 — ${editingStore.name}` : '➕ 新增门店'}
              </h2>
              <button onClick={handleCloseModal}
                className="text-text-secondary hover:text-text-primary p-1 rounded-lg hover:bg-white/5 transition">
                <X size={18} />
              </button>
            </div>
            <StoreForm store={editingStore} onSave={handleSaved} onCancel={handleCloseModal} />
          </div>
        </div>
      )}
    </div>
  );
}
