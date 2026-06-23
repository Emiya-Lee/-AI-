import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

// GET — 查询考试结果，支持 ?sales_name= 筛选
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const salesName = searchParams.get('sales_name');

  const db = await getDb();

  let rows: any[];
  if (salesName) {
    rows = db.prepare('SELECT * FROM exam_results WHERE sales_name = ? ORDER BY start_time DESC').all(salesName);
  } else {
    rows = db.prepare('SELECT * FROM exam_results ORDER BY start_time DESC').all();
  }

  // 汇总统计
  const summary = db.prepare(`
    SELECT sales_name,
           COUNT(*) as total_attempts,
           MAX(score) as highest_score,
           ROUND(AVG(score), 1) as avg_score,
           SUM(CASE WHEN exam_result = '已通过' THEN 1 ELSE 0 END) as pass_count,
           SUM(CASE WHEN exam_result = '未通过' THEN 1 ELSE 0 END) as fail_count
    FROM exam_results
    GROUP BY sales_name
    ORDER BY avg_score DESC
  `).all();

  return NextResponse.json({ data: rows, total: rows.length, summary });
}

// POST — 新增一条考试记录 (JSON body)
export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get('content-type') || '';

    // FormData = Excel 导入
    if (contentType.includes('multipart/form-data')) {
      return handleExcelImport(req);
    }

    // JSON body = 手动新增
    const body = await req.json();
    const db = await getDb();

    const {
      sales_name, account, position, exam_result, score, max_score,
      attempt_number, exam_duration, start_time,
      dim_size_recommend, dim_explosive_advantages, dim_sbar_demo,
      dim_rgb_mini_led, dim_screen_crush, dim_params_crush, dim_color_crush,
      org_path,
    } = body;

    if (!sales_name) {
      return NextResponse.json({ error: '销代姓名必填' }, { status: 400 });
    }

    const result = db.prepare(`
      INSERT INTO exam_results (
        sales_name, account, position, exam_result, score, max_score, attempt_number,
        exam_duration, start_time,
        dim_size_recommend, dim_explosive_advantages, dim_sbar_demo,
        dim_rgb_mini_led, dim_screen_crush, dim_params_crush, dim_color_crush,
        org_path
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      sales_name, account || '', position || '', exam_result || '',
      score || 0, max_score || 100, attempt_number || 1,
      exam_duration || '', start_time || '',
      dim_size_recommend || 0, dim_explosive_advantages || 0, dim_sbar_demo || 0,
      dim_rgb_mini_led || 0, dim_screen_crush || 0, dim_params_crush || 0, dim_color_crush || 0,
      org_path || '',
    );

    return NextResponse.json({ id: result.lastInsertRowid, message: '考试记录已添加' });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// DELETE — 删除考试记录
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: '缺少 id' }, { status: 400 });

  const db = await getDb();
  db.prepare('DELETE FROM exam_results WHERE id = ?').run(parseInt(id));
  return NextResponse.json({ message: '考试记录已删除' });
}

// ── Excel 导入 ──

async function handleExcelImport(req: NextRequest) {
  try {
    const db = await getDb();
    const formData = await req.formData();
    const file = formData.get('file') as File;

    if (!file) return NextResponse.json({ error: '没有上传文件' }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const XLSX = require('xlsx');
    const workbook = XLSX.read(buffer, { type: 'buffer' });

    // 优先读取 演练明细，fallback 演练统计
    const sheetName = workbook.SheetNames.includes('演练明细') ? '演练明细' : workbook.SheetNames[0];
    const rawData = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 }) as any[][];

    if (rawData.length < 2) {
      return NextResponse.json({ error: '文件数据为空' }, { status: 400 });
    }

    const headers = rawData[0].map((h: any) => String(h || '').trim());

    // 检测表头类型：演练明细 有 尺寸探寻与推荐得分 列，演练统计 没有
    const isDetail = headers.some((h: string) => h.includes('尺寸探寻'));

    const insert = db.prepare(`
      INSERT INTO exam_results (
        sales_name, account, position, exam_result, score, max_score, attempt_number,
        exam_duration, start_time,
        dim_size_recommend, dim_explosive_advantages, dim_sbar_demo,
        dim_rgb_mini_led, dim_screen_crush, dim_params_crush, dim_color_crush,
        org_path
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    let imported = 0, skipped = 0;

    const importAll = db.transaction((rows: any[][]) => {
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        const take = (idx: number, fallback = '') => String(row[idx] || '').trim();
        const takeNum = (idx: number) => { const v = parseFloat(row[idx]); return isNaN(v) ? 0 : v; };

        const sales_name = take(0);
        if (!sales_name) { skipped++; continue; }

        if (isDetail) {
          // 演练明细: 0:姓名 1:账号 2:演练结果 3:分数 4:开始时间 5:演练时长
          // 6-12: 7维得分 13-21: 九级组织
          const orgParts: string[] = [];
          for (let j = 13; j <= 21 && j < row.length; j++) {
            const p = take(j); if (p) orgParts.push(p);
          }

          insert.run(
            sales_name, take(1), '', take(2),
            takeNum(3), 100, 1, take(5), take(4),
            takeNum(6), takeNum(7), takeNum(8),
            takeNum(9), takeNum(10), takeNum(11), takeNum(12),
            orgParts.join('/'),
          );
        } else {
          // 演练统计: 0:姓名 1:账号 2:岗位名称 3:演练结果 4:最高分 5:演练次数
          // 6-14: 九级组织
          const orgParts: string[] = [];
          for (let j = 6; j <= 14 && j < row.length; j++) {
            const p = take(j); if (p) orgParts.push(p);
          }

          insert.run(
            sales_name, take(1), take(2), take(3),
            takeNum(4), 100, takeNum(5) || 1, '', '',
            0, 0, 0, 0, 0, 0, 0,
            orgParts.join('/'),
          );
        }
        imported++;
      }
    });

    importAll(rawData);

    return NextResponse.json({ imported, skipped, total: rawData.length - 1 });
  } catch (e: any) {
    console.error('[Import] Fatal error:', e);
    return NextResponse.json({ error: e.message || '导入失败' }, { status: 500 });
  }
}
