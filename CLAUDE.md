# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

人效分析工具 — 面向 TCL 销代团队的轻量级人效/店效分析平台。深色商务风仪表盘，Next.js 14 + SQLite (sql.js) + Recharts + Tailwind CSS。

## 常用命令

```bash
npm run dev          # 开发服务器 (next dev)
npm run build        # 生产构建 (先 lint + type check)
npm start            # 生产启动
```

构建时会执行 TypeScript 类型检查。`sql.js` 缺少 `@types/sql.js`，类型检查会报错但这不影响运行——这是已知问题，不要尝试安装类型包（该包不存在）。

## 技术架构

- **框架**: Next.js 14 App Router, TypeScript, 全部为客户端渲染页面 (`'use client'`)
- **数据库**: SQLite 单文件 `data/renxiao.db`，通过 `sql.js`（WASM 版）在 Node.js 端操作。⚠️ **不是 `better-sqlite3`**——不能用原生绑定
- **图表**: Recharts
- **Excel**: `xlsx` npm 包（仅服务端使用，在 API route 中 `require('xlsx')`）
- **样式**: Tailwind CSS，自定义深色主题色板（bg: `#0f1117`, surface: `#1a1d27`, primary: `#6366f1`）
- **字体**: Inter（正文）+ JetBrains Mono（数字/金额）

## 数据库层 (`lib/db.ts`)

`getDb()` 返回一个 `DbWrapper` 实例（单例）。首次调用时自动初始化 schema 并填充种子数据。

### 关键模式

- **查询**: `db.prepare('SELECT ...').all(params)` 或 `.get(params)` 返回单行
- **写入**: `db.prepare('INSERT ...').run(params)` 返回 `{ lastInsertRowid, changes }`
- **迁移**: `ensureColumn(wrapper, table, col, definition)` — 幂等添加列，已有则跳过
- **事务**: `db.transaction(fn)` 包装函数，提交后自动 `saveToDisk()`
- **JSON 字段**: `customer_concerns` 和 `sales_explained` 在 `capability_records` 表中存为 JSON 字符串数组

### 数据表 (v2.2)

| 表 | 用途 | 关联 |
|---|---|---|
| `stores` | 门店档案 | — |
| `models` | 产品型号 | — |
| `sales` | 零售销量明细（Excel 导入 + 种子数据） | `store_id`→stores, `model_id`→models |
| `capability_records` | 销代能力诊断记录 | `store_id`→stores |
| `standard_explanation_points` | 每机型标准讲解点（6维度×N机型） | `model_id`→models |
| `problem_submissions` | 销代问题反馈（SOP §2.3） | — |
| `exam_results` | AI考试演练明细（维度二，7维评分） | — |
| `store_performance` | 门店绩效（店效），store_id UNIQUE | `store_id`→stores |
| `competitor_sales` | 友商竞品销量，每竞品一行 | `store_id`→stores |

### 种子数据

数据库为空时自动填充：5 家门店、5 种机型、~20 条销量、~10 条能力记录、考试演练数据（从 `数据库/` 目录 Excel 读取）。**修改种子数据逻辑后需删 `data/renxiao.db` 才能重新生成。**

## API 路由模式

所有 API 位于 `app/api/*/route.ts`，遵循统一的 RESTful 模式：

- `GET` — 列表查询。`?id=` 返回单条。部分支持 `?month=`/`?region=`/`?store_id=` 筛选
- `POST` — 新增。JSON body 为手动添加，`multipart/form-data` 为 Excel 导入（仅 `/api/sales` 和 `/api/exam-results` 支持）
- `PUT` — 更新，需要 `?id=` query param
- `DELETE` — 删除，需要 `?id=` query param

**分析 API** (`/api/analytics/*`) 仅 GET，返回图表所需的聚合数据。`/api/analytics/capability` 包含 SOP 核心指标：讲解覆盖率、人效离散度、Pearson 相关系数 R、周环比。

## 前端组件

- `components/Sidebar.tsx` — 左侧导航，240px 宽
- `components/ExcelImporter.tsx` — 拖拽/点击上传 Excel，FormData → fetch POST，展示计数器结果
- `components/StoreForm.tsx` — 门店新增/编辑二合一表单（`isEdit = !!store?.id` 判断模式）
- `components/StorePerformanceForm.tsx` — 店效编辑表单，含动态竞品添加/删除
- `components/SalesCharts.tsx` — 销量图表组件集（Recharts）
- `components/CapabilityCharts.tsx` — 能力诊断图表组件集

## 店效计算逻辑

店效综合系数 = 成交率 × 结构机型占比 × 区域竞争系数，在 `/api/store-performance` POST 时自动计算：

- **成交率**: 该门店关联销代在 `capability_records` 中 `price_negotiation_result='成交'` 的比例
- **结构占比**: `structural_model_count / category_total_count`（高毛利机型占品类总销量）
- **区域系数**: 该门店销量 / 同区域所有门店销量之和

## 页面路由

| 路径 | 说明 |
|------|------|
| `/` | 首页仪表盘：销量/人效/店效 KPI + 讲解覆盖趋势 |
| `/stores` | 门店管理：新增/编辑/删除门店，按区域筛选 |
| `/store-efficiency` | 店效分析：门店销量录入、竞品管理、对比柱状图 |
| `/sales` | 销量分析：Excel 导入 + 多维度图表 + 明细表 |
| `/capability` | 能力诊断：销代能力记录 + 讲解覆盖率 + 机型矩阵 |

## 数据流

```
Excel 零售报表 → /api/sales (POST) → sales 表
销代能力记录 → /api/capability (POST) → capability_records 表
考试演练 Excel → /api/exam-results (POST FormData) → exam_results 表
门店绩效录入 → /api/store-performance (POST, upsert) → store_performance + competitor_sales
```

销量导入时自动匹配门店（按名称/编码）和机型（新建或关联），按订单号去重。
