# 人效分析工具 — SPEC.md

## 1. Concept & Vision

一款面向销代的轻量级人效分析工具，帮助管理者快速掌握销量结构和销代能力短板。界面简洁专业，数据可视化直观，Excel 导入零摩擦，让数据说话而非工具本身。

风格定位：**商务智能仪表盘**，深色主题，数据密度高但不杂乱。

---

## 2. Design Language

- **Aesthetic**: 深色商务风，专业数据平台感（类 Linear/Posthog 深色版）
- **Color Palette**:
  - Background: `#0f1117`
  - Surface: `#1a1d27`
  - Border: `#2e3340`
  - Primary: `#6366f1`（Indigo，用于主要操作按钮和图表主色）
  - Accent: `#22c55e`（Green，用于正向指标/成交）
  - Warning: `#f59e0b`（Amber，用于需关注的指标）
  - Danger: `#ef4444`（Red，用于负向指标/未成交）
  - Text Primary: `#f1f5f9`
  - Text Secondary: `#94a3b8`
- **Typography**: Inter（正文）+ JetBrains Mono（数字/金额）
- **Spacing**: 8px 基础单位，组件间距 16/24/32px
- **Motion**: 图表入场动画 600ms ease-out，hover 状态 150ms

---

## 3. Layout & Structure

```
┌──────────────────────────────────────────────────────┐
│  Sidebar (240px)  │  Main Content Area              │
│  ─────────────── │  ──────────────────────────────── │
│  📊 人效分析       │  [页面标题 + 操作按钮]           │
│  ─────────────── │  [核心内容区]                     │
│  🏠 首页仪表盘     │                                  │
│  📈 销量分析       │                                  │
│  🎯 能力缺陷       │                                  │
│  ─────────────── │                                  │
│  [底部: 版本号]   │                                  │
└──────────────────────────────────────────────────────┘
```

- 移动端：Sidebar 收起为汉堡菜单
- 内容区最大宽度 1400px，水平居中

---

## 4. Features & Interactions

### 4.1 首页仪表盘
- 4个 KPI 卡片：本月销售额、本月销量、本月销代数、成交率
- 快捷入口按钮：导入Excel / 记录能力
- 最近导入记录列表（最近5条）

### 4.2 销量分析页面（/sales）
- **Excel导入区**：拖拽上传或点击选择，实时显示解析结果（多少条记录，成功/失败）
- **月份筛选器**：下拉选择月份，默认当月
- **图表区**：
  - 饼图：各机型销售额占比（可 hover 看详情）
  - 折线图：月度销量趋势（近6个月）
  - 柱状图：销代销售额排行 TOP 10
- **数据表**：展示当前筛选条件下的明细数据，支持翻页

### 4.3 能力缺陷页面（/capability）
- **记录表单**：销代姓名（下拉）、日期、交流时长、顾客关注点（多选）、销代讲解点（多选）、顾客实际理解（文本）、价格拉扯次数、是否成交（选择）、薄弱描述（文本）
- **图表区**：
  - 对比柱状图：顾客关注点 vs 销代讲解点（各维度频率）
  - 散点图：拉扯次数 vs 成交率分布
  - 词频统计：薄弱描述高频词
- **历史记录表**：展示所有记录，分页

### 4.4 Excel 导入逻辑
- 支持 .xlsx / .xls
- 列映射：销售日期→sale_date，业务员→sales_name，型号→model，零售量→quantity，单价→unit_price，金额→amount
- 去重规则：sale_date + sales_name + model + amount 四者相同视为重复，跳过
- 导入结果：显示成功条数/跳过条数/失败条数

---

## 5. Component Inventory

| Component | States |
|---|---|
| Sidebar | 默认 / 移动端收起 |
| KPICard | 默认 / loading / 无数据 |
| SalesChart（Recharts） | loading / 有数据 / 无数据 |
| CapabilityChart | loading / 有数据 / 无数据 |
| ExcelImporter | 空闲 / 拖拽中 / 解析中 / 成功 / 失败 |
| RecordForm | 空闲 / 填写中 / 提交中 / 成功 / 错误 |
| DataTable | 默认 / 空状态 / loading |

---

## 6. Technical Approach

- **Framework**: Next.js 14, App Router, TypeScript
- **Database**: SQLite via `better-sqlite3`（适合 NAS 单文件存储）
- **ORM**: 直接用 SQL（轻量，无学习成本）
- **Charts**: Recharts
- **Excel**: `xlsx` npm 包
- **Styling**: Tailwind CSS（dark mode 默认）
- **API**: Next.js Route Handlers（RESTful）
- **部署**: `npm run build` 后 `npm start`，Docker 或直接跑在 NAS 上

### API Design

| Method | Path | Description |
|---|---|---|
| GET | /api/sales | 获取销量列表，支持 ?month=YYYY-MM 筛选 |
| POST | /api/sales/import | 导入 Excel（FormData 上传） |
| DELETE | /api/sales | 清空销量数据 |
| GET | /api/capability | 获取能力记录列表 |
| POST | /api/capability | 新增一条能力记录 |
| PUT | /api/capability?id=X | 更新能力记录 |
| DELETE | /api/capability?id=X | 删除能力记录 |
| GET | /api/analytics/sales?month=YYYY-MM | 销量分析数据（图表用） |
| GET | /api/analytics/capability | 能力分析数据（图表用） |

### Data Model

```sql
CREATE TABLE sales (
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
);

CREATE TABLE capability_records (
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
);
```

---

## 7. 示例数据

初始化时插入：
- 10条销量记录（2026年5-6月，3个销代：康希凌、黄家珍、张三，5种机型）
- 5条能力记录（不同销代，含不同的关注点/讲解点组合）
