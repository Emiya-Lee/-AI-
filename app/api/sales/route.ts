import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const month = searchParams.get('month');
  const region = searchParams.get('region');
  const storeId = searchParams.get('store_id');

  const db = await getDb();
  let rows: any[];

  let sql = 'SELECT s.*, st.name as store_name, st.region as store_region FROM sales s LEFT JOIN stores st ON s.store_id = st.id';
  const conditions: string[] = [];
  const params: any[] = [];

  if (month) {
    conditions.push('s.sale_date LIKE ?');
    params.push(`${month}%`);
  }
  if (region) {
    conditions.push('st.region = ?');
    params.push(region);
  }
  if (storeId) {
    conditions.push('s.store_id = ?');
    params.push(storeId);
  }

  if (conditions.length > 0) {
    sql += ' WHERE ' + conditions.join(' AND ');
  }

  sql += ' ORDER BY s.sale_date DESC';

  if (params.length > 0) {
    rows = db.prepare(sql).all(...params);
  } else {
    rows = db.prepare(sql).all();
  }

  return NextResponse.json({ data: rows, total: rows.length });
}

export async function POST(req: NextRequest) {
  try {
    const db = await getDb();
    const formData = await req.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: '没有上传文件' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const XLSX = require('xlsx');
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const rawData = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 }) as any[][];

    if (rawData.length < 2) {
      return NextResponse.json({ error: '文件数据为空' }, { status: 400 });
    }

    const headers = rawData[0].map((h: any) => String(h).trim());

    const colIndex: Record<string, number> = {};
    const targetCols = ['销售日期', '业务员', '门店', '型号', '零售量', '单价', '金额', '产品线', '规格', '颜色', '客户区域', '购买偏好', '复购潜力', '价位段'];
    for (const col of targetCols) {
      colIndex[col] = headers.indexOf(col);
    }

    if (colIndex['销售日期'] === -1 || colIndex['业务员'] === -1 || colIndex['型号'] === -1 || colIndex['金额'] === -1) {
      return NextResponse.json({ error: '必要的列（销售日期/业务员/型号/金额）未找到，请检查表头' }, { status: 400 });
    }

    // Preload store name -> id map
    const storeMap: Record<string, number> = {};
    const allStores = db.prepare('SELECT id, name FROM stores').all() as any[];
    for (const s of allStores) {
      storeMap[s.name] = s.id;
    }

    let imported = 0, skipped = 0, errors = 0;

    const insert = db.prepare(`
      INSERT INTO sales (sale_date, sales_name, model, store_id, model_id, quantity, unit_price, amount, product_line, specs, color, customer_address, purchase_preference, repurchase_potential, customer_price_range)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const checkDuplicate = db.prepare(`
      SELECT id FROM sales WHERE sale_date = ? AND sales_name = ? AND model = ? AND amount = ? LIMIT 1
    `);

    const insertMany = db.transaction((rows: any[][]) => {
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        try {
          const sale_date = String(row[colIndex['销售日期']] || '').substring(0, 10);
          const sales_name = String(row[colIndex['业务员']] || '').trim();
          const model = String(row[colIndex['型号']] || '').trim();
          const storeName = colIndex['门店'] !== -1 ? String(row[colIndex['门店']] || '').trim() : '';
          const quantity = parseInt(row[colIndex['零售量']]) || 1;
          const unit_price = parseFloat(row[colIndex['单价']]) || 0;
          const amount = parseFloat(row[colIndex['金额']]) || 0;
          const product_line = colIndex['产品线'] !== -1 ? String(row[colIndex['产品线']] || '') : '';
          const specs = colIndex['规格'] !== -1 ? String(row[colIndex['规格']] || '') : '';
          const color = colIndex['颜色'] !== -1 ? String(row[colIndex['颜色']] || '') : '';
          const customer_address = colIndex['客户区域'] !== -1 ? String(row[colIndex['客户区域']] || '') : '';
          const purchase_preference = colIndex['购买偏好'] !== -1 ? String(row[colIndex['购买偏好']] || '') : '';
          const repurchase_potential = colIndex['复购潜力'] !== -1 ? String(row[colIndex['复购潜力']] || '') : '';
          const customer_price_range = colIndex['价位段'] !== -1 ? String(row[colIndex['价位段']] || '') : '';

          if (!sale_date || !sales_name || !model) { errors++; continue; }

          const exists = checkDuplicate.get(sale_date, sales_name, model, amount);
          if (exists) { skipped++; continue; }

          // Resolve store_id from name
          const store_id = storeName && storeMap[storeName] ? storeMap[storeName] : null;

          // Resolve model_id
          let modelId: number | null = null;
          const modelRow = db.prepare('SELECT id FROM models WHERE name = ?').get(model) as any;
          if (!modelRow) {
            // Auto-create the model if not found
            const ins = db.prepare('INSERT INTO models (name) VALUES (?)').run(model);
            modelId = ins.lastInsertRowid as number;
          } else {
            modelId = modelRow.id;
          }

          insert.run(sale_date, sales_name, model, store_id, modelId, quantity, unit_price, amount, product_line, specs, color, customer_address, purchase_preference, repurchase_potential, customer_price_range);
          imported++;
        } catch {
          errors++;
        }
      }
    });

    insertMany(rawData);

    return NextResponse.json({ imported, skipped, errors, total: rawData.length - 1 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || '导入失败' }, { status: 500 });
  }
}

export async function DELETE() {
  const db = await getDb();
  db.prepare('DELETE FROM sales').run();
  return NextResponse.json({ message: '销量数据已清空' });
}
