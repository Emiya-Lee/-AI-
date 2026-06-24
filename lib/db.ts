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
      store_code TEXT DEFAULT '',
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

  // New: standard explanation points per model (for coverage rate calc)
  wrapper.rawDb.run(`
    CREATE TABLE IF NOT EXISTS standard_explanation_points (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      model_id INTEGER REFERENCES models(id),
      point TEXT NOT NULL,
      category TEXT NOT NULL,
      required INTEGER DEFAULT 1
    )
  `);

  // New: problem type dictionary (SOP §4.2)
  wrapper.rawDb.run(`
    CREATE TABLE IF NOT EXISTS problem_types (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      sort_order INTEGER DEFAULT 0
    )
  `);

  // New: problem submissions (SOP §2.3)
  wrapper.rawDb.run(`
    CREATE TABLE IF NOT EXISTS problem_submissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sales_name TEXT NOT NULL,
      problem_type TEXT NOT NULL,
      urgency TEXT DEFAULT '普通',
      description TEXT NOT NULL,
      status TEXT DEFAULT '待处理',
      resolution TEXT DEFAULT '',
      submitted_at TEXT DEFAULT (datetime('now')),
      resolved_at TEXT
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

  // Real retail report columns (v2.2)
  ensureColumn(wrapper, 'sales', 'order_no', "TEXT DEFAULT ''");
  ensureColumn(wrapper, 'sales', 'store_code', "TEXT DEFAULT ''");
  ensureColumn(wrapper, 'sales', 'customer_name', "TEXT DEFAULT ''");
  ensureColumn(wrapper, 'sales', 'function_category', "TEXT DEFAULT ''");
  ensureColumn(wrapper, 'sales', 'product_positioning', "TEXT DEFAULT ''");
  ensureColumn(wrapper, 'sales', 'region_code', "TEXT DEFAULT ''");
  ensureColumn(wrapper, 'sales', 'sub_region', "TEXT DEFAULT ''");
  ensureColumn(wrapper, 'sales', 'channel_level1', "TEXT DEFAULT ''");
  ensureColumn(wrapper, 'sales', 'channel_level2', "TEXT DEFAULT ''");
  ensureColumn(wrapper, 'sales', 'channel_level3', "TEXT DEFAULT ''");
  ensureColumn(wrapper, 'sales', 'reporter_name', "TEXT DEFAULT ''");
  ensureColumn(wrapper, 'sales', 'customer_source', "TEXT DEFAULT ''");
  ensureColumn(wrapper, 'sales', 'order_type', "TEXT DEFAULT ''");
  ensureColumn(wrapper, 'sales', 'document_status', "TEXT DEFAULT ''");
  ensureColumn(wrapper, 'sales', 'report_platform', "TEXT DEFAULT ''");
  ensureColumn(wrapper, 'sales', 'data_source', "TEXT DEFAULT ''");
  ensureColumn(wrapper, 'sales', 'agent_name', "TEXT DEFAULT ''");
  ensureColumn(wrapper, 'sales', 'customer_relation_agent', "TEXT DEFAULT ''");

  // Migrate: add new columns to capability_records
  ensureColumn(wrapper, 'capability_records', 'store_id', 'INTEGER REFERENCES stores(id)');
  ensureColumn(wrapper, 'capability_records', 'region', "TEXT DEFAULT ''");
  ensureColumn(wrapper, 'capability_records', 'model', "TEXT NOT NULL DEFAULT ''");
  ensureColumn(wrapper, 'capability_records', 'model_explanation_duration', 'INTEGER DEFAULT 0');
  ensureColumn(wrapper, 'capability_records', 'customer_interest_level', "TEXT DEFAULT '中'");
  ensureColumn(wrapper, 'capability_records', 'weakness_category', "TEXT DEFAULT ''");

  // Store migration (v2.2)
  ensureColumn(wrapper, 'stores', 'store_code', "TEXT DEFAULT ''");

  // v2.3: 渠道替换区域
  ensureColumn(wrapper, 'stores', 'channel', "TEXT DEFAULT ''");

  // ── v2.3 新增表：录音合集（录音 AI 分析） ──
  wrapper.rawDb.run(`
    CREATE TABLE IF NOT EXISTS call_recordings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      sales_name TEXT DEFAULT '',
      store_name TEXT DEFAULT '',
      region TEXT DEFAULT '',
      transcription TEXT DEFAULT '',
      status TEXT DEFAULT 'pending',
      audio_duration INTEGER DEFAULT 0,
      explanation_coverage_rate REAL DEFAULT 0,
      deal_rate REAL DEFAULT 0,
      avg_interest_score REAL DEFAULT 0,
      deal_result TEXT DEFAULT '',
      weakness_analysis TEXT DEFAULT '',
      ai_summary TEXT DEFAULT '',
      scores TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // ── v2.4 新增表：知识库（提取的高频问答和卖点） ──
  wrapper.rawDb.run(`
    CREATE TABLE IF NOT EXISTS knowledge_base (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      keyword TEXT NOT NULL,
      keyword_type TEXT DEFAULT 'question',
      frequency INTEGER DEFAULT 1,
      deal_freq INTEGER DEFAULT 0,
      no_deal_freq INTEGER DEFAULT 0,
      region TEXT DEFAULT '',
      source_record_ids TEXT DEFAULT '[]',
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // ── v2.4 新增表：亮点与暗点分析 ──
  wrapper.rawDb.run(`
    CREATE TABLE IF NOT EXISTS insight_analysis (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      insight_type TEXT DEFAULT 'bright',
      keyword TEXT NOT NULL,
      description TEXT DEFAULT '',
      frequency INTEGER DEFAULT 0,
      deal_frequency INTEGER DEFAULT 0,
      no_deal_frequency INTEGER DEFAULT 0,
      region TEXT DEFAULT '',
      improvement TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // ── v2.4 新增表：区域基准（用于偏差校正） ──
  wrapper.rawDb.run(`
    CREATE TABLE IF NOT EXISTS region_baseline (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      region TEXT NOT NULL,
      avg_coverage_rate REAL DEFAULT 0,
      avg_close_rate REAL DEFAULT 0,
      question_count INTEGER DEFAULT 0,
      top_questions TEXT DEFAULT '[]',
      top_interests TEXT DEFAULT '[]',
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // ── v2.2 新增表：考试演练结果（维度二） ──
  wrapper.rawDb.run(`
    CREATE TABLE IF NOT EXISTS exam_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sales_name TEXT NOT NULL,
      account TEXT DEFAULT '',
      position TEXT DEFAULT '',
      exam_result TEXT DEFAULT '',
      score REAL DEFAULT 0,
      max_score REAL DEFAULT 100,
      attempt_number INTEGER DEFAULT 1,
      exam_duration TEXT DEFAULT '',
      start_time TEXT DEFAULT '',
      dim_size_recommend REAL DEFAULT 0,
      dim_explosive_advantages REAL DEFAULT 0,
      dim_sbar_demo REAL DEFAULT 0,
      dim_rgb_mini_led REAL DEFAULT 0,
      dim_screen_crush REAL DEFAULT 0,
      dim_params_crush REAL DEFAULT 0,
      dim_color_crush REAL DEFAULT 0,
      org_path TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // ── v2.2 新增表：门店绩效（店效） ──
  wrapper.rawDb.run(`
    CREATE TABLE IF NOT EXISTS store_performance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store_id INTEGER UNIQUE REFERENCES stores(id),
      period TEXT DEFAULT '',
      our_total_sales REAL DEFAULT 0,
      our_total_quantity INTEGER DEFAULT 0,
      structural_model_count INTEGER DEFAULT 0,
      category_total_count INTEGER DEFAULT 0,
      store_efficiency_score REAL DEFAULT 0,
      updated_at TEXT DEFAULT (datetime('now')),
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // ── v2.2 新增表：友商竞品销量（字段式多行添加） ──
  wrapper.rawDb.run(`
    CREATE TABLE IF NOT EXISTS competitor_sales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store_id INTEGER REFERENCES stores(id),
      competitor_name TEXT NOT NULL,
      competitor_brand TEXT DEFAULT '',
      model_name TEXT DEFAULT '',
      sales_amount REAL DEFAULT 0,
      sales_quantity INTEGER DEFAULT 0,
      period TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // ── 索引（加速常用查询） ──
  const indexes = [
    'CREATE INDEX IF NOT EXISTS idx_sales_sales_name ON sales(sales_name)',
    'CREATE INDEX IF NOT EXISTS idx_sales_model ON sales(model)',
    'CREATE INDEX IF NOT EXISTS idx_sales_sale_date ON sales(sale_date)',
    'CREATE INDEX IF NOT EXISTS idx_sales_store_id ON sales(store_id)',
    'CREATE INDEX IF NOT EXISTS idx_sales_region_code ON sales(region_code)',
    'CREATE INDEX IF NOT EXISTS idx_sales_store_region ON sales(store_id, region_code)',
    'CREATE INDEX IF NOT EXISTS idx_cap_sales_name ON capability_records(sales_name)',
    'CREATE INDEX IF NOT EXISTS idx_cap_model ON capability_records(model)',
    'CREATE INDEX IF NOT EXISTS idx_cap_record_date ON capability_records(record_date)',
    'CREATE INDEX IF NOT EXISTS idx_cap_store_id ON capability_records(store_id)',
    'CREATE INDEX IF NOT EXISTS idx_cap_result ON capability_records(price_negotiation_result)',
    'CREATE INDEX IF NOT EXISTS idx_exam_sales_name ON exam_results(sales_name)',
    'CREATE INDEX IF NOT EXISTS idx_call_status ON call_recordings(status)',
    'CREATE INDEX IF NOT EXISTS idx_competitor_store ON competitor_sales(store_id)',
    'CREATE INDEX IF NOT EXISTS idx_problem_status ON problem_submissions(status)',
  ];
  for (const idx of indexes) {
    wrapper.rawDb.run(idx);
  }

  wrapper.saveToDisk();
}

// ── Seed data ──

function seedStores(wrapper: DbWrapper) {
  const cnt = (wrapper.prepare('SELECT COUNT(*) as c FROM stores').get() as any).c;
  if (cnt > 0) return;

  const insert = wrapper.prepare(`
    INSERT INTO stores (name, store_code, address, region, city, store_type, manager, channel)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const stores = [
    ['深圳华强北旗舰店', '', '深圳市福田区华强北路1001号', '华南', '深圳', '直营', '康希凌', 'KA渠道'],
    ['广州天河城专柜', '', '广州市天河区天河路208号', '华南', '广州', '商场专柜', '黄家珍', 'KA渠道'],
    ['上海南京路体验店', '', '上海市黄浦区南京东路300号', '华东', '上海', '直营', '张三', 'KA渠道'],
    ['北京朝阳大悦城店', '', '北京市朝阳区朝阳北路101号', '华北', '北京', '商场专柜', '李四', '传统渠道'],
    ['成都春熙路加盟店', '', '成都市锦江区春熙路88号', '西南', '成都', '加盟', null, '传统渠道'],
  ];

  for (const s of stores) insert.run(...s);
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
}

function seedSales(wrapper: DbWrapper) {
  const cnt = (wrapper.prepare('SELECT COUNT(*) as c FROM sales').get() as any).c;
  if (cnt > 0) return;

  const insert = wrapper.prepare(`
    INSERT INTO sales (sale_date, sales_name, model, store_id, quantity, unit_price, amount, product_line, specs, color, customer_address, purchase_preference, repurchase_potential, customer_price_range, order_no, store_code, customer_name, function_category, product_positioning, region_code, sub_region, channel_level1, channel_level2, channel_level3, reporter_name, customer_source, order_type, document_status, report_platform, data_source, agent_name, customer_relation_agent)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const empty18 = ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''];
  const sales = [
    // Store 1: 深圳华强北旗舰店 (华南)
    ['2026-05-03', '康希凌', '75Z11L', 1, 1, 10999, 10999, 'TCL_智屏产品线', '75吋', '枪色', '深圳·南山·科技园', '对性价比敏感，多次对比竞品', '中', '1万-1.5万', ...empty18],
    ['2026-05-07', '康希凌', '75X11L', 1, 1, 19999, 19999, 'TCL_智屏产品线', '75吋', '摩卡色', '深圳·福田·香蜜湖', '追求品质，认可旗舰定位', '高', '1.5万-2.5万', ...empty18],
    ['2026-05-12', '黄家珍', '85T7L', 1, 2, 12999, 25998, 'TCL_智屏产品线', '85吋', '黑色', '深圳·宝安·西乡', '家庭用户，需求大屏', '中', '1万-1.5万', ...empty18],
    ['2026-05-20', '张三', '98Q10L', 1, 1, 39999, 39999, 'TCL_智屏产品线', '98吋', '灰色', '深圳·南山·前海', '高端客户，注重品牌和体验', '高', '3万以上', ...empty18],
    // Store 2: 广州天河城专柜 (华南)
    ['2026-05-15', '黄家珍', '75Z11L', 2, 1, 10999, 10999, 'TCL_智屏产品线', '75吋', '枪色', '广州·天河·体育中心', '初次购机，预算有限', '低', '1万以下', ...empty18],
    ['2026-06-10', '黄家珍', '85T7L', 2, 1, 12999, 12999, 'TCL_智屏产品线', '85吋', '黑色', '广州·越秀·北京路', '老客户介绍，信任度高', '高', '1万-1.5万', ...empty18],
    ['2026-06-18', '张三', '98Q10L', 2, 1, 39999, 39999, 'TCL_智屏产品线', '98吋', '灰色', '广州·天河·珠江新城', '新居装修，追求旗舰体验', '高', '3万以上', ...empty18],
    // Store 3: 上海南京路体验店 (华东)
    ['2026-06-01', '康希凌', '75X11L', 3, 2, 19999, 39998, 'TCL_智屏产品线', '75吋', '摩卡色', '上海·浦东·陆家嘴', '品质导向，对比索尼', '中', '1.5万-2.5万', ...empty18],
    ['2026-06-05', '康希凌', '75Z11L', 3, 1, 10999, 10999, 'TCL_智屏产品线', '75吋', '枪色', '上海·徐汇·漕河泾', '租赁房配置，实用为主', '低', '1万-1.5万', ...empty18],
    ['2026-06-19', '康希凌', '65Q10L', 3, 1, 8999, 8999, 'TCL_智屏产品线', '65吋', '银色', '上海·静安·南京西路', '单身公寓，小户型', '中', '8千-1万', ...empty18],
    // Store 4: 北京朝阳大悦城店 (华北)
    ['2026-06-14', '黄家珍', '75Z11L', 4, 1, 10999, 10999, 'TCL_智屏产品线', '75吋', '枪色', '北京·朝阳·望京', '理性消费者，重视参数对比', '中', '1万-1.5万', ...empty18],
    ['2026-06-20', '张三', '85T7L', 4, 1, 12999, 12999, 'TCL_智屏产品线', '85吋', '黑色', '北京·海淀·中关村', '家庭成员共用，看着舒服就行', '中', '1万-1.5万', ...empty18],
    // Store 5: 成都春熙路加盟店 (西南)
    ['2026-06-15', '康希凌', '75X11L', 5, 1, 19999, 19999, 'TCL_智屏产品线', '75吋', '摩卡色', '成都·锦江·春熙路', '对新品牌有兴趣，愿意尝试', '中', '1.5万-2.5万', ...empty18],
    ['2026-06-17', '张三', '75Z11L', 5, 1, 10999, 10999, 'TCL_智屏产品线', '75吋', '枪色', '成都·成华·建设路', '预算明确，不轻易加价', '低', '1万-1.5万', ...empty18],
    // Extra: more cross-store records to flesh out data
    ['2026-06-08', '黄家珍', '65Q10L', 3, 1, 8999, 8999, 'TCL_智屏产品线', '65吋', '银色', '上海·长宁·天山', '年轻人首台智屏', '中', '8千-1万', ...empty18],
    ['2026-06-12', '张三', '75X11L', 4, 1, 19999, 19999, 'TCL_智屏产品线', '75吋', '摩卡色', '北京·通州·梨园', '装修升级，比较看重画质', '高', '1.5万-2.5万', ...empty18],
    ['2026-06-16', '康希凌', '98Q10L', 5, 1, 39999, 39999, 'TCL_智屏产品线', '98吋', '灰色', '成都·武侯·桐梓林', '豪宅配置，价格不敏感', '高', '3万以上', ...empty18],
    ['2026-06-21', '黄家珍', '65Q10L', 1, 1, 8999, 8999, 'TCL_智屏产品线', '65吋', '银色', '深圳·龙华·民治', '刚需紧凑户型', '低', '8千-1万', ...empty18],
    ['2026-06-22', '康希凌', '85T7L', 2, 1, 12999, 12999, 'TCL_智屏产品线', '85吋', '黑色', '广州·海珠·江南大道', '看中大屏性价比', '中', '1万-1.5万', ...empty18],
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

function seedStandardExplanationPoints(wrapper: DbWrapper) {
  const cnt = (wrapper.prepare('SELECT COUNT(*) as c FROM standard_explanation_points').get() as any).c;
  if (cnt > 0) return;

  // Each model has 4-6 standard explanation points across 6 dimensions
  const modelPoints: Record<string, string[]> = {
    '75Z11L':  ['品牌历史与技术实力', 'SQD画质技术演示', '同价位竞品对比', '售后政策与服务网点', '价格构成与促销优惠', '尺寸/安装适配建议'],
    '75X11L': ['旗舰系列定位', 'SQD+分区背光技术', '索尼/三星竞品对比', '安装服务与延保', '品质溢价论证', '回音壁生态联动'],
    '85T7L':  ['巨幕品类的优势', '大屏观看距离说明', '与75吋/98吋的定位区隔', '家庭场景演示', '价格谈判策略', '售后安装一站式'],
    '98Q10L': ['旗舰身份象征', '98吋独有技术参数', '高端客户心理把握', '定制化安装方案', '竞品绝对优势分析', '长期客户维护'],
    '65Q10L': ['小户型适配方案', '高端技术下沉卖点', '年轻客群沟通策略', '与55/75吋差价逻辑', '首次购机信任建立', '售后保障打消顾虑'],
  };

  const insert = wrapper.prepare(`
    INSERT INTO standard_explanation_points (model_id, point, category, required)
    VALUES (?, ?, ?, ?)
  `);

  const allModels = wrapper.prepare('SELECT id, name FROM models').all() as any[];
  for (const m of allModels) {
    const points = modelPoints[m.name] || [];
    for (let i = 0; i < points.length; i++) {
      const catIdx = i < 2 ? '核心' : i < 4 ? '进阶' : '高阶';
      insert.run(m.id, points[i], catIdx, 1);
    }
  }
}

function seedProblemTypes(wrapper: DbWrapper) {
  const cnt = (wrapper.prepare('SELECT COUNT(*) as c FROM problem_types').get() as any).c;
  if (cnt > 0) return;

  const insert = wrapper.prepare('INSERT INTO problem_types (name, sort_order) VALUES (?, ?)');
  const types = [
    ['产品知识不足', 1],
    ['话术技巧欠缺', 2],
    ['竞品不知如何应对', 3],
    ['顾客异常反馈', 4],
    ['其他', 5],
  ];
  for (const t of types) insert.run(...t);
}

function seedProblemSubmissions(wrapper: DbWrapper) {
  const cnt = (wrapper.prepare('SELECT COUNT(*) as c FROM problem_submissions').get() as any).c;
  if (cnt > 0) return;

  const insert = wrapper.prepare(`
    INSERT INTO problem_submissions (sales_name, problem_type, urgency, description, status, resolution, submitted_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const problems = [
    ['黄家珍', '竞品不知如何应对', '紧急', '顾客拿海信75E5N对比，说海信便宜1000块还送音响，不知道怎么回应。', '待处理', '', '2026-06-18 14:30:00'],
    ['张三', '产品知识不足', '紧急', '顾客问Mini LED和普通LED区别在哪，我讲不清楚技术原理，顾客觉得我不专业。', '处理中', '已安排技术培训课件', '2026-06-19 10:15:00'],
    ['康希凌', '话术技巧欠缺', '普通', '每次讲保修政策顾客都不耐烦，怎么把售后变成卖点来讲？', '已回复', '建议放在演示环节之后讲售后，用"买得放心"来包装', '2026-06-15 16:00:00'],
    ['黄家珍', '产品知识不足', '普通', '刚上85T7L，对分区背光数和竞品参数还不熟，需要产品参数速查表。', '待处理', '', '2026-06-20 09:45:00'],
    ['张三', '顾客异常反馈', '紧急', '前天卖的75Z11L顾客打电话说屏幕有漏光，情绪激动要求退货，该怎么处理？', '处理中', '已联系售后上门检测，待反馈结果', '2026-06-21 11:00:00'],
  ];

  for (const p of problems) insert.run(...p);
}

function seedExamResults(wrapper: DbWrapper) {
  const cnt = (wrapper.prepare('SELECT COUNT(*) as c FROM exam_results').get() as any).c;
  if (cnt > 0) return;

  const xlsxPath = path.join(process.cwd(), '数据库', '【智屏】六月第三周·智屏强化实战演练_演练结果_20260622.xlsx (1).xlsx');
  if (!fs.existsSync(xlsxPath)) {
    console.log('[DB] 考试演练 Excel 未找到，跳过种子数据');
    return;
  }

  try {
    const XLSX = require('xlsx');
    const buffer = fs.readFileSync(xlsxPath);
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheet = workbook.Sheets['演练明细'];
    if (!sheet) {
      console.log('[DB] 演练明细 sheet 未找到');
      return;
    }

    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
    if (rows.length < 2) return;

    const headers = rows[0].map((h: any) => String(h || '').trim());

    const insert = wrapper.prepare(`
      INSERT INTO exam_results (
        sales_name, account, position, exam_result, score, max_score, attempt_number,
        exam_duration, start_time,
        dim_size_recommend, dim_explosive_advantages, dim_sbar_demo,
        dim_rgb_mini_led, dim_screen_crush, dim_params_crush, dim_color_crush,
        org_path
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    let imported = 0;
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const take = (idx: number, fallback = '') => String(row[idx] || '').trim();
      const takeNum = (idx: number) => { const v = parseFloat(row[idx]); return isNaN(v) ? 0 : v; };

      // Build org path from 一级组织 ~ 九级组织 (columns 13~21, 0-indexed)
      const orgParts: string[] = [];
      for (let j = 13; j <= 21; j++) {
        const part = take(j);
        if (part) orgParts.push(part);
      }

      // 演练明细 sheet 列映射 (22 列):
      // 0:姓名 1:账号 2:演练结果 3:分数 4:开始时间 5:演练时长
      // 6-12: 7个维度得分 13-21: 九级组织
      insert.run(
        take(0),                        // sales_name
        take(1),                        // account
        '',                             // position (演练明细无此列)
        take(2),                        // exam_result (已通过/未通过)
        takeNum(3),                     // score
        100,                            // max_score
        1,                              // attempt_number
        take(5),                        // exam_duration
        take(4),                        // start_time
        takeNum(6),                     // dim_size_recommend
        takeNum(7),                     // dim_explosive_advantages
        takeNum(8),                     // dim_sbar_demo
        takeNum(9),                     // dim_rgb_mini_led
        takeNum(10),                    // dim_screen_crush
        takeNum(11),                    // dim_params_crush
        takeNum(12),                    // dim_color_crush
        orgParts.join('/')              // org_path
      );
      imported++;
    }

    console.log(`[DB] 考试演练种子数据: 导入 ${imported} 条`);
  } catch (e: any) {
    console.error('[DB] 考试演练种子导入失败:', e.message);
  }
}

function seedData(wrapper: DbWrapper) {
  seedStores(wrapper);
  seedModels(wrapper);
  seedWeaknessCategories(wrapper);
  seedStandardExplanationPoints(wrapper);
  seedProblemTypes(wrapper);
  seedProblemSubmissions(wrapper);
  seedSales(wrapper);
  seedCapability(wrapper);
  seedExamResults(wrapper);
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
