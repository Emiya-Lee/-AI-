import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET() {
  const db = await getDb();
  const rows = db.prepare('SELECT DISTINCT region FROM stores ORDER BY region').all() as any[];
  const regions = rows.map((r: any) => r.region);
  return NextResponse.json({ regions });
}
