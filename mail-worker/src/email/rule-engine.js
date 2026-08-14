import emailUtils from '../utils/email-utils';

// 系统设置内置分类逻辑（直接完成归类，用户无法修改条件，只能打补丁）
const SYSTEM_CATEGORIES = {
  '订阅': (sender, subject, body, recipients) => {
    // 白名单模式：在白名单中，或者不在黑名单中的其他安全节点
    // 占位符：真实环境中从站长配置拉取
    return true; 
  },
  '推销': (sender, subject, body, recipients) => {
    // 黑名单模式：在黑名单中，或者不在白名单中的可疑节点
    return false; 
  },
  '系统设置': (sender, subject, body, recipients) => {
    // 根据系统“分类管理”直接归类，例如隐藏的黑白名单判断
    return false;
  }
};

export function applyRules(emailParams, userLabelsJson) {
  if (!userLabelsJson) return '[]';
  try {
    let labels = [];
    const parsed = JSON.parse(userLabelsJson);
    if (Array.isArray(parsed)) {
      labels = parsed;
    } else if (parsed && typeof parsed === 'object') {
      if (Array.isArray(parsed.customLabels)) labels = labels.concat(parsed.customLabels);
      if (Array.isArray(parsed.defaultLabels)) labels = labels.concat(parsed.defaultLabels);
    }

    if (labels.length === 0) return '[]';

    const matchedLabels = [];
    
    // emailParams has properties: sendEmail, subject, content, text, recipient, etc.
    const sender = (emailParams.sendEmail || '').toLowerCase();
    const subject = (emailParams.subject || '').toLowerCase();
    const body = ((emailParams.content || '') + ' ' + (emailParams.text || '')).toLowerCase();
    const recipients = (emailParams.recipient || '').toLowerCase(); // Note: recipient is JSON string of array
    const header = ''; // Not fully parsed into params in this context, but we can map some things

    for (const label of labels) {
      let matched = false;
      let vetoed = false;
      let isSystemCategory = SYSTEM_CATEGORIES.hasOwnProperty(label.name);
      
      // 1. 系统设置：直接完成基础归类
      if (isSystemCategory) {
        matched = SYSTEM_CATEGORIES[label.name](sender, subject, body, recipients);
      }

      if (label.rules && Array.isArray(label.rules)) {
        for (const rule of label.rules) {
          const checkCondition = (cond) => {
            if (!cond || cond.type === 'none') return false;
            const type = cond.type;
            const val = (cond.value || '').toString().toLowerCase();

            switch (type) {
              case 'all_messages': return true;
              case 'system_setting': return SYSTEM_CATEGORIES[label.name] ? SYSTEM_CATEGORIES[label.name](sender, subject, body, recipients) : false;
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
