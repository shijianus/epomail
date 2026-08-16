/**
 * 测试脚本：验证 getAnalytics 后端逻辑
 * 模拟 email-service.js 的 getAnalytics 方法核心逻辑，使用模拟数据验证正确性
 */

function simulateGetAnalytics(mockEmails) {
  const result = {
    totalProcessed: 0,
    totalIntercepted: 0,
    interceptRate: '0%',
    trend: [],
    topRules: []
  };

  try {
    result.totalProcessed = mockEmails.length;
    const trendMap = {};
    const ruleMap = {};
    const now = new Date();

    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      trendMap[dateStr] = 0;
    }

    let totalIntercepted = 0;
    mockEmails.forEach(e => {
      // 关键修复：SQLite CURRENT_TIMESTAMP 格式为 "YYYY-MM-DD HH:MM:SS"（无T），需替换
      const rawTime = e.createTime ? String(e.createTime).replace(' ', 'T') : '';
      const dateObj = rawTime ? new Date(rawTime) : new Date();
      const dateStr = dateObj.toISOString().split('T')[0];

      let intercepted = false;
      if (e.isSpam === 1) intercepted = true;

      if (e.labels) {
        try {
          const labs = JSON.parse(e.labels);
          if (Array.isArray(labs)) {
            if (labs.includes('推销') || labs.includes('垃圾')) intercepted = true;
            labs.forEach(l => {
              if (l !== '收件箱') ruleMap[l] = (ruleMap[l] || 0) + 1;
            });
          }
        } catch(err) {}
      }

      if (intercepted) totalIntercepted++;
      if (intercepted && trendMap[dateStr] !== undefined) {
        trendMap[dateStr]++;
      }
    });

    result.totalIntercepted = totalIntercepted;
    if (result.totalProcessed > 0) {
      result.interceptRate = ((result.totalIntercepted / result.totalProcessed) * 100).toFixed(1) + '%';
    }

    let maxTrend = 0;
    for (const k in trendMap) if (trendMap[k] > maxTrend) maxTrend = trendMap[k];

    for (const date in trendMap) {
      const count = trendMap[date];
      result.trend.push({
        date, label: date.substring(5), count,
        percent: maxTrend === 0 ? 0 : Math.max(2, (count / maxTrend) * 100)
      });
    }

    let maxRule = 0;
    for (const k in ruleMap) if (ruleMap[k] > maxRule) maxRule = ruleMap[k];

    result.topRules = Object.keys(ruleMap).map(name => ({
      name, count: ruleMap[name],
      percent: maxRule === 0 ? 0 : (ruleMap[name] / maxRule) * 100
    })).sort((a,b) => b.count - a.count).slice(0, 5);

  } catch (e) {
    console.error('Analytics error:', e);
  }
  return result;
}

// ─── 测试工具 ─────────────────────────────────────────────────────────────────
let passed = 0, failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    failed++;
  }
}

function getDaysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
}

function sqliteDate(daysAgo) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().replace('T', ' ').split('.')[0];
}

console.log('\n═══════════════════════════════════════════');
console.log('  getAnalytics 后端逻辑验证测试 (8个用例)');
console.log('═══════════════════════════════════════════\n');

// Test 1: 空数据库
console.log('Test 1: 空数据库应返回零值');
{
  const r = simulateGetAnalytics([]);
  assert(r.totalProcessed === 0, '累计处理为 0');
  assert(r.totalIntercepted === 0, '拦截量为 0');
  assert(r.interceptRate === '0%', '拦截率为 0%');
  assert(r.trend.length === 7, '趋势数组包含 7 天');
  assert(r.topRules.length === 0, '规则排行为空');
  assert(r.trend.every(t => t.count === 0), '每天拦截量均为0');
}

// Test 2: SQLite 日期格式解析（关键修复点）
console.log('\nTest 2: SQLite CURRENT_TIMESTAMP 格式解析（空格而非T）');
{
  const today = getDaysAgo(0);
  const r = simulateGetAnalytics([{ createTime: sqliteDate(0), isSpam: 1, labels: '["垃圾"]' }]);
  assert(r.totalProcessed === 1, '处理量为 1');
  assert(r.totalIntercepted === 1, '拦截量为 1（isSpam=1）');
  const todayTrend = r.trend.find(t => t.date === today);
  assert(todayTrend !== undefined, '今天的趋势数据存在');
  assert(todayTrend && todayTrend.count === 1, `今天(${today})拦截计数为 1`);
}

// Test 3: isSpam 拦截统计
console.log('\nTest 3: isSpam=1 触发拦截统计');
{
  const mails = [
    { createTime: sqliteDate(1), isSpam: 1, labels: '[]' },
    { createTime: sqliteDate(2), isSpam: 0, labels: '["收件箱"]' },
    { createTime: sqliteDate(3), isSpam: 1, labels: '[]' },
  ];
  const r = simulateGetAnalytics(mails);
  assert(r.totalProcessed === 3, '总处理量为 3');
  assert(r.totalIntercepted === 2, '拦截量为 2（两封 isSpam=1）');
  assert(r.interceptRate === '66.7%', `拦截率为 66.7%，实际: ${r.interceptRate}`);
}

