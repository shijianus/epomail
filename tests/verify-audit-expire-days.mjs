import assert from 'assert';
import { createRequire } from 'module';
const req = createRequire(import.meta.url);
const dayjs = req(req.resolve('dayjs', { paths: ['./mail-vue'] }));

console.log('====================================================================');
console.log('=== 核验：风险管理过期时间天数直显与色彩四阶梯度严格测试 ===');
console.log('====================================================================\n');

// 模拟前端 getRiskDeadlineInfo 函数与 6 语言字典
const i18nMock = {
  zh: {
    auditDirectDays: (p) => `${p.days} 天`,
    auditDirectDaySingle: '1 天',
    auditDeadlineExpired: '已过期',
    auditDeadlinePermanent: '永久管控'
  },
  en: {
    auditDirectDays: (p) => `${p.days} days`,
    auditDirectDaySingle: '1 day',
    auditDeadlineExpired: 'Expired',
    auditDeadlinePermanent: 'Permanent'
  }
};

function formatTableTime(val) {
  if (!val) return '-';
  return dayjs(val).format('YYYY-MM-DD HH:mm');
}

function calculateRiskDeadline(row, now = dayjs()) {
  const baseTime = row.alarmTime || row.createTime || row.banTime;
  let deadlineTime = null;
  if (row.detailText && row.detailText.includes('[延期处置]') && (row.deadline || row.expireTime)) {
    deadlineTime = row.deadline || row.expireTime;
  } else if (baseTime) {
    deadlineTime = dayjs(baseTime).add(14, 'day').toISOString();
  } else if (row.deadline || row.expireTime) {
    deadlineTime = row.deadline || row.expireTime;
  }

  if (!deadlineTime) {
    return {
      text: i18nMock.zh.auditDeadlinePermanent,
      color: 'green',
      days: 999,
      isExpired: false
    };
  }

  const target = dayjs(deadlineTime);
  const diffMs = target.diff(now);
  const diffDays = Math.ceil(diffMs / (24 * 3600 * 1000));
  const fullTime = formatTableTime(deadlineTime);

  if (diffMs <= 0 || diffDays <= 0) {
    return {
      text: i18nMock.zh.auditDeadlineExpired,
      color: 'red',
      days: diffDays,
      time: fullTime,
      fullTime,
      isExpired: true
    };
  }

  const text = diffDays === 1 ? i18nMock.zh.auditDirectDaySingle : i18nMock.zh.auditDirectDays({ days: diffDays });

  let color = 'red';
  if (diffDays >= 10) {
    color = 'green';
  } else if (diffDays >= 5) {
    color = 'orange';
  } else {
    color = 'red';
  }

  return {
    text,
    color,
    days: diffDays,
    time: fullTime,
    fullTime,
    isExpired: false
  };
}

// [测试 1] 刚发现 / 14 天满额（>= 10 天展示绿色）
console.log('[测试 1] 验证 10 天及以上展示绿色 (Green)...');
const now = dayjs('2026-10-16T12:00:00Z');

// 刚发现（1 小时前），还剩 14 天
const rowFresh = {
  alarmTime: '2026-10-16T11:00:00Z',
  createTime: '2026-10-16T11:00:00Z'
};
const resFresh = calculateRiskDeadline(rowFresh, now);
assert.strictEqual(resFresh.color, 'green', '刚发现工单必须为绿色');
assert.strictEqual(resFresh.days, 14, '剩余天数必须为 14 天');
assert.strictEqual(resFresh.text, '14 天');
console.log('  ✓ 刚发现工单 (还剩 14 天) -> 绿色 (Green):', resFresh.text);

// 发现 4 天，还剩 10 天
const row10d = {
  alarmTime: '2026-10-12T12:00:00Z',
  createTime: '2026-10-12T12:00:00Z'
};
const res10d = calculateRiskDeadline(row10d, now);
assert.strictEqual(res10d.color, 'green', '恰好 10 天工单必须为绿色 (10天及以上展示绿色)');
assert.strictEqual(res10d.days, 10, '剩余天数必须为 10 天');
assert.strictEqual(res10d.text, '10 天');
console.log('  ✓ 边界工单 (还剩 10 天) -> 绿色 (Green):', res10d.text);

