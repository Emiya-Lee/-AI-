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
  const perModelPerRep: any[] = [];

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

  // For each pair, compute regional average for that model
  for (const p of pairs) {
    const dealRate = Math.round((p.deal_count / p.total_attempts) * 100);

    // Regional average for this model
    const regional = db.prepare(`
      SELECT COUNT(*) as total,
             SUM(CASE WHEN price_negotiation_result = '成交' THEN 1 ELSE 0 END) as deals,
             AVG(model_explanation_duration) as avg_dur
      FROM capability_records
      WHERE model = ? AND sales_name != ?
    `).get(p.model, p.sales_name) as any;

    const regionalDealRate = regional && regional.total > 0
      ? Math.round((regional.deals / regional.total) * 100)
      : 0;
    const regionalAvgDur = Math.round(regional?.avg_dur || 0);
    const gap = dealRate - regionalDealRate;

    // Interest level label
    const interestScore = Math.round(p.avg_interest_score || 2);
    const avgInterest = interestScore >= 3 ? '高' : interestScore >= 2 ? '中' : '低';

    perModelPerRep.push({
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
    });
  }

  // Sort by negative gap (worst performers first)
  perModelPerRep.sort((a, b) => a.gap - b.gap);

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
  });
}

function safeParse(v: string): any[] {
  try { return JSON.parse(v); } catch { return []; }
}
