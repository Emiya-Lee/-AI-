'use client';
import { useState, useRef } from 'react';

export default function ExcelImporter({ onImported }: { onImported?: () => void }) {
  const [drag, setDrag] = useState(false);
  const [status, setStatus] = useState<'idle' | 'importing' | 'done' | 'error'>('idle');
  const [msg, setMsg] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setStatus('importing');
    const fd = new FormData();
    fd.append('file', file);
    try {
      const r = await fetch('/api/sales', { method: 'POST', body: fd });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || '导入失败');
      setStatus('done');
      setMsg(`✅ 成功 ${d.imported} 条 | 跳过 ${d.skipped} 条重复 | 失败 ${d.errors} 条`);
      onImported?.();
    } catch (e: any) {
      setStatus('error');
      setMsg(`❌ ${e.message}`);
    }
  };

  return (
    <div className="space-y-3">
      <div
        className={`border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer ${
          drag ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50'
        }`}
        onDragOver={e => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={e => {
          e.preventDefault();
          setDrag(false);
          const file = e.dataTransfer.files[0];
          if (file) handleFile(file);
        }}
        onClick={() => inputRef.current?.click()}
      >
        <input ref={inputRef} type="file" accept=".xlsx,.xls" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
        <div className="text-4xl mb-3">{status === 'importing' ? '⏳' : status === 'done' ? '✅' : status === 'error' ? '❌' : '📤'}</div>
        <div className="text-sm text-text-secondary">
          {status === 'importing' ? '解析中...' :
           status === 'done' ? msg ||
             `拖拽 Excel 文件到此处，或点击选择文件` :
           status === 'error' ? msg :
           '拖拽 Excel 文件到此处，或点击选择文件'}
        </div>
        <div className="text-xs text-text-secondary mt-2">支持 .xlsx / .xls，表头需包含：销售日期、业务员、型号、金额（可选：门店、客户区域、购买偏好、复购潜力、价位段）</div>
      </div>
      {status !== 'idle' && status !== 'importing' && (
        <button onClick={() => { setStatus('idle'); setMsg(''); }} className="text-xs text-text-secondary hover:text-text-primary">
          清除状态
        </button>
      )}
    </div>
  );
}
