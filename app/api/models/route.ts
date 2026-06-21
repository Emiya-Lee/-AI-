import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(req: NextRequest) {
  const db = await getDb();
  const rows = db.prepare('SELECT * FROM models ORDER BY price_segment, name').all();
  return NextResponse.json({ data: rows, total: rows.length });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const db = await getDb();

    const { name, display_name, product_line, specs, price_segment, category } = body;

    if (!name) {
      return NextResponse.json({ error: '机型名称必填' }, { status: 400 });
    }

    const result = db.prepare(`
      INSERT INTO models (name, display_name, product_line, specs, price_segment, category)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(name, display_name || '', product_line || '', specs || '', price_segment || '中端', category || '智屏');

    return NextResponse.json({ id: result.lastInsertRowid, message: '机型已添加' });
  } catch (e: any) {
    if (e.message && e.message.includes('UNIQUE')) {
      return NextResponse.json({ error: '机型名称已存在' }, { status: 409 });
    }
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
      UPDATE models SET name = ?, display_name = ?, product_line = ?, specs = ?, price_segment = ?, category = ? WHERE id = ?
    `).run(
      body.name, body.display_name || '', body.product_line || '',
      body.specs || '', body.price_segment || '中端', body.category || '智屏', parseInt(id)
    );

    return NextResponse.json({ message: '机型已更新' });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: '缺少 id' }, { status: 400 });

  const db = await getDb();
  db.prepare('DELETE FROM models WHERE id = ?').run(parseInt(id));
  return NextResponse.json({ message: '机型已删除' });
}
