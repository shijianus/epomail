import assert from 'node:assert';
import {
  determineAdjudicationScenario,
  getCurrentMeasureInfo,
  getGroundedRecommendation,
  getAvailableVerdictsForScenario,
  buildScenarioNotificationPreview,
  evaluateAdjudicationContext,
  SCENARIO_TYPES
} from '../mail-vue/src/views/audit-report/utils/adjudication-engine.js';
import zhMessages from '../mail-vue/src/i18n/zh.js';

// Mock translation function using actual zh dictionary
function t(key, params = {}) {
  let str = zhMessages[key] || key;
  if (params && typeof params === 'object') {
    Object.keys(params).forEach(k => {
      str = str.replace(new RegExp(`{${k}}`, 'g'), params[k]);
    });
  }
  return str;
}

console.log('🧪 Starting Scenario-Aware Adjudication Engine Unit Tests...\n');

// 1. 首次待审、无申诉：没有任何申诉动作
{
  const firstTimeCase = {
    id: 101,
    ticketId: 'THR-2026-MULTI99',
    email: 'threat_user@test.com',
    warningType: 'risk',
    status: 'active',
    recommendedAction: 'ban_account',
    circuitStatus: 'NORMAL'
  };

  const scenario = determineAdjudicationScenario(firstTimeCase);
  assert.strictEqual(scenario, SCENARIO_TYPES.FIRST_ADJUDICATION, 'Must determine FIRST_ADJUDICATION');

  const verdicts = getAvailableVerdictsForScenario(firstTimeCase, scenario, t);
  const keys = verdicts.map(v => v.key);
  const labels = verdicts.map(v => v.label);

  assert.ok(keys.includes('ban_account'), 'Should have ban_account');
  assert.ok(keys.includes('no_penalty'), 'Should have no_penalty');

  // 严禁包含申诉相关动作
  assert.ok(!keys.includes('approve_appeal'), 'Must NOT have approve_appeal');
  assert.ok(!keys.includes('reject_appeal'), 'Must NOT have reject_appeal');
  assert.ok(!keys.includes('reject'), 'Must NOT have reject');
  assert.ok(!keys.includes('approve'), 'Must NOT have approve');
  assert.ok(!labels.some(l => l.includes('申诉')), 'Labels must NOT mention 申诉 in first adjudication');

  console.log('✅ Requirement 1 Passed: First-time threat without appeal has no appeal actions');
}

// 2. 首次待审、已有队列暂扣/熔断：仍是首次裁决，当前限制显示队列暂缓
{
  const pausedCase = {
    id: 102,
    ticketId: 'THR-2026-HOLD01',
    email: 'hold_user@test.com',
    warningType: 'risk',
    status: 'pending',
    circuitStatus: 'QUEUE_PAUSE'
  };

  const scenario = determineAdjudicationScenario(pausedCase);
  assert.strictEqual(scenario, SCENARIO_TYPES.FIRST_ADJUDICATION, 'QUEUE_PAUSE remains FIRST_ADJUDICATION');

  const measure = getCurrentMeasureInfo(pausedCase, t);
  assert.strictEqual(measure.type, 'hold', 'Measure type should be hold');
  assert.ok(measure.label.includes('暂缓') || measure.label.includes('熔断'), 'Measure label should reflect circuit hold');

  console.log('✅ Requirement 2 Passed: First-time threat with queue hold remains first-time adjudication with hold tag');
}

// 3. 已有封禁、无申诉：使用处置复核语义，维持本案处置 / 解除本案限制
{
  const bannedReviewCaseWithoutRec = {
    id: 201,
    ticketId: 'REC-2026-BAN05',
    email: 'banned_user@test.com',
    warningType: 'ban',
    status: 'banned'
  };

  const scenario = determineAdjudicationScenario(bannedReviewCaseWithoutRec);
  assert.strictEqual(scenario, SCENARIO_TYPES.SANCTION_REVIEW, 'Must determine SANCTION_REVIEW');

  const verdicts = getAvailableVerdictsForScenario(bannedReviewCaseWithoutRec, scenario, t);
  const keys = verdicts.map(v => v.key);
  const labels = verdicts.map(v => v.label);

  assert.ok(keys.includes('maintain_ban'), 'Must have maintain_ban');
  assert.ok(keys.includes('unban'), 'Must have unban');
  assert.ok(!keys.includes('ban_account'), 'Must NOT have initial ban_account');
  assert.ok(!labels.some(l => l.includes('申诉')), 'Labels must NOT mention 申诉 in sanction review');

  // 当没有服务端明确规则时，不得以“无申诉”为由强制自动推荐维持封禁，必须诚实显示暂无可验证推荐
  const recNoRule = getGroundedRecommendation(bannedReviewCaseWithoutRec, scenario, t);
  assert.strictEqual(recNoRule.hasRecommendation, false, 'Should have no automatic recommendation without server rule');
  assert.strictEqual(recNoRule.actionKey, null);

  // 当服务端存在明确 maintain_ban 规则时，有依据推荐 maintain_ban
  const bannedReviewWithRec = { ...bannedReviewCaseWithoutRec, recommendedAction: 'maintain_ban' };
  const recWithRule = getGroundedRecommendation(bannedReviewWithRec, scenario, t);
  assert.strictEqual(recWithRule.hasRecommendation, true);
  assert.strictEqual(recWithRule.actionKey, 'maintain_ban');
  assert.ok(recWithRule.basisText.includes('13.3'), 'Must cite §13.3');
  assert.ok(!recWithRule.basisText.includes('未收到合规申诉'), 'Must NOT use "no appeal" as sole justification to maintain ban');

  console.log('✅ Requirement 3 Passed: Banned case without appeal uses sanction review semantics & unbiased recommendations');
}

