import initSqlJs, { Database as SqlJsDatabase, SqlJsStatic } from 'sql.js';
import path from 'path';
import fs from 'fs';

const DB_PATH = path.join(process.cwd(), 'data', 'renxiao.db');

let SQL: SqlJsStatic | null = null;
let dbInstance: DbWrapper | null = null;
let initPromise: Promise<DbWrapper> | null = null;

// ── Compatibility wrapper around sql.js ──

class Statement {
  private sqlDb: SqlJsDatabase;
  private sql: string;
  private onAfterWrite?: () => void;

  constructor(sqlDb: SqlJsDatabase, sql: string, onAfterWrite?: () => void) {
    this.sqlDb = sqlDb;
    this.sql = sql;
    this.onAfterWrite = onAfterWrite;
  }

  all(...params: any[]): any[] {
    try {
      const stmt = this.sqlDb.prepare(this.sql);
      if (params.length > 0) stmt.bind(params.flat());
      const results: any[] = [];
      while (stmt.step()) {
        results.push(stmt.getAsObject());
      }
      stmt.free();
      return results;
    } catch (e: any) {
      console.error('[DB] all() error:', e.message, 'SQL:', this.sql);
      throw e;
    }
  }

  get(...params: any[]): any {
    try {
      const stmt = this.sqlDb.prepare(this.sql);
      if (params.length > 0) stmt.bind(params.flat());
      let result: any = undefined;
      if (stmt.step()) {
        result = stmt.getAsObject();
      }
      stmt.free();
      return result;
    } catch (e: any) {
      console.error('[DB] get() error:', e.message, 'SQL:', this.sql);
      throw e;
    }
  }

  run(...params: any[]): { lastInsertRowid: number; changes: number } {
    try {
      const flatParams = params.length > 0 ? params.flat() : [];
      this.sqlDb.run(this.sql, flatParams);
      const lastInsertRowid = this.lastInsertId();
      const changes = this.sqlDb.getRowsModified();
      this.onAfterWrite?.();
      return { lastInsertRowid, changes };
    } catch (e: any) {
      console.error('[DB] run() error:', e.message, 'SQL:', this.sql);
      throw e;
    }
  }

  private lastInsertId(): number {
    try {
      const r = this.sqlDb.exec('SELECT last_insert_rowid()');
      if (r.length > 0 && r[0].values.length > 0) {
        return r[0].values[0][0] as number;
      }
    } catch { /* ignore */ }
    return 0;
  }
}

class DbWrapper {
  private sqlDb: SqlJsDatabase;
  private dbDir: string;
  private dbPath: string;
  private inTransaction = false;

  constructor(sqlDb: SqlJsDatabase, dbDir: string, dbPath: string) {
    this.sqlDb = sqlDb;
    this.dbDir = dbDir;
    this.dbPath = dbPath;
  }

  prepare(sql: string): Statement {
    return new Statement(this.sqlDb, sql, () => {
      if (!this.inTransaction) this.saveToDisk();
    });
  }

  exec(sql: string): void {
    this.sqlDb.exec(sql);
    if (!this.inTransaction) this.saveToDisk();
  }

  transaction<T extends any[]>(fn: (...args: T) => void) {
    return (...args: T) => {
      this.inTransaction = true;
      this.sqlDb.run('BEGIN');
      try {
        fn(...args);
        this.sqlDb.run('COMMIT');
        this.inTransaction = false;
        this.saveToDisk();
      } catch (e) {
        this.sqlDb.run('ROLLBACK');
        this.inTransaction = false;
        throw e;
      }
    };
  }

  saveToDisk(): void {
    try {
      if (!fs.existsSync(this.dbDir)) {
        fs.mkdirSync(this.dbDir, { recursive: true });
      }
      const data = this.sqlDb.export();
      const buffer = Buffer.from(data);
      fs.writeFileSync(this.dbPath, buffer);
    } catch (e: any) {
      console.error('[DB] Failed to save database:', e.message);
    }
  }

  get rawDb(): SqlJsDatabase {
    return this.sqlDb;
  }
}

// ── Init ──

async function initDb(): Promise<DbWrapper> {
  const sqlJsDist = path.join(process.cwd(), 'node_modules', 'sql.js', 'dist');
  SQL = await initSqlJs({
    locateFile: (file: string) => path.join(sqlJsDist, file),
  });

  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  let sqlDb: SqlJsDatabase;

  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    sqlDb = new SQL.Database(buffer);
  } else {
    sqlDb = new SQL.Database();
  }

  const wrapper = new DbWrapper(sqlDb, dir, DB_PATH);

  // Initialize schema (idempotent — handles migration)
  initSchema(wrapper);

  // Seed initial data if empty
  seedData(wrapper);

  return wrapper;
}

