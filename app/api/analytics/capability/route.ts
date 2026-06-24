import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET() {
  const db = await getDb();

  const records: any[] = db.prepare(`
    SELECT cr.*, st.name as store_name
    FROM capability_records cr
    LEFT JOIN stores st ON cr.store_id = st.id
    ORDER BY cr.record_date DESC
  `).all();

  // Parse JSON fields
  const parsed = records.map(r => ({
    ...r,
    customer_concerns: safeParse(r.customer_concerns || '[]'),
    sales_explained: safeParse(r.sales_explained || '[]'),
  }));

  // Concern/explained frequency
  const concernFreq: Record<string, number> = {};
  const explainedFreq: Record<string, number> = {};
  for (const r of parsed) {
    for (const c of r.customer_concerns) {
      concernFreq[c] = (concernFreq[c] || 0) + 1;
    }
    for (const e of r.sales_explained) {
      explainedFreq[e] = (explainedFreq[e] || 0) + 1;
    }
  }

  // Negotiation stats
  const totalCount = parsed.length;
  const dealCount = parsed.filter(r => r.price_negotiation_result === '成交').length;
  const negotiationStats = {
    avgCount: totalCount > 0
      ? Math.round((parsed.reduce((s, r) => s + (r.price_negotiation_count || 0), 0) / totalCount) * 10) / 10
      : 0,
    dealCount,
    totalCount,
    dealRate: totalCount > 0 ? Math.round((dealCount / totalCount) * 100) : 0,
  };

  // Weakness category breakdown
  const weaknessCategoryFreq: Record<string, number> = {};
  for (const r of parsed) {
    const cat = r.weakness_category || '未分类';
    weaknessCategoryFreq[cat] = (weaknessCategoryFreq[cat] || 0) + 1;
  }
  const weaknessByCategory = Object.entries(weaknessCategoryFreq)
    .map(([category, count]) => ({ category, count, pct: totalCount > 0 ? Math.round((count / totalCount) * 100) : 0 }))
    .sort((a, b) => b.count - a.count);

  // Weakness word cloud (from weakness_desc)
  const weaknessWords: Record<string, number> = {};
  const stopWords = new Set(['的','了','和','是','在','也','但','就','都','而','及','与','对','等','这','那','个','把','被','让','给','向','从','到','没有']);
  for (const r of parsed) {
    if (!r.weakness_desc) continue;
    const words = r.weakness_desc.replace(/[^一-龥a-zA-Z0-9]/g, ' ').split(/\s+/);
    for (const w of words) {
      if (w.length >= 2 && !stopWords.has(w)) {
        weaknessWords[w] = (weaknessWords[w] || 0) + 1;
      }
    }
  }
  const topWeakness = Object.entries(weaknessWords)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([word, count]) => ({ word, count }));

  // Avg communication duration per rep
  const durationByPerson: Record<string, number[]> = {};
  for (const r of parsed) {
    if (!durationByPerson[r.sales_name]) durationByPerson[r.sales_name] = [];
    durationByPerson[r.sales_name].push(r.communication_duration || 0);
  }
  const avgDuration = Object.entries(durationByPerson).map(([name, d]) => ({
    name,
    avg: Math.round(d.reduce((s, x) => s + x, 0) / d.length),
    count: d.length,
  }));

  // Interest level breakdown
  const interestLevelBreakdown: Record<string, number> = { '高': 0, '中': 0, '低': 0 };
  for (const r of parsed) {
    const level = r.customer_interest_level || '中';
    interestLevelBreakdown[level] = (interestLevelBreakdown[level] || 0) + 1;
  }

  // ── Per-model per-rep analysis (the key new feature) ──
  // For each (rep, model) pair: deal rate, avg explanation duration, vs regional average
  // Batch query: get all (model, sales_name) pairs + regional averages in 2 queries total

  // Get distinct (rep, model) pairs with records
  const pairs = db.prepare(`
    SELECT sales_name, model, region,
           COUNT(*) as total_attempts,
           SUM(CASE WHEN price_negotiation_result = '成交' THEN 1 ELSE 0 END) as deal_count,
           AVG(model_explanation_duration) as avg_explanation_duration,
           AVG(CASE WHEN customer_interest_level = '高' THEN 3 WHEN customer_interest_level = '中' THEN 2 ELSE 1 END) as avg_interest_score
    FROM capability_records
    WHERE model != ''
    GROUP BY sales_name, model
    ORDER BY sales_name, model
  `).all() as any[];

  // Batch: get regional averages for ALL models in one query
  const models = Array.from(new Set(pairs.map(p => p.model)));
  const regionalByModel: Record<string, { total: number; deals: number; avg_dur: number }> = {};
  if (models.length > 0) {
    const placeholders = models.map(() => '?').join(',');
    const regionalRows = db.prepare(`
      SELECT model,
             COUNT(*) as total,
             SUM(CASE WHEN price_negotiation_result = '成交' THEN 1 ELSE 0 END) as deals,
             AVG(model_explanation_duration) as avg_dur
      FROM capability_records
      WHERE model IN (${placeholders})
      GROUP BY model
    `).all(...models) as any[];
    for (const r of regionalRows) {
      regionalByModel[r.model] = r;
    }
  }

  // Build perModelPerRep using pre-fetched regional data (no N+1)
  const perModelPerRep = pairs.map(p => {
    const dealRate = Math.round((p.deal_count / p.total_attempts) * 100);
    const regional = regionalByModel[p.model];
    const regionalDealRate = regional && regional.total > 0
      ? Math.round((regional.deals / regional.total) * 100)
      : 0;
    const regionalAvgDur = Math.round(regional?.avg_dur || 0);
    const gap = dealRate - regionalDealRate;
    const interestScore = Math.round(p.avg_interest_score || 2);
    const avgInterest = interestScore >= 3 ? '高' : interestScore >= 2 ? '中' : '低';
    return {
      sales_name: p.sales_name,
      model: p.model,
      total_attempts: p.total_attempts,
      deal_count: p.deal_count,
      deal_rate: dealRate,
      avg_explanation_duration: Math.round(p.avg_explanation_duration || 0),
      avg_interest: avgInterest,
      regional_avg_deal_rate: regionalDealRate,
      regional_avg_duration: regionalAvgDur,
      gap,
    };
  });

  // Sort by negative gap (worst performers first)
  perModelPerRep.sort((a, b) => a.gap - b.gap);

  // ── SOP Metrics: 讲解覆盖率 + 30天趋势 + 相关性R + 人效离散度 ──

  const STANDARD_DIMENSIONS = ['品牌', '技术/功能', '竞品对比', '售后政策', '价格策略', '尺寸安装'];
  const DIMENSION_MAP: Record<string, string> = {
    '品牌': '品牌',
    '质量': '技术/功能',
    '功能': '技术/功能',
    '对比': '竞品对比',
    '售后': '售后政策',
    '价格': '价格策略',
    '尺寸': '尺寸安装',
    '外观': '尺寸安装',
  };

  // Per-rep coverage rate
  const repCoverage: Record<string, { dimensions: Set<string>; total: number; dealCount: number; dealTotal: number }> = {};
  for (const r of parsed) {
    const name = r.sales_name;
    if (!repCoverage[name]) {
      repCoverage[name] = { dimensions: new Set(), total: 0, dealCount: 0, dealTotal: 0 };
    }
    for (const e of r.sales_explained) {
      const dim = DIMENSION_MAP[e];
      if (dim) repCoverage[name].dimensions.add(dim);
    }
    repCoverage[name].total++;
    repCoverage[name].dealTotal++;
    if (r.price_negotiation_result === '成交') repCoverage[name].dealCount++;
  }

  // Coverage rate per rep (as percentage, array sorted for display)
  const coverageRates: { sales_name: string; coverageRate: number; coveredDims: string[]; missingDims: string[]; closeRate: number }[] = [];
  for (const [name, data] of Object.entries(repCoverage)) {
    const coveredDims = Array.from(data.dimensions);
    const missingDims = STANDARD_DIMENSIONS.filter(d => !data.dimensions.has(d));
    coverageRates.push({
      sales_name: name,
      coverageRate: Math.round((coveredDims.length / STANDARD_DIMENSIONS.length) * 100),
      coveredDims,
      missingDims,
      closeRate: data.dealTotal > 0 ? Math.round((data.dealCount / data.dealTotal) * 100) : 0,
    });
  }
  coverageRates.sort((a, b) => b.coverageRate - a.coverageRate);

  // Dimension-level coverage detail
  const coverageDetail = STANDARD_DIMENSIONS.map(dim => {
    const repsCovered = coverageRates.filter(r => r.coveredDims.includes(dim)).length;
    return {
      dimension: dim,
      repsCovered,
      totalReps: coverageRates.length,
      pct: coverageRates.length > 0 ? Math.round((repsCovered / coverageRates.length) * 100) : 0,
    };
  });

  // 30-day trend per rep (last 30 days, daily close rate)
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 3600 * 1000);
  const cutoffDate = thirtyDaysAgo.toISOString().split('T')[0];

  const rep30DayTrend: Record<string, { date: string; attempts: number; deals: number; rate: number }[]> = {};
  for (const r of parsed) {
    if (r.record_date < cutoffDate) continue;
    const name = r.sales_name;
    if (!rep30DayTrend[name]) rep30DayTrend[name] = [];
    const date = r.record_date;
    let entry = rep30DayTrend[name].find(e => e.date === date);
    if (!entry) {
      entry = { date, attempts: 0, deals: 0, rate: 0 };
      rep30DayTrend[name].push(entry);
    }
    entry.attempts++;
    if (r.price_negotiation_result === '成交') entry.deals++;
  }
  for (const name of Object.keys(rep30DayTrend)) {
    rep30DayTrend[name] = rep30DayTrend[name].sort((a, b) => a.date.localeCompare(b.date));
    for (const entry of rep30DayTrend[name]) {
      entry.rate = Math.round((entry.deals / entry.attempts) * 100);
    }
  }

  // Std deviation of per-rep close rates (人效离散度)
  const closeRates = coverageRates.map(r => r.closeRate).filter(r => r > 0);
  const meanCloseRate = closeRates.length > 0 ? closeRates.reduce((s, v) => s + v, 0) / closeRates.length : 0;
  const variance = closeRates.length > 0
    ? closeRates.reduce((s, v) => s + Math.pow(v - meanCloseRate, 2), 0) / closeRates.length
    : 0;
  const stdDeviation = Math.round(Math.sqrt(variance) * 10) / 10;

  // Pearson correlation R: coverage rate vs close rate (讲解率→成交率)
  const corrPairs = coverageRates.filter(r => r.coverageRate > 0 && r.closeRate > 0);
  let correlationR: number | null = null;
  if (corrPairs.length >= 3) {
    const n = corrPairs.length;
    const sumX = corrPairs.reduce((s, r) => s + r.coverageRate, 0);
    const sumY = corrPairs.reduce((s, r) => s + r.closeRate, 0);
    const sumXY = corrPairs.reduce((s, r) => s + r.coverageRate * r.closeRate, 0);
    const sumX2 = corrPairs.reduce((s, r) => s + r.coverageRate * r.coverageRate, 0);
    const sumY2 = corrPairs.reduce((s, r) => s + r.closeRate * r.closeRate, 0);
    const numerator = n * sumXY - sumX * sumY;
    const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
    if (denominator !== 0) {
      correlationR = Math.round((numerator / denominator) * 1000) / 1000;
    }
  }

  // Week-over-week coverage comparison
  const thisWeekStart = new Date(now.getTime() - now.getDay() * 24 * 3600 * 1000).toISOString().split('T')[0];
  const lastWeekStart = new Date(now.getTime() - (now.getDay() + 7) * 24 * 3600 * 1000).toISOString().split('T')[0];
  const lastWeekEnd = new Date(now.getTime() - (now.getDay() + 1) * 24 * 3600 * 1000).toISOString().split('T')[0];

  const weekOverWeek: { thisWeek: number; lastWeek: number; change: number; trend: 'up' | 'down' | 'flat' } = {
    thisWeek: 0, lastWeek: 0, change: 0, trend: 'flat',
  };

  const thisWeekRecords = parsed.filter(r => r.record_date >= thisWeekStart);
  const lastWeekRecords = parsed.filter(r => r.record_date >= lastWeekStart && r.record_date <= lastWeekEnd);

  if (thisWeekRecords.length > 0 || lastWeekRecords.length > 0) {
    const calcAvgCoverage = (recs: any[]) => {
      const repDims: Record<string, Set<string>> = {};
      for (const r of recs) {
        if (!repDims[r.sales_name]) repDims[r.sales_name] = new Set();
        for (const e of r.sales_explained) {
          const dim = DIMENSION_MAP[e];
          if (dim) repDims[r.sales_name].add(dim);
        }
      }
      const rates = Object.values(repDims).map(d => d.size / STANDARD_DIMENSIONS.length);
      return rates.length > 0 ? Math.round((rates.reduce((s, v) => s + v, 0) / rates.length) * 100) : 0;
    };
    weekOverWeek.thisWeek = calcAvgCoverage(thisWeekRecords);
    weekOverWeek.lastWeek = calcAvgCoverage(lastWeekRecords);
    weekOverWeek.change = weekOverWeek.thisWeek - weekOverWeek.lastWeek;
    weekOverWeek.trend = weekOverWeek.change > 0 ? 'up' : weekOverWeek.change < 0 ? 'down' : 'flat';
  }

  // 获取录音分析数据（AI 评分）
  const callRecordings: any[] = db.prepare(`
    SELECT * FROM call_recordings WHERE status = 'analyzed' AND sales_name != ''
  `).all();

  // 按销代汇总录音分析得分
  const recordingScoresByRep: Record<string, { coverageRate: number; dealRate: number; count: number }> = {};
  for (const rec of callRecordings) {
    const name = rec.sales_name;
    if (!name) continue;
    if (!recordingScoresByRep[name]) {
      recordingScoresByRep[name] = { coverageRate: 0, dealRate: 0, count: 0 };
    }
    recordingScoresByRep[name].coverageRate += rec.explanation_coverage_rate || 0;
    recordingScoresByRep[name].dealRate += rec.deal_rate || 0;
    recordingScoresByRep[name].count++;
  }

  // 计算录音分析平均得分
  const recordingAnalytics = Object.entries(recordingScoresByRep).map(([name, scores]) => ({
    sales_name: name,
    avgCoverageRate: scores.count > 0 ? Math.round(scores.coverageRate / scores.count) : 0,
    avgDealRate: scores.count > 0 ? Math.round(scores.dealRate / scores.count) : 0,
    recordingCount: scores.count,
  }));

  return NextResponse.json({
    records: parsed,
    concernFreq,
    explainedFreq,
    negotiationStats,
    topWeakness,
    avgDuration,
    weaknessByCategory,
    perModelPerRep,
    interestLevelBreakdown,
    // New SOP metrics
    coverageRates,
    coverageDetail,
    rep30DayTrend,
    correlationR,
    stdDeviation,
    meanCloseRate: Math.round(meanCloseRate),
    weekOverWeek,
    standardDimensions: STANDARD_DIMENSIONS,
    // 录音 AI 分析
    recordingAnalytics,
    totalRecordings: callRecordings.length,
  });
}

function safeParse(v: string): any[] {
  try { return JSON.parse(v); } catch { return []; }
}