// 4. 用户真实申诉审核：动作与原决定绑定 (未接入的 probation 强制安全挑战已被剔除)
{
  const appealCase = {
    id: 301,
    ticketId: 'APL-2026-AP77X2',
    email: 'appeal_user@test.com',
    warningType: 'appeal',
    status: 'pending',
    appealReason: '本人近期出差漫游，密码未泄露',
    recommendedAction: 'approve_appeal'
  };

  const scenario = determineAdjudicationScenario(appealCase);
  assert.strictEqual(scenario, SCENARIO_TYPES.APPEAL_AUDIT, 'Must determine APPEAL_AUDIT');

  const verdicts = getAvailableVerdictsForScenario(appealCase, scenario, t);
  const keys = verdicts.map(v => v.key);

  assert.ok(keys.includes('approve_appeal'), 'Must have approve_appeal');
  assert.ok(!keys.includes('probation'), 'Must NOT have unimplemented probation');
  assert.ok(keys.includes('reject_appeal'), 'Must have reject_appeal');

  const rec = getGroundedRecommendation(appealCase, scenario, t);
  assert.strictEqual(rec.actionKey, 'approve_appeal', 'Recommended action should match approve_appeal');
  assert.ok(rec.basisText.includes('13.3'), 'Recommendation basis text should reference §13.3');

  console.log('✅ Requirement 4 Passed: Real appeal case offers executable appeal actions and grounded recommendation');
}

// 5. 已结案台账：默认只读，不提供可直接提交的首次裁决选项
{
  const closedCase = {
    id: 401,
    ticketId: 'BAN-2026-UN0021',
    email: 'unbanned_user@test.com',
    warningType: 'ban',
    status: 'unbanned'
  };

  const scenario = determineAdjudicationScenario(closedCase);
  assert.strictEqual(scenario, SCENARIO_TYPES.CLOSED_LEDGER, 'Must determine CLOSED_LEDGER');

  const evalCtx = evaluateAdjudicationContext(closedCase, { t, canAdjudicatePerm: true });
  assert.strictEqual(evalCtx.isReadOnly, true, 'Must be marked isReadOnly');
  assert.strictEqual(evalCtx.availableVerdicts.length, 0, 'No direct verdict options in closed ledger');
  assert.ok(evalCtx.cannotExecuteReason, 'Must provide clear read-only cannotExecuteReason');
  assert.ok(evalCtx.cannotExecuteReason.includes('只读审计记录'), 'Must truthfully describe read-only audit record');

  console.log('✅ Requirement 5 Passed: Closed case ledger is strictly read-only without verdict options');
}

// 6. 字段冲突或上下文不足：禁用危险提交，不全集兜底
{
  const invalidCase = {
    id: null,
    email: '',
    warningType: 'weird_type'
  };

  const scenario = determineAdjudicationScenario(invalidCase);
  assert.strictEqual(scenario, SCENARIO_TYPES.INSUFFICIENT_CONTEXT, 'Must determine INSUFFICIENT_CONTEXT');

  const evalCtx = evaluateAdjudicationContext(invalidCase, { t, canAdjudicatePerm: true });
  assert.strictEqual(evalCtx.isReadOnly, true, 'Must be read-only');
  assert.strictEqual(evalCtx.availableVerdicts.length, 0, 'Must NOT dump all actions');
  assert.ok(evalCtx.cannotExecuteReason.includes('不完整') || evalCtx.cannotExecuteReason.includes('冲突'));

  console.log('✅ Requirement 6 Passed: Conflicting/insufficient context safely blocks submission without dumping all actions');
}

