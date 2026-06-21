import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');

  const db = await getDb();

  if (id) {
    const row = db.prepare('SELECT * FROM capability_records WHERE id = ?').get(id);
    return NextResponse.json(row || null);
  }

  const rows = db.prepare('SELECT * FROM capability_records ORDER BY record_date DESC').all();
  return NextResponse.json({ data: rows, total: rows.length });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const db = await getDb();

    const {
      sales_name, store_id, region, model, communication_duration, model_explanation_duration,
      customer_interest_level, customer_concerns,
      sales_explained, customer_understood, price_negotiation_count,
      price_negotiation_result, weakness_category, weakness_desc, record_date
    } = body;

    if (!sales_name || !record_date) {
      return NextResponse.json({ error: '销代姓名和日期必填' }, { status: 400 });
    }

    // Resolve region from store if not provided
    let finalRegion = region || '';
    if (!finalRegion && store_id) {
      const store = db.prepare('SELECT region FROM stores WHERE id = ?').get(store_id) as any;
      if (store) finalRegion = store.region;
    }

    const result = db.prepare(`
      INSERT INTO capability_records
        (sales_name, store_id, region, model, communication_duration, model_explanation_duration,
         customer_interest_level, customer_concerns, sales_explained,
         customer_understood, price_negotiation_count, price_negotiation_result,
         weakness_category, weakness_desc, record_date)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      sales_name,
      store_id || null,
      finalRegion,
      model || '',
      communication_duration || 0,
      model_explanation_duration || 0,
      customer_interest_level || '中',
      JSON.stringify(customer_concerns || []),
      JSON.stringify(sales_explained || []),
      customer_understood || '',
      price_negotiation_count || 0,
      price_negotiation_result || '',
      weakness_category || '',
      weakness_desc || '',
      record_date
    );

    return NextResponse.json({ id: result.lastInsertRowid, message: '记录已保存' });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: '缺少 id' }, { status: 400 });

    const body = await req.json();
    const db = await getDb();

    db.prepare(`
      UPDATE capability_records SET
        sales_name = ?, store_id = ?, region = ?, model = ?,
        communication_duration = ?, model_explanation_duration = ?,
        customer_interest_level = ?, customer_concerns = ?,
        sales_explained = ?, customer_understood = ?,
        price_negotiation_count = ?, price_negotiation_result = ?,
        weakness_category = ?, weakness_desc = ?, record_date = ?
      WHERE id = ?
    `).run(
      body.sales_name, body.store_id || null, body.region || '', body.model || '',
      body.communication_duration || 0, body.model_explanation_duration || 0,
      body.customer_interest_level || '中', JSON.stringify(body.customer_concerns || []),
      JSON.stringify(body.sales_explained || []), body.customer_understood || '',
      body.price_negotiation_count || 0, body.price_negotiation_result || '',
      body.weakness_category || '', body.weakness_desc || '',
      body.record_date, parseInt(id)
    );

    return NextResponse.json({ message: '更新成功' });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: '缺少 id' }, { status: 400 });

  const db = await getDb();
  db.prepare('DELETE FROM capability_records WHERE id = ?').run(parseInt(id));
  return NextResponse.json({ message: '删除成功' });
}
