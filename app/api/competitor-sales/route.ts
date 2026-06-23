import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

// GET — 查询竞品销量，支持 ?store_id= 筛选
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const storeId = searchParams.get('store_id');

  const db = await getDb();

  let rows: any[];
  if (storeId) {
    rows = db.prepare(`
      SELECT cs.*, st.name as store_name
      FROM competitor_sales cs
      LEFT JOIN stores st ON cs.store_id = st.id
      WHERE cs.store_id = ?
      ORDER BY cs.competitor_name, cs.created_at DESC
    `).all(storeId);
  } else {
    rows = db.prepare(`
      SELECT cs.*, st.name as store_name
      FROM competitor_sales cs
      LEFT JOIN stores st ON cs.store_id = st.id
      ORDER BY st.name, cs.competitor_name
    `).all();
  }

  return NextResponse.json({ data: rows, total: rows.length });
}

// POST — 新增一条竞品销量记录
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const db = await getDb();

    const {
      store_id, competitor_name, competitor_brand, model_name,
      sales_amount, sales_quantity, period, notes,
    } = body;

    if (!store_id || !competitor_brand) {
      return NextResponse.json({ error: '门店和竞品品牌必填' }, { status: 400 });
    }

    const result = db.prepare(`
      INSERT INTO competitor_sales (
        store_id, competitor_name, competitor_brand, model_name,
        sales_amount, sales_quantity, period, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      store_id,
      competitor_brand,  // competitor_name 兼容为 brand
      competitor_brand || '',
      model_name || '',
      sales_amount || 0,
      sales_quantity || 0,
      period || '',
      notes || '',
    );

    return NextResponse.json({ id: result.lastInsertRowid, message: '竞品销量已添加' });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// DELETE — 删除竞品销量记录
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: '缺少 id' }, { status: 400 });

  const db = await getDb();
  db.prepare('DELETE FROM competitor_sales WHERE id = ?').run(parseInt(id));
  return NextResponse.json({ message: '竞品销量已删除' });
}