// 7. 无权限检查：cannotExecuteReason 明确提示
{
  const caseWithoutPerm = {
    id: 101,
    ticketId: 'THR-2026-MULTI99',
    email: 'threat_user@test.com',
    warningType: 'risk',
    status: 'active'
  };

  const evalCtx = evaluateAdjudicationContext(caseWithoutPerm, { t, canAdjudicatePerm: false });
  assert.ok(evalCtx.cannotExecuteReason.includes('权限'), 'Must state lack of permission');

  console.log('✅ Requirement 7 Passed: Permission guard cleanly reports missing audit perm');
}

// 8. 场景—动作—API 动作映射契约
{
  const caseData = {
    id: 101,
    ticketId: 'THR-2026-MULTI99',
    email: 'threat_user@test.com',
    warningType: 'risk',
    status: 'active'
  };

  const evalCtx = evaluateAdjudicationContext(caseData, { t, canAdjudicatePerm: true });
  const banOption = evalCtx.availableVerdicts.find(v => v.key === 'ban_account');
  const dismissOption = evalCtx.availableVerdicts.find(v => v.key === 'no_penalty');

  assert.strictEqual(banOption.apiAction, 'ban_account');
  assert.strictEqual(banOption.submitBtnText, '确认违规封禁');
  assert.strictEqual(dismissOption.apiAction, 'no_penalty');
  assert.strictEqual(dismissOption.submitBtnText, '确认不予处罚');

  console.log('✅ Requirement 8 Passed: Action options map accurately to backend apiAction and dynamic submit button labels');
}

// 9. 通知预览：符合当前场景与动作，首次裁决绝不生成“申诉已驳回”
{
  const firstTimeCase = {
    id: 101,
    ticketId: 'THR-2026-MULTI99',
    email: 'threat_user@test.com',
    warningType: 'risk',
    status: 'active',
    reasonCode: 'OUTBOUND_SPAM_BURST',
    reportCategory: '群发垃圾邮件'
  };

  const banNotice = buildScenarioNotificationPreview({
    row: firstTimeCase,
    scenario: SCENARIO_TYPES.FIRST_ADJUDICATION,
    verdictMeta: { key: 'ban_account', capabilityDesc: '立即阻断该账号所有登录会话与外发能力' },
    caseNumber: 'THR-2026-MULTI99',
    t
  });

  assert.ok(banNotice.subject.includes('违规处置'), 'Subject must mention violation sanction');
  assert.ok(!banNotice.subject.includes('申诉'), 'Subject must NOT mention 申诉');
  assert.ok(!banNotice.decisionSummary.includes('申诉已驳回'), 'Summary must NOT state appeal rejected');

  const dismissNotice = buildScenarioNotificationPreview({
    row: firstTimeCase,
    scenario: SCENARIO_TYPES.FIRST_ADJUDICATION,
    verdictMeta: { key: 'no_penalty', capabilityDesc: '保持账号现有正常状态，不施加任何限制' },
    caseNumber: 'THR-2026-MULTI99',
    t
  });

  assert.ok(dismissNotice.subject.includes('审查结案'), 'Dismissal notice subject must mention investigation closed');
  assert.ok(dismissNotice.appealPath.includes('无需'), 'No appeal needed when no penalty is imposed');

  console.log('✅ Requirement 9 Passed: Notification preview generated strictly adheres to first-time sanction workflow');
}

// 10. 外部来信与例行合规独立场景适配
{
  const externalCase = {
    id: 501,
    ticketId: 'EXT-2026-SPAM01',
    email: 'phishing@external.org',
    warningType: 'risk',
    status: 'active',
    isInternal: 0
  };

  const extVerdicts = getAvailableVerdictsForScenario(externalCase, SCENARIO_TYPES.FIRST_ADJUDICATION, t);
  const extKeys = extVerdicts.map(v => v.key);
  assert.ok(extKeys.includes('blacklist_sender'), 'External case must offer blacklist_sender');
  assert.ok(extKeys.includes('no_penalty'), 'External case must offer no_penalty');
  assert.ok(!extKeys.includes('ban_account'), 'External case must NOT offer internal ban_account');

  const routineCase = {
    id: 601,
    ticketId: 'REV-2026-LV102',
    email: 'tester_audited@epocanvas.com',
    warningType: 'audit',
    status: 'active'
  };

  const routineVerdicts = getAvailableVerdictsForScenario(routineCase, SCENARIO_TYPES.FIRST_ADJUDICATION, t);
  const routineKeys = routineVerdicts.map(v => v.key);
  assert.ok(routineKeys.includes('archive_routine'), 'Routine audit must offer archive_routine');

  console.log('✅ Requirement 10 Passed: External inbound and routine compliance cases appropriately customized');
}

console.log('\n🎉 ALL 10 ENGINE & CONTRACT TESTS PASSED PERFECTLY!\n');
