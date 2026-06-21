import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET() {
  const db = await getDb();

  const byRegion = db.prepare(`
    SELECT st.region,
           SUM(s.amount) as amount,
           SUM(s.quantity) as quantity,
           COUNT(DISTINCT s.store_id) as storeCount,
           COUNT(DISTINCT s.sales_name) as salesCount
    FROM sales s
    LEFT JOIN stores st ON s.store_id = st.id
    GROUP BY st.region
    ORDER BY amount DESC
  `).all();

  const byStoreType = db.prepare(`
    SELECT st.store_type,
           SUM(s.amount) as amount,
           SUM(s.quantity) as quantity
    FROM sales s
    LEFT JOIN stores st ON s.store_id = st.id
    GROUP BY st.store_type
    ORDER BY amount DESC
  `).all();

  const regionModelShare = db.prepare(`
    SELECT st.region, s.model, SUM(s.amount) as amount
    FROM sales s
    LEFT JOIN stores st ON s.store_id = st.id
    GROUP BY st.region, s.model
    ORDER BY st.region, amount DESC
  `).all();

  return NextResponse.json({ byRegion, byStoreType, regionModelShare });
}
