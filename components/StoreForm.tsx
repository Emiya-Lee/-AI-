'use client';
import { useState } from 'react';

const REGIONS = ['华南', '华东', '华北', '西南', '华中', '西北', '东北'];
const STORE_TYPES = ['直营', '加盟', '商场专柜', '社区店'];

interface Store {
  id?: number;
  name: string;
  address: string;
  region: string;
  city: string;
  store_type: string;
  manager: string;
}

interface Props {
  store?: Store | null;
  onSave: () => void;
  onCancel?: () => void;
}

export default function StoreForm({ store, onSave, onCancel }: Props) {
  const [form, setForm] = useState<Store>(store || {
    name: '', address: '', region: '华南', city: '', store_type: '直营', manager: '',
  });
  const [submitting, setSubmitting] = useState(false);

  const isEdit = !!store?.id;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.region) return alert('门店名称和区域必填');
    setSubmitting(true);
    try {
      const url = isEdit ? `/api/stores?id=${store!.id}` : '/api/stores';
      const method = isEdit ? 'PUT' : 'POST';
      const r = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!r.ok) {
        const d = await r.json();
        throw new Error(d.error || '保存失败');
      }
      if (!isEdit) {
        setForm({ name: '', address: '', region: '华南', city: '', store_type: '直营', manager: '' });
      }
      onSave();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const update = (key: string, value: string) => setForm(f => ({ ...f, [key]: value }));

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div>
          <label className="text-xs text-text-secondary block mb-1">门店名称 *</label>
          <input type="text" className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm" value={form.name}
            onChange={e => update('name', e.target.value)} placeholder="如：深圳华强北旗舰店" />
        </div>
        <div>
          <label className="text-xs text-text-secondary block mb-1">区域 *</label>
          <select className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm" value={form.region}
            onChange={e => update('region', e.target.value)}>
            <option value="">请选择</option>
            {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-text-secondary block mb-1">城市</label>
          <input type="text" className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm" value={form.city}
            onChange={e => update('city', e.target.value)} placeholder="如：深圳" />
        </div>
        <div>
          <label className="text-xs text-text-secondary block mb-1">门店类型</label>
          <select className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm" value={form.store_type}
            onChange={e => update('store_type', e.target.value)}>
            {STORE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-text-secondary block mb-1">店长</label>
          <input type="text" className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm" value={form.manager}
            onChange={e => update('manager', e.target.value)} placeholder="店长姓名" />
        </div>
        <div>
          <label className="text-xs text-text-secondary block mb-1">地址</label>
          <input type="text" className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm" value={form.address}
            onChange={e => update('address', e.target.value)} placeholder="详细地址" />
        </div>
      </div>
      <div className="flex gap-2">
        <button type="submit" disabled={submitting}
          className="px-6 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/80 disabled:opacity-50 transition">
          {submitting ? '保存中...' : isEdit ? '💾 更新门店' : '➕ 添加门店'}
        </button>
        {isEdit && onCancel && (
          <button type="button" onClick={onCancel}
            className="px-4 py-2 border border-border rounded-lg text-sm text-text-secondary hover:text-text-primary transition">
            取消
          </button>
        )}
      </div>
    </form>
  );
}
