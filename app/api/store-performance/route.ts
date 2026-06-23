import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

// GET — 查询所有门店绩效（自动从 sales 表聚合销量），支持 ?store_id= 筛选
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const storeId = searchParams.get('store_id');

  const db = await getDb();

  // 从 sales 表自动聚合每个门店的销量数据
  const salesAgg = db.prepare(`
    SELECT
      s.store_id,
      st.name as store_name,
      st.region, st.city, st.store_type, st.channel,
      SUM(s.amount) as auto_sales_amount,
      SUM(s.quantity) as auto_sales_quantity,
      COUNT(DISTINCT s.sales_name) as sales_rep_count,
      MAX(s.sale_date) as last_sale_date
    FROM sales s
    LEFT JOIN stores st ON s.store_id = st.id
    WHERE s.store_id IS NOT NULL
    ${storeId ? 'AND s.store_id = ?' : ''}
    GROUP BY s.store_id
    ORDER BY auto_sales_amount DESC
  `).all(...(storeId ? [storeId] : [])) as any[];

  // 如果有 store_id 筛选但没销量数据，返回空
  if (storeId && salesAgg.length === 0) {
    return NextResponse.json({ data: [], total: 0 });
  }

  const storeIds = salesAgg.map(r => r.store_id);

  // 加载对应的 store_performance 记录
  let spRows: any[] = [];
  if (storeIds.length > 0) {
    const placeholders = storeIds.map(() => '?').join(',');
    spRows = db.prepare(`
      SELECT * FROM store_performance WHERE store_id IN (${placeholders})
    `).all(...storeIds);
  }
  const spMap: Record<number, any> = {};
  for (const sp of spRows) {
    spMap[sp.store_id] = sp;
  }

  // 竞品销量汇总
  let competitorAgg: any[] = [];
  if (storeIds.length > 0) {
    const placeholders = storeIds.map(() => '?').join(',');
    competitorAgg = db.prepare(`
      SELECT store_id,
             COUNT(*) as competitor_count,
             SUM(sales_quantity) as competitor_total_qty,
             SUM(sales_amount) as competitor_total_amount
      FROM competitor_sales
      WHERE store_id IN (${placeholders})
      GROUP BY store_id
    `).all(...storeIds) as any[];
  }
  const compMap: Record<number, any> = {};
  for (const c of competitorAgg) {
    compMap[c.store_id] = c;
  }

  // 合并：以 sales 聚合为主，合并 store_performance 和竞品数据
  const enriched = salesAgg.map(sa => {
    const sp = spMap[sa.store_id] || {};
    const autoAmount = sa.auto_sales_amount || 0;
    const autoQty = sa.auto_sales_quantity || 0;

    return {
      store_id: sa.store_id,
      store_name: sa.store_name || '未知',
      region: sa.region || '',
      city: sa.city || '',
      store_type: sa.store_type || '',
      channel: sa.channel || '',

      // 销量：优先自动计算，手动值作为 override（如有 store_performance 且手动值 > 自动值）
      our_total_sales: sp.our_total_sales && sp.our_total_sales > autoAmount ? sp.our_total_sales : autoAmount,
      our_total_quantity: sp.our_total_quantity && sp.our_total_quantity > autoQty ? sp.our_total_quantity : autoQty,
      auto_sales_amount: autoAmount,
      auto_sales_quantity: autoQty,

      // 结构机型 / 品类数据（仅手动维护）
      structural_model_count: sp.structural_model_count || 0,
      category_total_count: sp.category_total_count || 0,
      structural_ratio: (sp.category_total_count || 0) > 0
        ? Math.round(((sp.structural_model_count || 0) / sp.category_total_count) * 100)
        : 0,

      // 店效系数
      store_efficiency_score: sp.store_efficiency_score || 0,

      // 其他
      period: sp.period || '',
      sales_rep_count: sa.sales_rep_count || 0,
      last_sale_date: sa.last_sale_date || '',

      // 竞品汇总
      competitor_summary: compMap[sa.store_id] || { competitor_count: 0, competitor_total_qty: 0, competitor_total_amount: 0 },
    };
  });

  return NextResponse.json({ data: enriched, total: enriched.length });
}

// POST — 新增/更新门店绩效（upsert by store_id）。销售额/销量自动从 sales 表计算。
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const db = await getDb();

    const {
      store_id, period,
      structural_model_count, category_total_count,
    } = body;

    if (!store_id) {
      return NextResponse.json({ error: '门店必选' }, { status: 400 });
    }

    // 自动从 sales 表获取该门店的销量
    const salesAgg = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as auto_sales_amount,
             COALESCE(SUM(quantity), 0) as auto_sales_quantity
      FROM sales WHERE store_id = ?
    `).get(store_id) as any;
    const our_total_sales = salesAgg.auto_sales_amount || 0;
    const our_total_quantity = salesAgg.auto_sales_quantity || 0;

    // 计算店效综合系数
    const structuralRatio = category_total_count > 0 ? structural_model_count / category_total_count : 0;

    // 计算区域竞争系数（门店销量 / 区域总销量）
    const totalRegionSales = db.prepare(`
      SELECT COALESCE(SUM(s.amount), 0) as total
      FROM sales s
      JOIN stores st ON s.store_id = st.id
      WHERE st.region = (SELECT region FROM stores WHERE id = ?)
      AND s.store_id != ?
    `).get(store_id, store_id) as any;

    const regionTotal = totalRegionSales.total + our_total_sales;
    const regionRatio = regionTotal > 0 ? our_total_sales / regionTotal : 0;

    // 成交率（取该门店关联销代的成交率）
    const storeDealRate = db.prepare(`
      SELECT COALESCE(
        ROUND(
          CAST(SUM(CASE WHEN cr.price_negotiation_result = '成交' THEN 1 ELSE 0 END) AS REAL) /
          NULLIF(COUNT(*), 0), 4
        ), 0
      ) as rate
      FROM capability_records cr
      WHERE cr.store_id = ?
    `).get(store_id) as any;

    const dealRate = storeDealRate?.rate || 0;

    const efficiencyScore = Math.round(dealRate * structuralRatio * regionRatio * 10000) / 100;

    // Upsert
    const existing = db.prepare('SELECT id FROM store_performance WHERE store_id = ?').get(store_id) as any;

    if (existing) {
      db.prepare(`
        UPDATE store_performance
        SET period = ?, our_total_sales = ?, our_total_quantity = ?,
            structural_model_count = ?, category_total_count = ?,
            store_efficiency_score = ?, updated_at = datetime('now')
        WHERE store_id = ?
      `).run(
        period || '', our_total_sales, our_total_quantity,
        structural_model_count || 0, category_total_count || 0,
        efficiencyScore, store_id,
      );
      return NextResponse.json({ id: existing.id, message: '门店绩效已更新', efficiencyScore });
    }

    const result = db.prepare(`
      INSERT INTO store_performance (
        store_id, period, our_total_sales, our_total_quantity,
        structural_model_count, category_total_count, store_efficiency_score
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      store_id, period || '', our_total_sales, our_total_quantity,
      structural_model_count || 0, category_total_count || 0,
      efficiencyScore,
    );

    return NextResponse.json({ id: result.lastInsertRowid, message: '门店绩效已添加', efficiencyScore });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
