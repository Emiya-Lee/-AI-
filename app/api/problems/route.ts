import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');
  const id = searchParams.get('id');

  const db = await getDb();

  if (id) {
    const row = db.prepare('SELECT * FROM problem_submissions WHERE id = ?').get(parseInt(id));
    return NextResponse.json(row || null);
  }

  let sql = 'SELECT * FROM problem_submissions';
  const params: any[] = [];
  if (status) {
    sql += ' WHERE status = ?';
    params.push(status);
  }
  sql += ' ORDER BY CASE urgency WHEN \'紧急\' THEN 0 WHEN \'普通\' THEN 1 ELSE 2 END, submitted_at DESC';

  const rows = params.length > 0
    ? db.prepare(sql).all(...params)
    : db.prepare(sql).all();

  return NextResponse.json({ data: rows, total: rows.length });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const db = await getDb();

    const { sales_name, problem_type, urgency, description } = body;

    if (!sales_name || !problem_type || !description) {
      return NextResponse.json({ error: '销代姓名、问题类型和描述必填' }, { status: 400 });
    }

    const result = db.prepare(`
      INSERT INTO problem_submissions (sales_name, problem_type, urgency, description)
      VALUES (?, ?, ?, ?)
    `).run(sales_name, problem_type, urgency || '普通', description);

    return NextResponse.json({ id: result.lastInsertRowid, message: '问题已提交' });
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

    const existing = db.prepare('SELECT * FROM problem_submissions WHERE id = ?').get(parseInt(id)) as any;
    if (!existing) return NextResponse.json({ error: '问题记录不存在' }, { status: 404 });

    const status = body.status ?? existing.status;
    const resolution = body.resolution ?? existing.resolution;
    const resolved_at = status === '已解决' && existing.status !== '已解决'
      ? "datetime('now')"
      : existing.resolved_at;

    db.prepare(`
      UPDATE problem_submissions SET
        status = ?, resolution = ?, resolved_at = ${resolved_at}
      WHERE id = ?
    `).run(status, resolution, parseInt(id));

    return NextResponse.json({ message: '问题已更新' });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: '缺少 id' }, { status: 400 });

  const db = await getDb();
  db.prepare('DELETE FROM problem_submissions WHERE id = ?').run(parseInt(id));
  return NextResponse.json({ message: '问题已删除' });
}
