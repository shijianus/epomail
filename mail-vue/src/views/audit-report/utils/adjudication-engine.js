/**
 * EpoMail 案件裁决场景决策与动作映射引擎
 * 严格契合 punishments.md 规范与真实后端能力
 * 
 * 核心场景：
 * A. 首次违规裁决 (FIRST_ADJUDICATION): 违规是否成立，应该采取什么处置？禁止申诉类动作！
 * B. 既有处置复核 (SANCTION_REVIEW): 无申诉时的处置复核，维持/解除本案限制，禁止申诉文案！
 * C. 用户申诉审核 (APPEAL_AUDIT): 存在真实申诉与原处罚，申诉成立/条件放行/驳回申诉！
 * D. 已结案台账 (CLOSED_LEDGER): 默认只读，展示执行结果，不提供直接首次裁决提交！
 * E. 上下文不足或冲突 (INSUFFICIENT_CONTEXT): 缺失关键信息，明确提示原因，禁用危险提交！
 */

export const SCENARIO_TYPES = {
  FIRST_ADJUDICATION: 'FIRST_ADJUDICATION',
  SANCTION_REVIEW: 'SANCTION_REVIEW',
  APPEAL_AUDIT: 'APPEAL_AUDIT',
  CLOSED_LEDGER: 'CLOSED_LEDGER',
  INSUFFICIENT_CONTEXT: 'INSUFFICIENT_CONTEXT'
};

/**
 * 判定案件当前所处的业务工作场景
 * 严格解耦五个关键维度：
 * 1. 案件审核状态 (status: active, pending, resolved, expired, rejected, unbanned)
 * 2. 账号当前状态 (circuitStatus / status)
 * 3. 原处罚状态 (warningType === 'ban' / banTime)
 * 4. 有效待处理申诉 (warningType === 'appeal' && status pending / hasPendingAppeal)
 * 5. 复核任务 (isReviewTask / warningType === 'review')
 * 
 * @param {Object} row 案件数据行
 * @returns {string} 场景枚举值
 */
export function determineAdjudicationScenario(row) {
  if (!row || typeof row !== 'object') {
    return SCENARIO_TYPES.INSUFFICIENT_CONTEXT;
  }

  // 必须存在合法的主体标识
  const email = (row.email || '').trim();
  const hasIdentifier = Boolean(row.id || row.ticketId);
  if (!email || !hasIdentifier) {
    return SCENARIO_TYPES.INSUFFICIENT_CONTEXT;
  }

  const warningType = String(row.warningType || '').toLowerCase();
  const status = String(row.status || '').toLowerCase();
  const hasPendingAppeal = Boolean(row.hasPendingAppeal || (warningType === 'appeal' && ['pending', 'active'].includes(status)));
  const isReviewTask = Boolean(row.isReviewTask || warningType === 'review');

  // 1. 用户申诉审核 (最高业务优先级)：明确存在有效待处理申诉时，无论是独立申诉单还是关联了待审申诉的原案，均进入申诉审核
  if (hasPendingAppeal) {
    return SCENARIO_TYPES.APPEAL_AUDIT;
  }

  // 2. 已结案判定 (已结案台账)：resolved, expired, rejected, unbanned (且无新申诉或明确复核任务)
  if (['resolved', 'expired', 'rejected', 'unbanned'].includes(status) && !isReviewTask) {
    return SCENARIO_TYPES.CLOSED_LEDGER;
  }

  // 3. 既有处置复核：已存在封禁且有明确复核任务，或无申诉的既有封禁案卷
  if (isReviewTask || (warningType === 'ban' && status === 'banned') || (status === 'banned' && warningType !== 'risk' && warningType !== 'audit')) {
    return SCENARIO_TYPES.SANCTION_REVIEW;
  }

  // 4. 首次违规裁决：warningType 为 risk 或 audit，处于待审阶段 (active / pending / '')
  // 关键：即使当前因系统熔断/暂扣处于 QUEUE_PAUSE 或 TRIPPED，依然是首次违规裁决！
  if (warningType === 'risk' || warningType === 'audit') {
    if (status === 'active' || status === 'pending' || status === '') {
      return SCENARIO_TYPES.FIRST_ADJUDICATION;
    }
  }

  // 兜底防御：若状态或类型未明确匹配，避免随意兜底展示所有动作，归入上下文不足
  return SCENARIO_TYPES.INSUFFICIENT_CONTEXT;
}

