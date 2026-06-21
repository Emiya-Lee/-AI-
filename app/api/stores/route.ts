import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const region = searchParams.get('region');
  const id = searchParams.get('id');

  const db = await getDb();

  if (id) {
    const row = db.prepare('SELECT * FROM stores WHERE id = ?').get(id);
    return NextResponse.json(row || null);
  }

  let rows: any[];
  if (region) {
    rows = db.prepare('SELECT * FROM stores WHERE region = ? ORDER BY name').all(region);
  } else {
    rows = db.prepare('SELECT * FROM stores ORDER BY region, name').all();
  }

  return NextResponse.json({ data: rows, total: rows.length });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const db = await getDb();

    const { name, address, region, city, store_type, manager } = body;

    if (!name || !region) {
      return NextResponse.json({ error: '门店名称和区域必填' }, { status: 400 });
    }

    const result = db.prepare(`
      INSERT INTO stores (name, address, region, city, store_type, manager)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(name, address || '', region, city || '', store_type || '直营', manager || '');

    return NextResponse.json({ id: result.lastInsertRowid, message: '门店已添加' });
  } catch (e: any) {
    if (e.message && e.message.includes('UNIQUE')) {
      return NextResponse.json({ error: '门店名称已存在' }, { status: 409 });
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
      UPDATE stores SET name = ?, address = ?, region = ?, city = ?, store_type = ?, manager = ? WHERE id = ?
    `).run(
      body.name, body.address || '', body.region, body.city || '',
      body.store_type || '直营', body.manager || '', parseInt(id)
    );

    return NextResponse.json({ message: '门店已更新' });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: '缺少 id' }, { status: 400 });

  const db = await getDb();
  db.prepare('DELETE FROM stores WHERE id = ?').run(parseInt(id));
  return NextResponse.json({ message: '门店已删除' });
}
