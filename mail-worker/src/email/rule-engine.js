import emailUtils from '../utils/email-utils';

// ─── 系统内置分类启发式逻辑 ───────────────────────────────────────────────────
// 这些规则由站长维护，用户可见其效果（"订阅"/"推销"自动打标），但无法在前端修改条件本身
// 用户可通过添加"例外规则"(Exception)来对特定邮件打补丁
const SYSTEM_CATEGORIES = {
  /**
   * 订阅 — 识别通讯/邮件列表/服务通知类邮件
   * 匹配条件（任一即触发）：
   *   A. 发件人地址包含 noreply/no-reply/newsletter/notifications 等常见无回复前缀
   *   B. 正文或主题含 "unsubscribe" / "退订" / "取消订阅" / "manage preferences" 等退订信号
   *   C. 发件人域名包含常见通讯平台（mailchimp, sendgrid, constantcontact 等）
   */
  '订阅': (sender, subject, body) => {
    // A. 无回复/通知类发件人特征
    const noReplyPattern = /\b(no[_.-]?reply|noreply|newsletter|notifications?|updates?|alerts?|info|news|mailer|postmaster|do[_.-]?not[_.-]?reply)\b/i;
    // B. 正文/主题退订信号
    const unsubKeywords = /\b(unsubscribe|退订|取消订阅|opt.?out|manage.*prefer|email.*prefer|mailing.*list|subscription|邮件列表|已订阅|您正在接收|you are receiving|you're receiving)\b/i;
    // C. 常见 ESP（邮件服务商）域名
    const espPattern = /\b(mailchimp|sendgrid|constantcontact|campaignmonitor|klaviyo|mailerlite|brevo|sendinblue|hubspot|marketo|pardot|salesforce\.com|amazonses|sendpulse|mailjet|postmark|mailgun)\b/i;

    const senderLocal = sender.split('@')[0] || '';
    const senderDomain = sender.split('@')[1] || '';

    if (noReplyPattern.test(senderLocal)) return true;
    if (espPattern.test(senderDomain)) return true;
    if (unsubKeywords.test(subject)) return true;
    if (unsubKeywords.test(body)) return true;
    return false;
  },

  /**
   * 推销 — 识别促销/营销/广告类邮件
   * 匹配条件（任一即触发）：
   *   A. 主题含促销关键词（折扣、限时、立即购买等）
   *   B. 正文含高密度促销信号（多个关键词同时出现）
   */
  '推销': (sender, subject, body) => {
    // A. 主题促销强信号（中英文）
    const subjectStrongPattern = /(\d+%\s*off|\d+折|buy\s*\d+\s*get\s*\d+|flash\s*sale|limited\s*time|exclusive\s*(offer|deal)|今日特卖|限时(优惠|折扣|秒杀)|特价|满减|买[一二三1-9]送[一二三1-9]|免费领取|领取优惠|抢购|特惠|促销活动)/i;
    // B. 正文营销信号（匹配 3 个及以上关键词）
    const marketingTerms = [
      /\bshop\s*(now|online)\b/i, /\bbuy\s*now\b/i, /\border\s*now\b/i,
      /\bfree\s*shipping\b/i, /\bdiscount\b/i, /\bpromo(tion)?\b/i,
      /\bsale\b/i, /\bdeal\b/i, /\bcoupon\b/i, /\bvoucher\b/i,
      /优惠券/, /折扣码/, /立即购买/, /免费配送/, /下单/, /抢先购/,
    ];

    if (subjectStrongPattern.test(subject)) return true;

    // 正文中同时命中 2 个以上营销信号才触发（降低误判）
    const bodyHits = marketingTerms.filter(p => p.test(body) || p.test(subject)).length;
    if (bodyHits >= 2) return true;

    return false;
  },

  /**
   * 系统设置 — 后台系统操作通知（保留，通常不自动归类）
   */
  '系统设置': () => false,
};

export function applyRules(emailParams, userLabelsJson, blackFromStr = '') {
  if (!userLabelsJson) return '[]';

  // Parse blackFrom mode and list
  let listMode = 'blacklist';
  let fromList = [];
  if (blackFromStr) {
    if (blackFromStr.startsWith('__mode:whitelist,')) {
      listMode = 'whitelist';
      const rest = blackFromStr.slice('__mode:whitelist,'.length);
      fromList = rest ? rest.split(',').filter(Boolean) : [];
    } else if (blackFromStr.startsWith('__mode:blacklist,')) {
      listMode = 'blacklist';
      const rest = blackFromStr.slice('__mode:blacklist,'.length);
      fromList = rest ? rest.split(',').filter(Boolean) : [];
    } else {
      listMode = 'blacklist';
      fromList = blackFromStr.split(',').filter(Boolean);
    }
  }

  function matchesSenderList(senderAddr) {
    if (fromList.length === 0) return false;
    const addr = senderAddr.trim().toLowerCase();
    const domain = emailUtils.getDomain(addr) || '';
    return fromList.some(entry => {
      const e = entry.trim().toLowerCase();
      if (!e) return false;
      if (e.includes('@')) return addr === e;
      return domain === e || domain.endsWith('.' + e);
    });
  }

  try {
    let labels = [];
    const parsed = JSON.parse(userLabelsJson);
    if (Array.isArray(parsed)) {
      labels = parsed;
    } else if (parsed && typeof parsed === 'object') {
      if (Array.isArray(parsed.allLabels)) {
        labels = parsed.allLabels;
      } else {
        if (Array.isArray(parsed.customLabels)) labels = labels.concat(parsed.customLabels);
        if (Array.isArray(parsed.defaultLabels)) labels = labels.concat(parsed.defaultLabels);
      }
    }

    if (labels.length === 0) return '[]';

    const matchedLabels = [];
    
    const sender = (emailParams.sendEmail || '').toLowerCase();
    const senderMatch = sender.match(/<([^>]+)>/);
    const cleanSender = senderMatch ? senderMatch[1].trim() : sender.trim();
    
    const subject = (emailParams.subject || '').toLowerCase();
    const body = ((emailParams.content || '') + ' ' + (emailParams.text || '')).toLowerCase();
    const recipients = (emailParams.recipient || '').toLowerCase();

    for (const label of labels) {
      let matched = false;
      let vetoed = false;
      let isSystemCategory = SYSTEM_CATEGORIES.hasOwnProperty(label.name);
      
      // 1. 系统设置：基于底层配置的启发式归类 (动态映射)
      if (isSystemCategory) {
        // 如果是"订阅"或"推销"，则混合启发式与黑白名单逻辑
        if (label.name === '订阅' || label.name === '推销') {
          const isOnList = matchesSenderList(cleanSender);
          // 订阅: 在白名单时，白名单内的邮件被归类；在黑名单时，非黑名单内的邮件被归类
          // 推销: 在白名单时，非白名单内的邮件被归类；在黑名单时，黑名单内的邮件被归类
          let isSubAllowed = false;
          let isPromoBlocked = false;
          
          if (listMode === 'whitelist') {
             isSubAllowed = isOnList; // whitelist logic for 订阅
             isPromoBlocked = !isOnList; // whitelist logic for 推销
          } else {
             isSubAllowed = !isOnList; // blacklist logic for 订阅
             isPromoBlocked = isOnList; // blacklist logic for 推销
          }

          if (label.name === '订阅') {
             matched = isSubAllowed && SYSTEM_CATEGORIES[label.name](sender, subject, body, recipients);
          } else if (label.name === '推销') {
             matched = isPromoBlocked || SYSTEM_CATEGORIES[label.name](sender, subject, body, recipients);
          }
        } else {
          matched = SYSTEM_CATEGORIES[label.name](sender, subject, body, recipients);
        }
      }

      if (label.rules && Array.isArray(label.rules)) {
        for (const rule of label.rules) {
          const checkCondition = (cond) => {
            if (!cond || cond.type === 'none') return false;
            const type = cond.type;
            const val = (cond.value || '').toString().toLowerCase();

            switch (type) {
              case 'all_messages': return true;
              case 'system_setting': 
                if (label.name === '订阅' || label.name === '推销') {
                  const isOnList = matchesSenderList(cleanSender);
                  let isSubAllowed = listMode === 'whitelist' ? isOnList : !isOnList;
                  let isPromoBlocked = listMode === 'whitelist' ? !isOnList : isOnList;
                  if (label.name === '订阅') return isSubAllowed && SYSTEM_CATEGORIES[label.name](sender, subject, body, recipients);
                  if (label.name === '推销') return isPromoBlocked || SYSTEM_CATEGORIES[label.name](sender, subject, body, recipients);
                }
                return SYSTEM_CATEGORIES[label.name] ? SYSTEM_CATEGORIES[label.name](sender, subject, body, recipients) : false;
              case 'from': 
              case 'sender_is': return val.split(',').some(v => {
                const match = sender.match(/<([^>]+)>/);
                const clean = match ? match[1].trim() : sender.trim();
                return clean === v.trim();
              });
              case 'sender_address_includes':
              case 'sender_includes': return val.split(',').some(v => {
                const match = sender.match(/<([^>]+)>/);
                let clean = match ? match[1].trim() : sender.trim();
                const parts = clean.split('@');
                if (parts.length > 1) clean = parts[1];
                return clean.includes(v.trim());
              });
              case 'to':
              case 'recipient_is': return val.split(',').some(v => {
                const match = recipients.match(/<([^>]+)>/);
                const clean = match ? match[1].trim() : recipients.trim();
                return clean === v.trim();
              });
              case 'recipient_address_includes':
              case 'recipient_includes':
              case 'email_received_for_others': return val.split(',').some(v => {
                const match = recipients.match(/<([^>]+)>/);
                let clean = match ? match[1].trim() : recipients.trim();
                const parts = clean.split('@');
                if (parts.length > 1) clean = parts[1];
                return clean.includes(v.trim());
              });
              case 'subject_include':
              case 'subject_includes': return val.split(',').some(v => subject.includes(v.trim()));
              case 'message_body_includes':
              case 'body_includes': return val.split(',').some(v => body.includes(v.trim()));
              case 'subject_or_body_include':
              case 'subject_or_body_includes': return val.split(',').some(v => subject.includes(v.trim()) || body.includes(v.trim()));
              default: return false;
            }
          };

          const hasCondition = rule.condition && rule.condition.type && rule.condition.type !== 'none';
          const hasException = rule.exception && rule.exception.type && rule.exception.type !== 'none';

          // 如果只有排除规则，没有包含规则，表示默认包含所有（匹配一切）
          let conditionMatched = false;
          if (!hasCondition) {
            if (!isSystemCategory) {
              conditionMatched = true; // 默认匹配全部
            } else {
              conditionMatched = matched; // 如果是系统分类，依赖系统的默认匹配结果
            }
          } else {
            conditionMatched = checkCondition(rule.condition);
          }

          if (conditionMatched) {
            let exceptionHit = false;
            if (hasException) {
               exceptionHit = checkCondition(rule.exception);
            }
            
            if (exceptionHit) {
              vetoed = true; // 命中排除补丁，一票否决当前规则，甚至可能否决系统基础分类
            } else {
              matched = true;
            }
          }
        }
      }

      // 如果匹配并且没有被一票否决，则打上标签
      if (matched && !vetoed && label.name) {
        matchedLabels.push(label.name);
      }
    }

    return JSON.stringify(matchedLabels);
  } catch (e) {
    console.error('Rule engine error', e);
    return '[]';
  }
}