/**
 * 获取当前账号受到的限制措施描述
 * @param {Object} row
 * @param {Function} t i18n 翻译函数
 */
export function getCurrentMeasureInfo(row, t) {
  if (!row) {
    return {
      type: 'unknown',
      label: t('auditMeasureUnknown') || '未知状态',
      tagType: 'info'
    };
  }

  const status = String(row.status || '').toLowerCase();
  const circuitStatus = String(row.circuitStatus || '').toUpperCase();
  const warningType = String(row.warningType || '').toLowerCase();

  if (status === 'banned') {
    return {
      type: 'banned',
      label: t('auditMeasureBanned') || '账号已封禁 (会话已阻断)',
      tagType: 'danger'
    };
  }

  if (circuitStatus === 'QUEUE_PAUSE' || circuitStatus === 'TRIPPED') {
    return {
      type: 'hold',
      label: t('auditMeasureCircuitHold') || '队列暂缓/熔断观察 (未封禁)',
      tagType: 'warning'
    };
  }

  if (status === 'unbanned') {
    return {
      type: 'unbanned',
      label: t('auditMeasureUnbanned') || '已解除限制 (已移出黑名单)',
      tagType: 'success'
    };
  }

  if (status === 'resolved' || status === 'expired') {
    return {
      type: 'closed',
      label: t('auditMeasureClosed') || '审查已结案/归档',
      tagType: 'info'
    };
  }

  if (row.isInternal === 0) {
    return {
      type: 'external_normal',
      label: t('auditMeasureExternalUnblocked') || '外部来信 (暂未拦截)',
      tagType: 'info'
    };
  }

  if (warningType === 'audit') {
    return {
      type: 'routine_observing',
      label: t('auditMeasureNormalObserving') || '通信正常 (例行观察中)',
      tagType: 'info'
    };
  }

  return {
    type: 'normal',
    label: t('auditMeasureNormalActive') || '账号正常 (未受限制)',
    tagType: 'success'
  };
}

/**
 * 计算有依据的推荐动作 (依据服务端推荐字段与 punishments.md 确定性规则)
 * @param {Object} row
 * @param {string} scenario
 * @param {Function} t
 */
