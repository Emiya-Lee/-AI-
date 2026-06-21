'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const nav = [
  { href: '/', label: '🏠 首页仪表盘' },
  { href: '/stores', label: '🏪 门店管理' },
  { href: '/sales', label: '📈 销量分析' },
  { href: '/capability', label: '🎯 能力缺陷' },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-60 min-h-screen bg-surface border-r border-border flex flex-col p-4 shrink-0">
      <div className="text-xl font-bold text-primary mb-8">📊 人效分析</div>
      <nav className="flex flex-col gap-2 flex-1">
        {nav.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`px-4 py-3 rounded-lg text-sm font-medium transition-all ${
                active
                  ? 'bg-primary/20 text-primary border border-primary/30'
                  : 'text-text-secondary hover:bg-white/5 hover:text-text-primary'
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="text-xs text-text-secondary mt-4 pt-4 border-t border-border">
        v2.0.0 · 人效分析
      </div>
    </aside>
  );
}
