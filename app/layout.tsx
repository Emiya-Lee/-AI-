import type { Metadata } from 'next';
import './globals.css';
import Sidebar from '@/components/Sidebar';

export const metadata: Metadata = {
  title: '人效分析',
  description: '销量分析与能力缺陷追踪工具',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh">
      <body className="bg-bg text-text-primary">
        <div className="flex min-h-screen">
          <Sidebar />
          <main className="flex-1 p-6 overflow-auto max-w-[1400px] mx-auto">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