export function getGroundedRecommendation(row, scenario, t) {
  if (!row || scenario === SCENARIO_TYPES.CLOSED_LEDGER || scenario === SCENARIO_TYPES.INSUFFICIENT_CONTEXT) {
    return {
      hasRecommendation: false,
      actionKey: null,
      actionLabel: t('auditRecNoneTitle') || '暂无推荐方案',
      basisText: t('auditRecNoneBasis') || '本案暂无可验证的确定性推荐规则',
      prerequisite: '',
      expectedImpact: ''
    };
  }

  const rec = String(row.recommendedAction || '').toLowerCase();
  const warningType = String(row.warningType || '').toLowerCase();

  // 1. 首次裁决推荐 (FIRST_ADJUDICATION)
  if (scenario === SCENARIO_TYPES.FIRST_ADJUDICATION) {
    // 高置信违规：明确推荐封禁，或经多账号聚类核实
    if (rec === 'ban_account' || rec === 'temp_ban_24h' || row.isCluster || (row.clusterAccounts && row.clusterAccounts.length > 0) || row.clusterId) {
      return {
        hasRecommendation: true,
        actionKey: 'ban_account',
        actionLabel: t('auditVerdictFirstBan') || '确认违规·封禁账号',
        basisText: t('auditRecBanAccountBasis') || '依据《处置规范》§7.1 及 §11.2：多账户协同关联度超标与突发高危，构成已确认滥用',
        prerequisite: t('auditRecBanAccountPrereq') || '已核实同一设备指纹与关联子账号协同证据链',
        expectedImpact: t('auditRecBanAccountImpact') || '立即阻断该账号会话与外发，记入封禁台账，提供受限申诉路径'
      };
    }

    // 外部来信拉黑：外部发件人且有明确拉黑命中
    if (row.isInternal === 0 && (rec === 'blacklist_sender' || rec === 'blacklist')) {
      return {
        hasRecommendation: true,
        actionKey: 'blacklist_sender',
        actionLabel: t('auditVerdictBlacklistExternal') || '外部拉黑·系统拦截',
        basisText: t('auditRecBlacklistBasis') || '依据《处置规范》§7.1 及检举指标：外部邮件投递欺诈/传销载荷核实属实',
        prerequisite: t('auditRecBlacklistPrereq') || '已查验外部检举外链与样本载荷',
        expectedImpact: t('auditRecBlacklistImpact') || '将发件人加入全局黑名单，边界层直接阻断后续入站邮件'
      };
    }

    // 常规合规审查归档
    if (rec === 'archive_routine' || (warningType === 'audit' && rec !== 'ban_account')) {
      return {
        hasRecommendation: true,
        actionKey: 'archive_routine',
        actionLabel: t('auditVerdictArchiveRoutine') || '例行合规封存',
        basisText: t('auditRecArchiveBasis') || '依据《处置规范》§5.4 与 §7.1：弱指纹偏移在安全基线容差范围内，未构成实质违规',
        prerequisite: t('auditRecArchivePrereq') || '已确认近 72 小时无伴随高频异常或多源投诉',
        expectedImpact: t('auditRecArchiveImpact') || '例行审查完毕并归档，账号功能完全正常保持不变'
      };
    }

    // 明确排除嫌疑：仅在服务端具有明确不予处罚或排除规则命中时推荐，不将“弱信号”自动当作无嫌疑
    if (rec === 'no_penalty' || rec === 'dismiss') {
      return {
        hasRecommendation: true,
        actionKey: 'no_penalty',
        actionLabel: t('auditVerdictDismiss') || '排除嫌疑·不予处罚',
        basisText: t('auditRecDismissBasis') || '依据《处置规范》§2.2：弱信号或孤立变量不单独构成处罚，经核验排除实质违规',
        prerequisite: t('auditRecDismissPrereq') || '已核实无多源协同滥用证据',
        expectedImpact: t('auditRecDismissImpact') || '本案结案，账号保持正常，不施加限制，不影响其他独立案件'
      };
    }

    // 若规范没有确定规则，显示暂无可验证推荐，不自动兜底编造政策
    return {
      hasRecommendation: false,
      actionKey: null,
      actionLabel: t('auditRecNoneTitle') || '暂无可验证推荐',
      basisText: t('auditRecNoneBasis') || '当前案件缺少明确的确定性规则命中，请管理员依据调查证据人工研判',
      prerequisite: '',
      expectedImpact: ''
    };
  }

  // 2. 既有处置复核推荐 (SANCTION_REVIEW)
  // “没有申诉”只能用于判定工作类型，不能单独成为维持封禁的依据！
  if (scenario === SCENARIO_TYPES.SANCTION_REVIEW) {
    if (rec === 'maintain_ban') {
      return {
        hasRecommendation: true,
        actionKey: 'maintain_ban',
        actionLabel: t('auditVerdictMaintainBan') || '维持现有封禁处置',
        basisText: t('auditRecMaintainBanBasis') || '依据《处置规范》§13.3：原阻断证据链复核依然确凿有效，继续执行既有管控措施',
        prerequisite: t('auditRecMaintainBanPrereq') || '复核确认原阻断证据链完整有效',
        expectedImpact: t('auditRecMaintainBanImpact') || '维持阻断状态并更新复核记录'
      };
    }

    if (rec === 'unban') {
      return {
        hasRecommendation: true,
        actionKey: 'unban',
        actionLabel: t('auditVerdictUnban') || '解除封禁·恢复正常权限',
        basisText: t('auditRecUnbanBasis') || '依据《处置规范》§13.3：复核排查确认原封禁证据不再成立，准予解除限制',
        prerequisite: t('auditRecUnbanPrereq') || '已确认账号安全风险已完全消除',
        expectedImpact: t('auditRecUnbanImpact') || '解除封禁状态并更新复核记录'
      };
    }

    return {
      hasRecommendation: false,
      actionKey: null,
      actionLabel: t('auditRecNoneTitle') || '暂无可验证推荐',
      basisText: t('auditRecNoneBasis') || '当前复核事项暂无自动推荐结论，需管理员依据原封禁证据与复核任务人工裁量',
      prerequisite: '',
      expectedImpact: ''
    };
  }

  // 3. 用户申诉审核推荐 (APPEAL_AUDIT)
  if (scenario === SCENARIO_TYPES.APPEAL_AUDIT) {
    if (rec === 'approve_appeal') {
      return {
        hasRecommendation: true,
        actionKey: 'approve_appeal',
        actionLabel: t('auditVerdictApproveAppeal') || '申诉成立·恢复账号权限',
        basisText: t('auditRecApproveAppealBasis') || '依据《处置规范》§13.3：出差漫游网络基准指纹匹配，排除账号买卖与盗号嫌疑',
        prerequisite: t('auditRecApproveAppealPrereq') || '已核对申诉人初始注册基准与指纹一致性',
        expectedImpact: t('auditRecApproveAppealImpact') || '申诉成立，撤销原封禁限制，恢复正常功能并通知用户'
      };
    }

    if (rec === 'reject_appeal') {
      return {
        hasRecommendation: true,
        actionKey: 'reject_appeal',
        actionLabel: t('auditVerdictRejectAppeal') || '驳回申诉·维持原封禁',
        basisText: t('auditRecRejectAppealBasis') || '依据《处置规范》§13.3：申诉抗辩理由与多源检举证据严重冲突，违规事实确凿',
        prerequisite: t('auditRecRejectAppealPrereq') || '已查阅用户多次检举记录与发信日志',
        expectedImpact: t('auditRecRejectAppealImpact') || '驳回申诉，维持原封禁状态，并送达驳回说明'
      };
    }

    return {
      hasRecommendation: false,
      actionKey: null,
      actionLabel: t('auditRecNoneTitle') || '暂无可验证推荐',
      basisText: t('auditRecNoneBasis') || '申诉内容需管理员核对申诉人抗辩说明与原始证据包后人工裁定',
      prerequisite: '',
      expectedImpact: ''
    };
  }

  return {
    hasRecommendation: false,
    actionKey: null,
    actionLabel: t('auditRecNoneTitle') || '暂无可验证推荐',
    basisText: t('auditRecNoneBasis') || '当前案件缺少明确的服务端规则命中，请管理员依据调查证据人工判断',
    prerequisite: '',
    expectedImpact: ''
  };
}