// Test 4: 标签触发拦截（推销/垃圾）
console.log('\nTest 4: labels 包含"推销"或"垃圾"触发拦截');
{
  const mails = [
    { createTime: sqliteDate(0), isSpam: 0, labels: '["推销"]' },
    { createTime: sqliteDate(0), isSpam: 0, labels: '["垃圾"]' },
    { createTime: sqliteDate(0), isSpam: 0, labels: '["收件箱"]' },
    { createTime: sqliteDate(0), isSpam: 0, labels: '["工作"]' },
  ];
  const r = simulateGetAnalytics(mails);
  assert(r.totalIntercepted === 2, '推销+垃圾标签各触发一次拦截，工作/收件箱不触发');
}

// Test 5: 规则活跃度排行榜
console.log('\nTest 5: 规则活跃度排行榜（topRules）');
{
  const mails = [
    { createTime: sqliteDate(0), isSpam: 0, labels: '["推销"]' },
    { createTime: sqliteDate(1), isSpam: 0, labels: '["推销"]' },
    { createTime: sqliteDate(2), isSpam: 0, labels: '["推销"]' },
    { createTime: sqliteDate(0), isSpam: 0, labels: '["垃圾"]' },
    { createTime: sqliteDate(0), isSpam: 0, labels: '["垃圾"]' },
    { createTime: sqliteDate(0), isSpam: 0, labels: '["工作"]' },
    { createTime: sqliteDate(0), isSpam: 0, labels: '["收件箱"]' },
  ];
  const r = simulateGetAnalytics(mails);
  assert(r.topRules.length === 3, '排行榜3种规则（推销、垃圾、工作）');
  assert(r.topRules[0].name === '推销', `第1名为"推销"，实际: ${r.topRules[0]?.name}`);
  assert(r.topRules[0].count === 3, '推销命中 3 次');
  assert(r.topRules[0].percent === 100, '最高项 percent 为 100');
  assert(!r.topRules.some(x => x.name === '收件箱'), '"收件箱"不进入排行');
}

// Test 6: 7天窗口之外的邮件不计入趋势
console.log('\nTest 6: 7天窗口外的邮件不进入趋势统计');
{
  const mails = [
    { createTime: sqliteDate(0),  isSpam: 1, labels: '[]' },
    { createTime: sqliteDate(7),  isSpam: 1, labels: '[]' },
    { createTime: sqliteDate(30), isSpam: 1, labels: '[]' },
  ];
  const r = simulateGetAnalytics(mails);
  assert(r.totalIntercepted === 3, '总拦截量包含全部3封');
  const trendSum = r.trend.reduce((s, t) => s + t.count, 0);
  assert(trendSum === 1, `趋势图只显示窗口内1封，实际: ${trendSum}`);
}

// Test 7: percent 计算正确性
console.log('\nTest 7: trend percent 计算（相对最大值的百分比，最小2%）');
{
  const mails = [
    { createTime: sqliteDate(0), isSpam: 1, labels: '[]' },
    { createTime: sqliteDate(1), isSpam: 1, labels: '[]' },
    { createTime: sqliteDate(1), isSpam: 1, labels: '[]' },
    { createTime: sqliteDate(1), isSpam: 1, labels: '[]' },
  ];
  const r = simulateGetAnalytics(mails);
  const yesterday = r.trend.find(t => t.date === getDaysAgo(1));
  const today = r.trend.find(t => t.date === getDaysAgo(0));
  assert(yesterday && yesterday.count === 3, `昨天拦截3封，实际: ${yesterday?.count}`);
  assert(yesterday && yesterday.percent === 100, `昨天 percent=100，实际: ${yesterday?.percent}`);
  const expectedTodayPct = Math.max(2, (1/3)*100);
  assert(today && Math.abs(today.percent - expectedTodayPct) < 0.01,
    `今天 percent≈${expectedTodayPct.toFixed(2)}，实际: ${today?.percent?.toFixed(2)}`);
}

// Test 8: topRules 最多5条
console.log('\nTest 8: topRules 最多显示 5 条');
{
  const labels = ['推销','垃圾','工作','重要','新闻','通知','账单'];
  const mails = labels.map(label => ({ createTime: sqliteDate(0), isSpam: 0, labels: JSON.stringify([label]) }));
  const r = simulateGetAnalytics(mails);
  assert(r.topRules.length <= 5, `topRules 不超过5条，实际: ${r.topRules.length}`);
}

// ─── 最终报告 ─────────────────────────────────────────────────────────────────
console.log('\n═══════════════════════════════════════════');
console.log(`  测试结果: ${passed} 通过 / ${failed} 失败`);
if (failed === 0) {
  console.log('  🎉 所有测试通过！getAnalytics 逻辑完全正确！');
} else {
  console.log(`  ⚠️  有 ${failed} 个测试失败，需要修复！`);
  process.exit(1);
}
console.log('═══════════════════════════════════════════\n');
