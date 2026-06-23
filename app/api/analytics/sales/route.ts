import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const month = searchParams.get('month');
  const region = searchParams.get('region');
  const storeId = searchParams.get('store_id');

  const db = await getDb();

  // Build WHERE clauses
  const salesWhere: string[] = [];
  const salesParams: any[] = [];
  const capWhere: string[] = [];
  const capParams: any[] = [];

  if (month) {
    salesWhere.push('s.sale_date LIKE ?');
    salesParams.push(`${month}%`);
    capWhere.push('cr.record_date LIKE ?');
    capParams.push(`${month}%`);
  }
  if (region) {
    salesWhere.push("(st.region = ? OR s.region_code = ?)");
    salesParams.push(region, region);
  }
  if (storeId) {
    salesWhere.push('s.store_id = ?');
    salesParams.push(storeId);
  }

  const salesWhereClause = salesWhere.length > 0 ? 'WHERE ' + salesWhere.join(' AND ') : '';
  const capWhereClause = capWhere.length > 0 ? 'WHERE ' + capWhere.join(' AND ') : '';

  // KPI
  const total = db.prepare(`
    SELECT SUM(s.amount) as v, SUM(s.quantity) as q, COUNT(DISTINCT s.sales_name) as n
    FROM sales s LEFT JOIN stores st ON s.store_id = st.id
    ${salesWhereClause}
  `).get(...salesParams) as any;

  const dealRateRow = db.prepare(`
    SELECT COUNT(*) as c FROM capability_records cr
    WHERE cr.price_negotiation_result = '成交'
    ${capWhere.length > 0 ? 'AND ' + capWhere.join(' AND ') : ''}
  `).get(...capParams) as any;

  const totalCap = db.prepare(`
    SELECT COUNT(*) as c FROM capability_records cr
    ${capWhereClause}
  `).get(...capParams) as any;

  const storeCount = db.prepare(`
    SELECT COUNT(DISTINCT s.store_id) as n
    FROM sales s LEFT JOIN stores st ON s.store_id = st.id
    ${salesWhereClause}
  `).get(...salesParams) as any;

  // Monthly trend (last 6 months)
  const monthly = db.prepare(`
    SELECT strftime('%Y-%m', s.sale_date) as month,
           SUM(s.amount) as amount,
           SUM(s.quantity) as quantity
    FROM sales s LEFT JOIN stores st ON s.store_id = st.id
    ${salesWhereClause}
    GROUP BY month
    ORDER BY month DESC
    LIMIT 6
  `).all(...salesParams).reverse();

  // Model share
  const modelShare = db.prepare(`
    SELECT s.model, SUM(s.amount) as amount, SUM(s.quantity) as quantity,
           m.price_segment
    FROM sales s
    LEFT JOIN models m ON s.model = m.name
    ${salesWhereClause ? salesWhereClause.replace(/s\./g, 's.') : ''}
    GROUP BY s.model
    ORDER BY amount DESC
  `).all(...salesParams);

  // Sales rep rank
  const salesRank = db.prepare(`
    SELECT s.sales_name, SUM(s.amount) as amount, SUM(s.quantity) as quantity
    FROM sales s LEFT JOIN stores st ON s.store_id = st.id
    ${salesWhereClause}
    GROUP BY s.sales_name
    ORDER BY amount DESC
  `).all(...salesParams);

  // Regional sales (use store region or sales.region_code fallback)
  const regionalSales = db.prepare(`
    SELECT COALESCE(st.region, s.region_code, '未知') as region,
           SUM(s.amount) as amount, SUM(s.quantity) as quantity,
           COUNT(DISTINCT s.store_id) as store_count
    FROM sales s LEFT JOIN stores st ON s.store_id = st.id
    ${salesWhereClause}
    GROUP BY region
    ORDER BY amount DESC
  `).all(...salesParams);

  // Store type breakdown
  const storeTypeSales = db.prepare(`
    SELECT st.store_type, SUM(s.amount) as amount, SUM(s.quantity) as quantity
    FROM sales s LEFT JOIN stores st ON s.store_id = st.id
    ${salesWhereClause}
    GROUP BY st.store_type
    ORDER BY amount DESC
  `).all(...salesParams);

  // Price segment share
  const priceSegmentShare = db.prepare(`
    SELECT m.price_segment, SUM(s.amount) as amount, SUM(s.quantity) as quantity
    FROM sales s
    LEFT JOIN models m ON s.model = m.name
    ${salesWhereClause}
    GROUP BY m.price_segment
    ORDER BY amount DESC
  `).all(...salesParams);

  // Customer profiling
  const repurchaseDistribution = db.prepare(`
    SELECT repurchase_potential, COUNT(*) as count
    FROM sales s LEFT JOIN stores st ON s.store_id = st.id
    WHERE repurchase_potential != ''
    ${salesWhereClause ? 'AND ' + salesWhere.join(' AND ') : ''}
    GROUP BY repurchase_potential
  `).all(...salesParams);

  const repurchaseObj: Record<string, number> = { '高': 0, '中': 0, '低': 0 };
  for (const r of repurchaseDistribution) {
    repurchaseObj[r.repurchase_potential] = r.count;
  }

  // Top customer addresses
  const topAddresses = db.prepare(`
    SELECT customer_address, COUNT(*) as count
    FROM sales
    WHERE customer_address != ''
    GROUP BY customer_address
    ORDER BY count DESC
    LIMIT 5
  `).all();

  // ── 人效离散度 (std deviation of per-rep deal rates from capability records) ──
  const repDealRates = db.prepare(`
    SELECT sales_name,
           COUNT(*) as total,
           SUM(CASE WHEN price_negotiation_result = '成交' THEN 1 ELSE 0 END) as deals
    FROM capability_records
    GROUP BY sales_name
    HAVING total >= 2
  `).all() as any[];

  let stdDeviation = 0;
  let meanDealRate = 0;
  if (repDealRates.length >= 2) {
    const rates = repDealRates.map(r => Math.round((r.deals / r.total) * 100));
    meanDealRate = Math.round(rates.reduce((s, v) => s + v, 0) / rates.length);
    const variance = rates.reduce((s, v) => s + Math.pow(v - meanDealRate, 2), 0) / rates.length;
    stdDeviation = Math.round(Math.sqrt(variance) * 10) / 10;
  }

  return NextResponse.json({
    kpi: {
      totalAmount: total?.v || 0,
      totalQuantity: total?.q || 0,
      salesCount: total?.n || 0,
      storeCount: storeCount?.n || 0,
      dealRate: totalCap?.c > 0 ? Math.round((dealRateRow?.c / totalCap?.c) * 100) : 0,
      stdDeviation,
      meanDealRate,
      repCount: repDealRates.length,
    },
    monthly,
    modelShare,
    salesRank,
    regionalSales,
    storeTypeSales,
    priceSegmentShare,
    customerProfiling: {
      repurchaseDistribution: repurchaseObj,
      topAddresses,
    },
  });
}