/**
 * 计算当前场景下允许展示的裁决选项集合
 * 绝不让所有案件共享一组固定选项！
 * @param {Object} row
 * @param {string} scenario
 * @param {Function} t
 */
export function getAvailableVerdictsForScenario(row, scenario, t) {
  if (!row || scenario === SCENARIO_TYPES.CLOSED_LEDGER || scenario === SCENARIO_TYPES.INSUFFICIENT_CONTEXT) {
    return [];
  }

  // A. 首次违规裁决 (FIRST_ADJUDICATION)
  // 必须回答：违规是否成立，应该采取什么处置？
  // 严禁出现：驳回申诉、申诉放行、撤销原裁决！
  if (scenario === SCENARIO_TYPES.FIRST_ADJUDICATION) {
    // 外部来信场景 (isInternal === 0)
    if (row.isInternal === 0) {
      return [
        {
          key: 'blacklist_sender',
          apiAction: 'blacklist_sender',
          label: t('auditVerdictBlacklistExternal') || '外部拉黑·系统拦截',
          icon: 'fluent:prohibited-20-regular',
          tone: 'reject',
          isDestructive: true,
          resultDesc: t('auditVerdictBlacklistExternalResult') || '将发件人加入全局黑名单拦截',
          capabilityDesc: t('auditVerdictBlacklistExternalCapability') || '系统边界层丢弃后续所有来自该地址的入站邮件，不影响其他外部发信人',
          submitBtnText: t('auditBtnConfirmBlacklist') || '确认加入黑名单'
        },
        {
          key: 'no_penalty',
          apiAction: 'no_penalty',
          label: t('auditVerdictDismissExternal') || '排除嫌疑·正常接收',
          icon: 'fluent:checkmark-circle-20-regular',
          tone: 'approve',
          isDestructive: false,
          resultDesc: t('auditVerdictDismissExternalResult') || '举报不成立，正常接收后续来信',
          capabilityDesc: t('auditVerdictDismissExternalCapability') || '不加入黑名单，保持正常通信与入站规则处理',
          submitBtnText: t('auditBtnConfirmDismiss') || '确认排除嫌疑'
        }
      ];
    }

    // 常规合规基线审查 (warningType === 'audit')
    if (String(row.warningType || '').toLowerCase() === 'audit') {
      return [
        {
          key: 'archive_routine',
          apiAction: 'archive_routine',
          label: t('auditVerdictArchiveRoutine') || '例行合规封存',
          icon: 'fluent:archive-20-regular',
          tone: 'approve',
          isDestructive: false,
          resultDesc: t('auditVerdictArchiveRoutineResult') || '偏差在安全基线范围内，例行审查完毕归档',
          capabilityDesc: t('auditVerdictArchiveRoutineCapability') || '账号功能正常，审查记录封存归档，不施加限制',
          submitBtnText: t('auditBtnConfirmArchive') || '确认封存归档'
        },
        {
          key: 'no_penalty',
          apiAction: 'no_penalty',
          label: t('auditVerdictDismiss') || '排除关注·保持正常',
          icon: 'fluent:checkmark-circle-20-regular',
          tone: 'approve',
          isDestructive: false,
          resultDesc: t('auditVerdictDismissResult') || '违规不成立，结束例行跟踪',
          capabilityDesc: t('auditVerdictDismissCapability') || '账号功能完全正常，不修改其他独立案件',
          submitBtnText: t('auditBtnConfirmDismiss') || '确认保持正常'
        }
      ];
    }

    // 默认站内账户首次违规裁决
    const options = [
      {
        key: 'ban_account',
        apiAction: 'ban_account',
        label: t('auditVerdictFirstBan') || '确认违规·封禁账号',
        icon: 'fluent:dismiss-circle-20-regular',
        tone: 'reject',
        isDestructive: true,
        resultDesc: t('auditVerdictFirstBanResult') || '确认违规属实，封禁账号并列入管控台账',
        capabilityDesc: t('auditVerdictFirstBanCapability') || '立即阻断该账号所有登录会话与外发能力，保留历史数据并支持后续独立申诉',
        submitBtnText: t('auditBtnConfirmBan') || '确认违规封禁'
      },
      {
        key: 'no_penalty',
        apiAction: 'no_penalty',
        label: t('auditVerdictDismiss') || '排除嫌疑·不予处罚',
        icon: 'fluent:checkmark-circle-20-regular',
        tone: 'approve',
        isDestructive: false,
        resultDesc: t('auditVerdictDismissResult') || '违规不成立，审查结案且不予处罚',
        capabilityDesc: t('auditVerdictDismissCapability') || '保持账号现有正常状态，不施加任何限制，不解除其他案件可能存在的限制，不自动入白名单',
        submitBtnText: t('auditBtnConfirmDismiss') || '确认不予处罚'
      }
    ];

    return options;
  }

  // B. 既有处置复核 (SANCTION_REVIEW)
  // 无申诉时展示：维持本案处置 / 解除本案限制
  // 严禁使用申诉通过/驳回文案！不能把维持封禁写成首次封禁！
  if (scenario === SCENARIO_TYPES.SANCTION_REVIEW) {
    return [
      {
        key: 'maintain_ban',
        apiAction: 'maintain_ban',
        label: t('auditVerdictMaintainBan') || '维持现有封禁处置',
        icon: 'fluent:prohibited-20-regular',
        tone: 'reject',
        isDestructive: true,
        resultDesc: t('auditVerdictMaintainBanResult') || '复核确认原封禁处置合规，维持阻断',
        capabilityDesc: t('auditVerdictMaintainBanCapability') || '继续阻断所有会话与外发通道，更新复核记录，不重复生成首次封禁',
        submitBtnText: t('auditBtnConfirmMaintainBan') || '确认维持封禁'
      },
      {
        key: 'unban',
        apiAction: 'unban',
        label: t('auditVerdictUnban') || '解除封禁·恢复正常权限',
        icon: 'fluent:checkmark-circle-20-regular',
        tone: 'approve',
        isDestructive: false,
        resultDesc: t('auditVerdictUnbanResult') || '解除封禁状态，移出黑名单并恢复服务',
        capabilityDesc: t('auditVerdictUnbanCapability') || '恢复账号正常登录、收发信与完整服务能力，台账记录解封存证',
        submitBtnText: t('auditBtnConfirmUnban') || '确认解封放行'
      }
    ];
  }

  // C. 用户申诉审核 (APPEAL_AUDIT)
  // 必须有真实申诉与原决定
  // 展示：申诉成立放行 / 驳回申诉
  if (scenario === SCENARIO_TYPES.APPEAL_AUDIT) {
    return [
      {
        key: 'approve_appeal',
        apiAction: 'approve',
        label: t('auditVerdictApproveAppeal') || '申诉成立·恢复账号权限',
        icon: 'fluent:checkmark-circle-20-regular',
        tone: 'approve',
        isDestructive: false,
        resultDesc: t('auditVerdictApproveAppealResult') || '申诉核实成立，撤销原封禁并恢复正常功能',
        capabilityDesc: t('auditVerdictApproveAppealCapability') || '撤销原封禁限制，恢复正常登录与收发信，原封禁台账更新为已解禁',
        submitBtnText: t('auditBtnConfirmApproveAppeal') || '确认申诉成立放行'
      },
      {
        key: 'reject_appeal',
        apiAction: 'reject',
        label: t('auditVerdictRejectAppeal') || '驳回申诉·维持原封禁',
        icon: 'fluent:dismiss-circle-20-regular',
        tone: 'reject',
        isDestructive: true,
        resultDesc: t('auditVerdictRejectAppealResult') || '申诉抗辩不成立，维持原封禁决定',
        capabilityDesc: t('auditVerdictRejectAppealCapability') || '维持账号封禁与阻断状态，向用户送达申诉驳回说明',
        submitBtnText: t('auditBtnConfirmRejectAppeal') || '确认驳回申诉'
      }
    ];
  }

  return [];
}