// [测试 2] 发现 5~9 天（5~10 天展示橙色）
console.log('\n[测试 2] 验证 5~10 天展示橙色 (Orange)...');
// 发现 5 天，还剩 9 天
const row9d = {
  alarmTime: '2026-10-11T12:00:00Z',
  createTime: '2026-10-11T12:00:00Z'
};
const res9d = calculateRiskDeadline(row9d, now);
assert.strictEqual(res9d.color, 'orange', '还剩 9 天必须为橙色');
assert.strictEqual(res9d.days, 9);
assert.strictEqual(res9d.text, '9 天');
console.log('  ✓ 发现 5 天 (还剩 9 天) -> 橙色 (Orange):', res9d.text);

// 发现 9 天，还剩 5 天
const row5d = {
  alarmTime: '2026-10-07T12:00:00Z',
  createTime: '2026-10-07T12:00:00Z'
};
const res5d = calculateRiskDeadline(row5d, now);
assert.strictEqual(res5d.color, 'orange', '恰好 5 天必须为橙色 (5~10天展示橙色)');
assert.strictEqual(res5d.days, 5);
assert.strictEqual(res5d.text, '5 天');
console.log('  ✓ 边界工单 (还剩 5 天) -> 橙色 (Orange):', res5d.text);

// [测试 3] 发现 10~13 天（5 天以下展示红色）
console.log('\n[测试 3] 验证 5 天以下展示红色 (Red)...');
// 发现 10 天，还剩 4 天
const row4d = {
  alarmTime: '2026-10-06T12:00:00Z',
  createTime: '2026-10-06T12:00:00Z'
};
const res4d = calculateRiskDeadline(row4d, now);
assert.strictEqual(res4d.color, 'red', '还剩 4 天必须为红色 (5天以下展示红色)');
assert.strictEqual(res4d.days, 4);
assert.strictEqual(res4d.text, '4 天');
console.log('  ✓ 发现 10 天 (还剩 4 天) -> 红色 (Red):', res4d.text);

// 发现 13 天，还剩 1 天
const row1d = {
  alarmTime: '2026-10-03T12:00:00Z',
  createTime: '2026-10-03T12:00:00Z'
};
const res1d = calculateRiskDeadline(row1d, now);
assert.strictEqual(res1d.color, 'red', '还剩 1 天必须为红色');
assert.strictEqual(res1d.days, 1);
assert.strictEqual(res1d.text, '1 天');
console.log('  ✓ 发现 13 天 (还剩 1 天) -> 红色 (Red):', res1d.text);

// [测试 4] 发现 >= 14 天（0 及以下展示“已过期”）
console.log('\n[测试 4] 验证 0 及以下展示“已过期” (Expired)...');
// 恰好 14 天过期
const rowExpired0 = {
  alarmTime: '2026-10-02T12:00:00Z',
  createTime: '2026-10-02T12:00:00Z'
};
const resExpired0 = calculateRiskDeadline(rowExpired0, now);
assert.strictEqual(resExpired0.text, '已过期', '0天必须展示“已过期”');
assert.strictEqual(resExpired0.color, 'red', '已过期展示为红色');
assert.strictEqual(resExpired0.isExpired, true);
console.log('  ✓ 发现满 14 天 (已达截止点) -> 展示“已过期”:', resExpired0.text);

// 发现 20 天（超期 6 天）
const rowExpiredLate = {
  alarmTime: '2026-09-26T12:00:00Z',
  createTime: '2026-09-26T12:00:00Z'
};
const resExpiredLate = calculateRiskDeadline(rowExpiredLate, now);
assert.strictEqual(resExpiredLate.text, '已过期', '超期工单展示“已过期”');
assert.strictEqual(resExpiredLate.color, 'red');
assert.strictEqual(resExpiredLate.isExpired, true);
console.log('  ✓ 发现 20 天 (严重逾期) -> 展示“已过期”:', resExpiredLate.text);

console.log('\n====================================================================');
console.log('=== 恭喜！风险管理过期时间全部 4 阶梯次色彩与天数断言 100% 通过！ ===');
console.log('====================================================================\n');
