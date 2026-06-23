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
    conditions.push('(st.region = ? OR s.region_code = ?)');
    params.push(region, region);
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

    const headers = rawData[0].map((h: any) => String(h || '').trim());

    // Unified column index: try real-report header names, fall back to legacy names
    const colIndex: Record<string, number> = {};

    // Key: internal field name → [preferred header, fallback header...]
    const fieldMappings: [string, string[]][] = [
      ['sale_date',     ['销售日期']],
      ['sales_name',    ['业务员']],
      ['model',         ['型号']],
      ['quantity',      ['零售量']],
      ['unit_price',    ['单价']],
      ['amount',        ['金额']],
      ['product_line',  ['产品线']],
      ['specs',         ['规格']],
      ['color',         ['颜色']],
      ['store_name',    ['门店名称', '门店']],
      ['store_code',    ['门店编码']],
      ['region_code',   ['大区']],
      ['sub_region',    ['战区']],
      ['function_category',  ['功能']],
      ['product_positioning', ['产品定位']],
      ['order_no',      ['零售订单号']],
      ['order_type',    ['订单类型']],
      ['document_status', ['单据状态']],
      ['customer_name', ['客户名称']],
      ['customer_source', ['顾客来源']],
      ['channel_level1', ['一级渠道']],
      ['channel_level2', ['二级渠道']],
      ['channel_level3', ['三级渠道']],
      ['reporter_name', ['上报人员']],
      ['report_platform', ['上报来源平台']],
      ['data_source',   ['数据来源']],
      ['agent_name',    ['代理商名称']],
      ['customer_relation_agent', ['客户关系代理名称']],
      ['customer_address', ['客户区域']],        // legacy
      ['purchase_preference', ['购买偏好']],     // legacy
      ['repurchase_potential', ['复购潜力']],    // legacy
      ['customer_price_range', ['价位段']],      // legacy
    ];

    for (const [key, headerNames] of fieldMappings) {
      colIndex[key] = -1;
      for (const h of headerNames) {
        const idx = headers.indexOf(h);
        if (idx !== -1) { colIndex[key] = idx; break; }
      }
    }

    if (colIndex['sale_date'] === -1 || colIndex['sales_name'] === -1 || colIndex['model'] === -1 || colIndex['amount'] === -1) {
      return NextResponse.json({ error: '必要的列（销售日期/业务员/型号/金额）未找到，请检查表头' }, { status: 400 });
    }

    // Preload stores by both name and code
    const storeByName: Record<string, any> = {};
    const storeByCode: Record<string, any> = {};
    const allStores = db.prepare('SELECT id, name, store_code FROM stores').all() as any[];
    for (const s of allStores) {
      storeByName[s.name] = s;
      if (s.store_code) storeByCode[s.store_code] = s;
    }

    // For auto-creating stores mid-import
    const getOrCreateStore = (name: string, code: string, region: string): number | null => {
      if (!name && !code) return null;
      // Lookup by name first, then code
      if (name && storeByName[name]) return storeByName[name].id;
      if (code && storeByCode[code]) return storeByCode[code].id;

      // Auto-create
      const ins = db.prepare(`
        INSERT INTO stores (name, store_code, region, city, store_type)
        VALUES (?, ?, ?, '', '商场专柜')
      `).run(name || code, code, region || '');
      const newId = ins.lastInsertRowid as number;
      storeByName[name || code] = { id: newId, name: name || code, store_code: code };
      if (code) storeByCode[code] = { id: newId, name: name || code };
      return newId;
    };

    let imported = 0, skipped = 0, errors = 0;

    const insert = db.prepare(`
      INSERT INTO sales (
        sale_date, sales_name, model, store_id, model_id, quantity, unit_price, amount,
        product_line, specs, color,
        customer_address, purchase_preference, repurchase_potential, customer_price_range,
        order_no, store_code, customer_name, function_category, product_positioning,
        region_code, sub_region, channel_level1, channel_level2, channel_level3,
        reporter_name, customer_source, order_type, document_status,
        report_platform, data_source, agent_name, customer_relation_agent
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const checkDuplicate = db.prepare(`
      SELECT id FROM sales WHERE order_no = ? AND sale_date = ? AND sales_name = ? AND model = ? AND amount = ? LIMIT 1
    `);

    const rows = rawData;
    const insertMany = db.transaction((allRows: any[][]) => {
      for (let i = 1; i < allRows.length; i++) {
        const row = allRows[i];
        const take = (key: string, fallback = '') => {
          const idx = colIndex[key];
          return idx !== undefined && idx !== -1 ? String(row[idx] || '').trim() : fallback;
        };
        const takeNum = (key: string, fallback = 0) => {
          const idx = colIndex[key];
          if (idx !== undefined && idx !== -1) {
            const v = parseFloat(row[idx]);
            return isNaN(v) ? fallback : v;
          }
          return fallback;
        };
        try {
          const sale_date = take('sale_date').substring(0, 10);
          const sales_name = take('sales_name');
          const model = take('model');
          const quantity = takeNum('quantity', 1);
          const unit_price = takeNum('unit_price');
          const amount = takeNum('amount');
          const product_line = take('product_line');
          const specs = take('specs');
          const color = take('color');

          // Real report fields
          const order_no = take('order_no');
          const storeCode = take('store_code');
          const storeName = take('store_name');
          const region_code = take('region_code');
          const sub_region = take('sub_region');
          const function_category = take('function_category');
          const product_positioning = take('product_positioning');
          const customer_name = take('customer_name');
          const customer_source = take('customer_source');
          const channel_level1 = take('channel_level1');
          const channel_level2 = take('channel_level2');
          const channel_level3 = take('channel_level3');
          const reporter_name = take('reporter_name');
          const order_type = take('order_type');
          const document_status = take('document_status');
          const report_platform = take('report_platform');
          const data_source = take('data_source');
          const agent_name = take('agent_name');
          const customer_relation_agent = take('customer_relation_agent');

          // Legacy fields
          const customer_address = take('customer_address');
          const purchase_preference = take('purchase_preference');
          const repurchase_potential = take('repurchase_potential');
          const customer_price_range = take('customer_price_range');

          if (!sale_date || !sales_name || !model) { errors++; continue; }

          // Dedup: order_no is primary key for real reports
          if (order_no) {
            const exists = db.prepare('SELECT id FROM sales WHERE order_no = ? LIMIT 1').get(order_no);
            if (exists) { skipped++; continue; }
          } else {
            const exists = checkDuplicate.get(order_no, sale_date, sales_name, model, amount);
            if (exists) { skipped++; continue; }
          }

          // Resolve or create store
          const store_id = getOrCreateStore(storeName, storeCode, region_code);

          // Resolve or create model
          let modelId: number | null = null;
          const modelRow = db.prepare('SELECT id FROM models WHERE name = ?').get(model) as any;
          if (!modelRow) {
            const ins = db.prepare('INSERT INTO models (name, display_name, specs, price_segment) VALUES (?, ?, ?, ?)')
              .run(model, model, specs || '', mapPriceSegment(product_positioning));
            modelId = ins.lastInsertRowid as number;
          } else {
            modelId = modelRow.id;
          }

          insert.run(
            sale_date, sales_name, model, store_id, modelId, quantity, unit_price, amount,
            product_line, specs, color,
            customer_address, purchase_preference, repurchase_potential, customer_price_range,
            order_no, storeCode, customer_name, function_category, product_positioning,
            region_code, sub_region, channel_level1, channel_level2, channel_level3,
            reporter_name, customer_source, order_type, document_status,
            report_platform, data_source, agent_name, customer_relation_agent
          );
          imported++;
        } catch (e: any) {
          console.error('[Import] Row error:', e.message);
          errors++;
        }
      }
    });

    insertMany(rawData);

    return NextResponse.json({ imported, skipped, errors, total: rawData.length - 1 });
  } catch (e: any) {
    console.error('[Import] Fatal error:', e);
    return NextResponse.json({ error: e.message || '导入失败' }, { status: 500 });
  }
}

// Map product positioning code to price segment
function mapPriceSegment(code: string): string {
  const map: Record<string, string> = { 'X': '高端', 'A': '旗舰', 'B': '中高端', 'C': '中端', 'D': '入门' };
  return map[code] || '中端';
}

export async function DELETE() {
  const db = await getDb();
  db.prepare('DELETE FROM sales').run();
  return NextResponse.json({ message: '销量数据已清空' });
}