/**
 * 构建符合当前场景与所选动作的用户通知预览数据
 * 杜绝首次裁决出现“申诉已驳回”的错误映射
 * @param {Object} row 案件
 * @param {string} scenario 场景
 * @param {Object} verdictMeta 所选选项元数据
 * @param {string} caseNumber 案件编号
 * @param {Function} t
 */
export function buildScenarioNotificationPreview({ row, scenario, verdictMeta, caseNumber, t }) {
  if (!row || !verdictMeta) return null;

  const recipient = row.email || '-';
  const cNo = caseNumber || row.ticketId || row.id || '-';
  const reasonCode = row.reasonCode || 'POLICY_VIOLATION';
  const publicReason = `${row.reportCategory || t('auditCategorySecurity') || '安全风控'} [${reasonCode}]`;

  let subject = '';
  let decisionSummary = '';
  let effectiveCondition = '';
  let affectedCapabilities = verdictMeta.capabilityDesc || '';
  let appealPath = t('auditPreviewAppealPathSupported') || '可通过帮助中心与服务条款提交申诉';
  let reachabilityNote = t('auditPreviewReachableNormal') || '账号处于正常通信状态，若接入内部通知用户可在收件箱查看（当前后端未接入自动发信）';

  // 1. 首次违规裁决
  if (scenario === SCENARIO_TYPES.FIRST_ADJUDICATION) {
    if (verdictMeta.key === 'ban_account') {
      subject = t('auditNoticeSubjectFirstBan', { caseId: cNo }) || `【系统通知】账号违规处置与使用限制说明 (${cNo})`;
      decisionSummary = t('auditNoticeDecisionFirstBan', { email: recipient, reason: publicReason }) || `经安全合规研判，您的账号 (${recipient}) 违反平台服务规范（原因：${publicReason}），已被执行封禁管控措施。`;
      effectiveCondition = t('auditPreviewEffectiveImmediate') || '裁决提交后即时生效';
      reachabilityNote = t('auditPreviewReachableRejectGap') || '系统处置通道：裁决时同事务入库通知 Outbox 并直投内部信箱；受限用户可查阅通知并申诉';
    } else if (verdictMeta.key === 'no_penalty') {
      subject = t('auditNoticeSubjectDismiss', { caseId: cNo }) || `【系统通知】账号安全审查结案通知 (${cNo})`;
      decisionSummary = t('auditNoticeDecisionDismiss', { email: recipient }) || `经安全研判复核，关于您的账号 (${recipient}) 的安全审查已结案，未发现实质违规，未对账号施加任何限制。`;
      effectiveCondition = t('auditPreviewEffectiveImmediate') || '裁决提交后即时生效';
      appealPath = t('auditNoticeAppealNoneNeeded') || '本案未施加任何限制，无需提交申诉';
    } else if (verdictMeta.key === 'blacklist_sender') {
      subject = `【系统通知】外部发信地址拦截说明 (${cNo})`;
      decisionSummary = `经核查，外部发信人 (${recipient}) 存在恶意内容或投递欺诈，已被列入系统全局黑名单。`;
      effectiveCondition = '即时生效，边界丢弃';
      reachabilityNote = '外部邮件已被系统拦截';
    } else if (verdictMeta.key === 'archive_routine') {
      subject = `【系统通知】例行合规检查归档说明 (${cNo})`;
      decisionSummary = `例行安全基线检查已完成，您的账号 (${recipient}) 符合安全基线规范，检查记录已归档。`;
      effectiveCondition = '即时归档';
    }
  }

  // 2. 既有处置复核
  else if (scenario === SCENARIO_TYPES.SANCTION_REVIEW) {
    if (verdictMeta.key === 'maintain_ban') {
      subject = t('auditNoticeSubjectMaintainBan', { caseId: cNo }) || `【系统通知】账号封禁处置复核维持说明 (${cNo})`;
      decisionSummary = t('auditNoticeDecisionMaintainBan', { email: recipient }) || `经管理团队复核，您的账号 (${recipient}) 维持原封禁处置，继续阻断服务。`;
      effectiveCondition = '复核确认，维持阻断';
      reachabilityNote = t('auditPreviewReachableRejectGap') || '系统处置通道：裁决时同事务入库通知 Outbox 并直投内部信箱；受限用户可查阅通知并申诉';
    } else if (verdictMeta.key === 'unban') {
      subject = t('auditNoticeSubjectUnban', { caseId: cNo }) || `【系统通知】账号解除限制与恢复服务通知 (${cNo})`;
      decisionSummary = t('auditNoticeDecisionUnban', { email: recipient }) || `经管理团队复核，关于您的账号 (${recipient}) 的封禁限制已解除，服务已恢复正常。`;
      effectiveCondition = t('auditPreviewEffectiveImmediate') || '裁决提交后即时生效';
    }
  }

  // 3. 用户申诉审核
  else if (scenario === SCENARIO_TYPES.APPEAL_AUDIT) {
    if (verdictMeta.key === 'approve_appeal') {
      subject = t('auditPreviewSubjectApprove', { caseId: cNo }) || `【系统通知】申诉复核通过与服务恢复说明 (${cNo})`;
      decisionSummary = t('auditNoticeDecisionApproveAppeal', { email: recipient, caseId: cNo }) || `您针对案件 (${cNo}) 提交的解封申诉已复核通过，您的账号 (${recipient}) 限制已解除，已恢复正常服务。`;
      effectiveCondition = t('auditPreviewEffectiveImmediate') || '裁决提交后即时生效';
    } else if (verdictMeta.key === 'reject_appeal') {
      subject = t('auditNoticeSubjectRejectAppeal', { caseId: cNo }) || `【系统通知】申诉复核结论与驳回说明 (${cNo})`;
      decisionSummary = t('auditNoticeDecisionRejectAppeal', { email: recipient, caseId: cNo }) || `您针对案件 (${cNo}) 提交的解封申诉经合规团队复核未予支持，维持原封禁决定。`;
      effectiveCondition = '申诉驳回，维持原处置';
      reachabilityNote = t('auditPreviewReachableRejectGap') || '系统处置通道：裁决时同事务入库通知 Outbox 并直投内部信箱；受限用户可查阅通知并申诉';
    }
  }

  return {
    statusBadge: t('auditPreviewStatusNotConnected') || '通知模板预览（裁决时同事务写入 Outbox 自动投递）',
    sender: 'Epocanvas Mail Security <system-security@epocanvas.com>',
    recipient,
    reachabilityNote,
    subject,
    reasonCode,
    decisionSummary,
    effectiveCondition,
    affectedCapabilities,
    appealPath
  };
}