// ── Schema initialization (with migration) ──

function ensureColumn(wrapper: DbWrapper, table: string, col: string, definition: string) {
  const cols = wrapper.prepare(`PRAGMA table_info(${table})`).all() as any[];
  if (!cols.find((c: any) => c.name === col)) {
    wrapper.rawDb.run(`ALTER TABLE ${table} ADD COLUMN ${col} ${definition}`);
    console.log(`[DB] Migrated: added ${table}.${col}`);
  }
}

function initSchema(wrapper: DbWrapper) {
  // New tables
  wrapper.rawDb.run(`
    CREATE TABLE IF NOT EXISTS stores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      address TEXT,
      region TEXT NOT NULL,
      city TEXT,
      store_type TEXT DEFAULT '直营',
      manager TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  wrapper.rawDb.run(`
    CREATE TABLE IF NOT EXISTS models (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      display_name TEXT,
      product_line TEXT,
      specs TEXT,
      price_segment TEXT DEFAULT '中端',
      category TEXT DEFAULT '智屏',
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  wrapper.rawDb.run(`
    CREATE TABLE IF NOT EXISTS weakness_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      sort_order INTEGER DEFAULT 0
    )
  `);

  // Existing tables (may already exist from prior version)
  wrapper.rawDb.run(`
    CREATE TABLE IF NOT EXISTS sales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sale_date TEXT NOT NULL,
      sales_name TEXT NOT NULL,
      model TEXT NOT NULL,
      quantity INTEGER DEFAULT 1,
      unit_price REAL,
      amount REAL NOT NULL,
      product_line TEXT,
      specs TEXT,
      color TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  wrapper.rawDb.run(`
    CREATE TABLE IF NOT EXISTS capability_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sales_name TEXT NOT NULL,
      communication_duration INTEGER,
      customer_concerns TEXT,
      sales_explained TEXT,
      customer_understood TEXT,
      price_negotiation_count INTEGER DEFAULT 0,
      price_negotiation_result TEXT,
      weakness_desc TEXT,
      record_date TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Migrate: add new columns to sales (safe if they already exist)
  ensureColumn(wrapper, 'sales', 'store_id', 'INTEGER REFERENCES stores(id)');
  ensureColumn(wrapper, 'sales', 'model_id', 'INTEGER REFERENCES models(id)');
  ensureColumn(wrapper, 'sales', 'customer_address', "TEXT DEFAULT ''");
  ensureColumn(wrapper, 'sales', 'purchase_preference', "TEXT DEFAULT ''");
  ensureColumn(wrapper, 'sales', 'repurchase_potential', "TEXT DEFAULT ''");
  ensureColumn(wrapper, 'sales', 'customer_price_range', "TEXT DEFAULT ''");

  // Migrate: add new columns to capability_records
  ensureColumn(wrapper, 'capability_records', 'store_id', 'INTEGER REFERENCES stores(id)');
  ensureColumn(wrapper, 'capability_records', 'region', "TEXT DEFAULT ''");
  ensureColumn(wrapper, 'capability_records', 'model', "TEXT NOT NULL DEFAULT ''");
  ensureColumn(wrapper, 'capability_records', 'model_explanation_duration', 'INTEGER DEFAULT 0');
  ensureColumn(wrapper, 'capability_records', 'customer_interest_level', "TEXT DEFAULT '中'");
  ensureColumn(wrapper, 'capability_records', 'weakness_category', "TEXT DEFAULT ''");

  wrapper.saveToDisk();
}

// ── Seed data ──

function seedStores(wrapper: DbWrapper) {
  const cnt = (wrapper.prepare('SELECT COUNT(*) as c FROM stores').get() as any).c;
  if (cnt > 0) return;

  const insert = wrapper.prepare(`
    INSERT INTO stores (name, address, region, city, store_type, manager)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const stores = [
    ['深圳华强北旗舰店', '深圳市福田区华强北路1001号', '华南', '深圳', '直营', '陈经理'],
    ['广州天河城专柜', '广州市天河区天河路208号', '华南', '广州', '商场专柜', '李经理'],
    ['上海南京路体验店', '上海市黄浦区南京东路300号', '华东', '上海', '直营', '王经理'],
    ['北京朝阳大悦城店', '北京市朝阳区朝阳北路101号', '华北', '北京', '商场专柜', '赵经理'],
    ['成都春熙路加盟店', '成都市锦江区春熙路88号', '西南', '成都', '加盟', null],
  ];

  for (const s of stores) insert.run(...s);
  wrapper.saveToDisk();
}

function seedModels(wrapper: DbWrapper) {
  const cnt = (wrapper.prepare('SELECT COUNT(*) as c FROM models').get() as any).c;
  if (cnt > 0) return;

  const insert = wrapper.prepare(`
    INSERT INTO models (name, display_name, product_line, specs, price_segment, category)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const models = [
    ['75Z11L', 'TCL 75Z11L 智屏', 'TCL_智屏产品线', '75吋', '中端', '智屏'],
    ['75X11L', 'TCL 75X11L 旗舰智屏', 'TCL_智屏产品线', '75吋', '高端', '智屏'],
    ['85T7L', 'TCL 85T7L 巨幕智屏', 'TCL_智屏产品线', '85吋', '中端', '智屏'],
    ['98Q10L', 'TCL 98Q10L 旗舰巨幕', 'TCL_智屏产品线', '98吋', '旗舰', '智屏'],
    ['65Q10L', 'TCL 65Q10L 高端智屏', 'TCL_智屏产品线', '65吋', '高端', '智屏'],
  ];

  for (const m of models) insert.run(...m);
  wrapper.saveToDisk();
}

function seedWeaknessCategories(wrapper: DbWrapper) {
  const cnt = (wrapper.prepare('SELECT COUNT(*) as c FROM weakness_categories').get() as any).c;
  if (cnt > 0) return;

  const insert = wrapper.prepare('INSERT INTO weakness_categories (name, sort_order) VALUES (?, ?)');
  const cats = [
    ['产品知识不足', 1],
    ['讲解思路不清', 2],
    ['讲解不够清晰落地', 3],
    ['价格拉扯不充分', 4],
    ['其他', 5],
  ];
  for (const c of cats) insert.run(...c);
  wrapper.saveToDisk();
}

function seedSales(wrapper: DbWrapper) {
  const cnt = (wrapper.prepare('SELECT COUNT(*) as c FROM sales').get() as any).c;
  if (cnt > 0) return;

  const insert = wrapper.prepare(`
    INSERT INTO sales (sale_date, sales_name, model, store_id, quantity, unit_price, amount, product_line, specs, color, customer_address, purchase_preference, repurchase_potential, customer_price_range)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const sales = [
    // Store 1: 深圳华强北旗舰店 (华南)
    ['2026-05-03', '康希凌', '75Z11L', 1, 1, 10999, 10999, 'TCL_智屏产品线', '75吋', '枪色', '深圳·南山·科技园', '对性价比敏感，多次对比竞品', '中', '1万-1.5万'],
    ['2026-05-07', '康希凌', '75X11L', 1, 1, 19999, 19999, 'TCL_智屏产品线', '75吋', '摩卡色', '深圳·福田·香蜜湖', '追求品质，认可旗舰定位', '高', '1.5万-2.5万'],
    ['2026-05-12', '黄家珍', '85T7L', 1, 2, 12999, 25998, 'TCL_智屏产品线', '85吋', '黑色', '深圳·宝安·西乡', '家庭用户，需求大屏', '中', '1万-1.5万'],
    ['2026-05-20', '张三', '98Q10L', 1, 1, 39999, 39999, 'TCL_智屏产品线', '98吋', '灰色', '深圳·南山·前海', '高端客户，注重品牌和体验', '高', '3万以上'],
    // Store 2: 广州天河城专柜 (华南)
    ['2026-05-15', '黄家珍', '75Z11L', 2, 1, 10999, 10999, 'TCL_智屏产品线', '75吋', '枪色', '广州·天河·体育中心', '初次购机，预算有限', '低', '1万以下'],
    ['2026-06-10', '黄家珍', '85T7L', 2, 1, 12999, 12999, 'TCL_智屏产品线', '85吋', '黑色', '广州·越秀·北京路', '老客户介绍，信任度高', '高', '1万-1.5万'],
    ['2026-06-18', '张三', '98Q10L', 2, 1, 39999, 39999, 'TCL_智屏产品线', '98吋', '灰色', '广州·天河·珠江新城', '新居装修，追求旗舰体验', '高', '3万以上'],
    // Store 3: 上海南京路体验店 (华东)
    ['2026-06-01', '康希凌', '75X11L', 3, 2, 19999, 39998, 'TCL_智屏产品线', '75吋', '摩卡色', '上海·浦东·陆家嘴', '品质导向，对比索尼', '中', '1.5万-2.5万'],
    ['2026-06-05', '康希凌', '75Z11L', 3, 1, 10999, 10999, 'TCL_智屏产品线', '75吋', '枪色', '上海·徐汇·漕河泾', '租赁房配置，实用为主', '低', '1万-1.5万'],
    ['2026-06-19', '康希凌', '65Q10L', 3, 1, 8999, 8999, 'TCL_智屏产品线', '65吋', '银色', '上海·静安·南京西路', '单身公寓，小户型', '中', '8千-1万'],
    // Store 4: 北京朝阳大悦城店 (华北)
    ['2026-06-14', '黄家珍', '75Z11L', 4, 1, 10999, 10999, 'TCL_智屏产品线', '75吋', '枪色', '北京·朝阳·望京', '理性消费者，重视参数对比', '中', '1万-1.5万'],
    ['2026-06-20', '张三', '85T7L', 4, 1, 12999, 12999, 'TCL_智屏产品线', '85吋', '黑色', '北京·海淀·中关村', '家庭成员共用，看着舒服就行', '中', '1万-1.5万'],
    // Store 5: 成都春熙路加盟店 (西南)
    ['2026-06-15', '康希凌', '75X11L', 5, 1, 19999, 19999, 'TCL_智屏产品线', '75吋', '摩卡色', '成都·锦江·春熙路', '对新品牌有兴趣，愿意尝试', '中', '1.5万-2.5万'],
    ['2026-06-17', '张三', '75Z11L', 5, 1, 10999, 10999, 'TCL_智屏产品线', '75吋', '枪色', '成都·成华·建设路', '预算明确，不轻易加价', '低', '1万-1.5万'],
    // Extra: more cross-store records to flesh out data
    ['2026-06-08', '黄家珍', '65Q10L', 3, 1, 8999, 8999, 'TCL_智屏产品线', '65吋', '银色', '上海·长宁·天山', '年轻人首台智屏', '中', '8千-1万'],
    ['2026-06-12', '张三', '75X11L', 4, 1, 19999, 19999, 'TCL_智屏产品线', '75吋', '摩卡色', '北京·通州·梨园', '装修升级，比较看重画质', '高', '1.5万-2.5万'],
    ['2026-06-16', '康希凌', '98Q10L', 5, 1, 39999, 39999, 'TCL_智屏产品线', '98吋', '灰色', '成都·武侯·桐梓林', '豪宅配置，价格不敏感', '高', '3万以上'],
    ['2026-06-21', '黄家珍', '65Q10L', 1, 1, 8999, 8999, 'TCL_智屏产品线', '65吋', '银色', '深圳·龙华·民治', '刚需紧凑户型', '低', '8千-1万'],
    ['2026-06-22', '康希凌', '85T7L', 2, 1, 12999, 12999, 'TCL_智屏产品线', '85吋', '黑色', '广州·海珠·江南大道', '看中大屏性价比', '中', '1万-1.5万'],
  ];

  for (const s of sales) insert.run(...s);

  // Link model_id
  wrapper.rawDb.run(`UPDATE sales SET model_id = (SELECT id FROM models WHERE models.name = sales.model) WHERE model_id IS NULL`);
}

function seedCapability(wrapper: DbWrapper) {
  const cnt = (wrapper.prepare('SELECT COUNT(*) as c FROM capability_records').get() as any).c;
  if (cnt > 0) return;

  const insert = wrapper.prepare(`
    INSERT INTO capability_records
      (sales_name, store_id, region, model, communication_duration, model_explanation_duration,
       customer_interest_level, customer_concerns, sales_explained, customer_understood,
       price_negotiation_count, price_negotiation_result, weakness_category, weakness_desc, record_date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const caps = [
    // Record 1: 康希凌 at 深圳 -> 75Z11L, product knowledge gap
    ['康希凌', 1, '华南', '75Z11L', 25, 12, '中',
      '["价格","售后"]', '["质量","品牌"]',
      '顾客更关注价格是否还有优惠，对质量理解不深',
      3, '成交', '产品知识不足', '讲解太专业，顾客听不懂，建议用更通俗语言', '2026-06-15'],

    // Record 2: 黄家珍 at 深圳 -> 85T7L, good explanation but negotiation issue
    ['黄家珍', 1, '华南', '85T7L', 40, 20, '高',
      '["质量","品牌"]', '["质量","售后","品牌"]',
      '顾客完全理解了产品优势，并主动询问售后',
      1, '成交', '价格拉扯不充分', '顾客多次比价，讲解点到位但未主动做价格对比', '2026-06-16'],

    // Record 3: 张三 at 深圳 -> 75Z11L, pure price negotiation failure
    ['张三', 1, '华南', '75Z11L', 15, 8, '低',
      '["价格"]', '["价格"]',
      '顾客只关心价格，对其他卖点完全不感兴趣',
      5, '未成交', '价格拉扯不充分', '只讲价格不会讲价值，价格让步空间也没了', '2026-06-17'],

    // Record 4: 康希凌 at 广州 -> 75X11L, after-sales policy unclear
    ['康希凌', 2, '华南', '75X11L', 30, 18, '中',
      '["售后","品牌"]', '["售后","品牌","质量"]',
      '顾客对品牌认可度高，但担心安装服务',
      2, '成交', '讲解不够清晰落地', '对售后政策讲解不够细致，安装问题没答上来', '2026-06-18'],

    // Record 5: 黄家珍 at 广州 -> 75Z11L, didn't close the deal
    ['黄家珍', 2, '华南', '75Z11L', 20, 10, '中',
      '["价格","质量"]', '["价格","质量"]',
      '顾客听懂了主要卖点，但表示再考虑',
      2, '未成交', '讲解思路不清', '讲解到位但没逼单，顾客说再看看就放走了', '2026-06-19'],

    // Record 6: 张三 at 上海 -> 75Z11L, competing with online prices
    ['张三', 3, '华东', '75Z11L', 35, 15, '中',
      '["价格","功能"]', '["功能","价格"]',
      '顾客在网上查过价，对功能很了解但纠结价格',
      4, '成交', '价格拉扯不充分', '线上价格对比压力大，让价太多利润被压缩', '2026-06-10'],

    // Record 7: 康希凌 at 北京 -> 85T7L, explanation not landing
    ['康希凌', 4, '华北', '85T7L', 28, 14, '低',
      '["尺寸","功能"]', '["尺寸","功能","品牌"]',
      '顾客觉得85吋太大，对客厅尺寸有顾虑',
      1, '未成交', '讲解不够清晰落地', '没演示好不同观看距离的效果，顾客犹豫走了', '2026-06-20'],

    // Record 8: 黄家珍 at 成都 -> 75Z11L, regional bestseller she struggled with
    ['黄家珍', 5, '西南', '75Z11L', 22, 11, '中',
      '["品牌","售后"]', '["品牌"]',
      '顾客是第一次听这个品牌，信任度不够',
      2, '未成交', '产品知识不足', '对品牌历史和技术优势不熟悉，没能建立信任感', '2026-06-14'],

    // Record 9: 张三 at 成都 -> 65Q10L, too technical
    ['张三', 5, '西南', '65Q10L', 18, 10, '低',
      '["价格"]', '["功能","质量","品牌"]',
      '顾客只想知道比55吋好在哪，但被一堆参数弄晕了',
      1, '未成交', '讲解思路不清', '讲了很多但没抓住顾客实际需求，跑偏到技术参数', '2026-06-21'],

    // Record 10: 康希凌 at 上海 -> 75X11L, good all-round
    ['康希凌', 3, '华东', '75X11L', 32, 16, '高',
      '["质量","功能","售后"]', '["质量","功能","售后","品牌"]',
      '顾客主动提到了朋友推荐，对品牌接受度好',
      2, '成交', '其他', '整体表现优秀，后来顾客又介绍了新客户', '2026-06-08'],
  ];

  for (const c of caps) insert.run(...c);
}

function seedData(wrapper: DbWrapper) {
  seedStores(wrapper);
  seedModels(wrapper);
  seedWeaknessCategories(wrapper);
  seedSales(wrapper);
  seedCapability(wrapper);
  wrapper.saveToDisk();
  console.log('[DB] 初始化数据已写入');
}

// ── Public API ──

export async function getDb(): Promise<DbWrapper> {
  if (dbInstance) return dbInstance;
  if (!initPromise) {
    initPromise = initDb();
  }
  dbInstance = await initPromise;
  return dbInstance;
}

export type { DbWrapper };