/**
 * 完整计算裁决工作台的上下文数据模型
 * @param {Object} row 案件数据行
 * @param {Object} options 包含 { t, canAdjudicatePerm }
 * @returns {Object} 包含场景、措施、推荐、可用选项、状态与说明等集中数据
 */
export function evaluateAdjudicationContext(row, { t, canAdjudicatePerm = true } = {}) {
  const scenario = determineAdjudicationScenario(row);
  const currentMeasure = getCurrentMeasureInfo(row, t);
  const recommendation = getGroundedRecommendation(row, scenario, t);
  const availableVerdicts = getAvailableVerdictsForScenario(row, scenario, t);

  const isReadOnly = scenario === SCENARIO_TYPES.CLOSED_LEDGER || scenario === SCENARIO_TYPES.INSUFFICIENT_CONTEXT;
  
  let cannotExecuteReason = null;
  if (scenario === SCENARIO_TYPES.INSUFFICIENT_CONTEXT) {
    cannotExecuteReason = t('auditContextInsufficientErr') || '案件关键信息不完整或状态冲突，为保障安全已禁用裁决提交';
  } else if (scenario === SCENARIO_TYPES.CLOSED_LEDGER) {
    cannotExecuteReason = t('auditCaseAlreadyClosedNotice') || '本案件已结案归档，属于系统只读审计记录，无法重复提交裁决';
  } else if (!canAdjudicatePerm) {
    cannotExecuteReason = t('auditSubmitDisabledNoPerm') || '当前账号无案件裁决权限 (audit:adjudicate)';
  }

  // 场景标题徽标映射
  let scenarioBadge = '';
  let scenarioBadgeTone = 'info';
  switch (scenario) {
    case SCENARIO_TYPES.FIRST_ADJUDICATION:
      scenarioBadge = t('auditScenarioFirstAdjudication') || '首次违规裁决';
      scenarioBadgeTone = 'warning';
      break;
    case SCENARIO_TYPES.SANCTION_REVIEW:
      scenarioBadge = t('auditScenarioSanctionReview') || '既有处置复核';
      scenarioBadgeTone = 'danger';
      break;
    case SCENARIO_TYPES.APPEAL_AUDIT:
      scenarioBadge = t('auditScenarioAppealAudit') || '用户申诉审核';
      scenarioBadgeTone = 'primary';
      break;
    case SCENARIO_TYPES.CLOSED_LEDGER:
      scenarioBadge = t('auditScenarioClosedLedger') || '已结案台账';
      scenarioBadgeTone = 'info';
      break;
    default:
      scenarioBadge = t('auditScenarioInsufficient') || '待判定上下文';
      scenarioBadgeTone = 'info';
  }

  return {
    scenario,
    scenarioBadge,
    scenarioBadgeTone,
    currentMeasure,
    recommendation,
    availableVerdicts,
    isReadOnly,
    cannotExecuteReason
  };
}
