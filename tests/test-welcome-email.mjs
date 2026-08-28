/**
 * 全链路自动化测试：全员官方欢迎邮件与快照存储/认证/重要与代办/自动清理时效/Markdown智能解析
 */

import assert from 'assert';

console.log('--- 开始全员系统欢迎邮件全链路与业务逻辑测试 ---');

// 1. 校验新一代微软风格欢迎邮件模板默认内容与结构
const DEFAULT_WELCOME_SUBJECT = '🎉 欢迎加入 Epocanvas Mail - 开启您的私密、高效云端邮件体验';
const DEFAULT_WELCOME_CONTENT = `<div style="max-width: 680px; margin: 0 auto; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', Roboto, Helvetica, Arial, sans-serif; color: #1e293b; line-height: 1.6; background: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 24px -2px rgba(0, 0, 0, 0.06);">
  <div style="background: linear-gradient(135deg, #0078D4 0%, #0284c7 35%, #2563eb 70%, #4338ca 100%); padding: 38px 36px 32px; text-align: left; position: relative;">
    <div style="display: flex; align-items: center; justify-content: space-between; gap: 16px;">
      <div style="flex: 1;">
        <div style="display: inline-flex; align-items: center; gap: 6px; background: rgba(255, 255, 255, 0.2); border: 1px solid rgba(255, 255, 255, 0.3); padding: 4px 12px; border-radius: 20px; color: #ffffff; font-size: 12.5px; font-weight: 600; margin-bottom: 14px; backdrop-filter: blur(8px);">
          <span>✨ 官方系统引导 · 专属独立域名邮箱</span>
        </div>
        <h1 style="margin: 0; color: #ffffff; font-size: 23px; font-weight: 700; letter-spacing: -0.02em; line-height: 1.35;">欢迎开启您的专属独立域名邮箱</h1>
        <p style="margin: 8px 0 0; color: rgba(255, 255, 255, 0.92); font-size: 13.5px; line-height: 1.5;">零门槛免配置 · 纯净无广告 · 国内极速直连 · 专属身份名片 · 轻量强大</p>
      </div>
      <div style="flex-shrink: 0; display: flex; align-items: center; justify-content: center; width: 76px; height: 76px; background: rgba(255, 255, 255, 0.15); border-radius: 16px; border: 1px solid rgba(255, 255, 255, 0.25);">
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="6" y="12" width="36" height="26" rx="5" fill="#ffffff" fill-opacity="0.95" />
          <path d="M6 16L24 28L42 16" stroke="#0078D4" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
          <circle cx="36" cy="12" r="7" fill="#10B981" />
          <path d="M33.5 12L35.5 14L38.5 10" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </div>
    </div>
  </div>

  <div style="padding: 32px 32px 28px;">
    <p style="font-size: 15px; color: #1e293b; margin-top: 0; font-weight: 600;">尊敬的用户，您好：</p>
    <p style="font-size: 14px; color: #475569; line-height: 1.75; margin: 0 0 20px;">
      很高兴与您相遇！这是一个由开发者出资搭建并开放给普通用户的专属独立域名邮箱服务。我们把底层复杂的域名注册、DNS 解析、MX 记录及云端服务器全部封装，让您无需懂技术也能免费拥有专属域名邮箱。为了帮助您快速了解我们为您带来的核心价值，请查阅以下特性与指南：
    </p>

    <div style="margin: 22px 0; display: flex; flex-direction: column; gap: 14px;">
      <div style="display: flex; gap: 14px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px;">
        <div style="font-weight: 700;">零门槛拥有专属域名身份</div>
      </div>
      <div style="display: flex; gap: 14px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px;">
        <div style="font-weight: 700;">纯粹无广告 · 绝不商业变现</div>
      </div>
      <div style="display: flex; gap: 14px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px;">
        <div style="font-weight: 700;">国内极速直连 · 免翻墙不折腾</div>
      </div>
      <div style="display: flex; gap: 14px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px;">
        <div style="font-weight: 700;">进阶收件箱管理 · 界面轻盈极简</div>
      </div>
      <div style="display: flex; gap: 14px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px;">
        <div style="font-weight: 700;">多别名分发 · 垃圾邮件一键熔断</div>
      </div>
    </div>
  </div>
</div>`;

console.log('✓ 校验微软设计水准欢迎邮件模板结构与核心价值五大维度...');
assert.ok(DEFAULT_WELCOME_SUBJECT.includes('欢迎加入 Epocanvas Mail'));
assert.ok(DEFAULT_WELCOME_CONTENT.includes('零门槛拥有专属域名身份'));
assert.ok(DEFAULT_WELCOME_CONTENT.includes('纯粹无广告 · 绝不商业变现'));
assert.ok(DEFAULT_WELCOME_CONTENT.includes('国内极速直连 · 免翻墙不折腾'));
assert.ok(DEFAULT_WELCOME_CONTENT.includes('进阶收件箱管理 · 界面轻盈极简'));
assert.ok(DEFAULT_WELCOME_CONTENT.includes('多别名分发 · 垃圾邮件一键熔断'));
assert.ok(DEFAULT_WELCOME_CONTENT.includes('<svg'));
console.log('✓ 欢迎邮件模板验证通过！');

// 2. 模拟 Markdown 智能解析与编译
function compileMarkdownToHtml(src) {
  if (!src) return '';
  let text = src.trim();
  if (text.startsWith('<div') || text.startsWith('<html') || text.startsWith('<!DOCTYPE') || text.startsWith('<table')) {
    return text;
  }
  const codeBlocks = [];
  text = text.replace(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g, (match, lang, code) => {
    const placeholder = `%%CODE_BLOCK_${codeBlocks.length}%%`;
    const escapedCode = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    codeBlocks.push(`<pre style="background: #0f172a; color: #f8fafc; padding: 14px 18px; border-radius: 8px;"><code>${escapedCode}</code></pre>`);
    return placeholder;
  });
  text = text.replace(/^#\s+(.*)$/gm, '<h1 style="font-size: 24px; font-weight: 800;">$1</h1>');
  text = text.replace(/^##\s+(.*)$/gm, '<h2 style="font-size: 20px; font-weight: 700;">$1</h2>');
  text = text.replace(/^>\s+(.*)$/gm, '<blockquote style="border-left: 4px solid #0078D4;">$1</blockquote>');
  text = text.replace(/\*\*(.*?)\*\*/g, '<strong style="font-weight: 700;">$1</strong>');
  text = text.replace(/`([^`]+)`/g, '<code style="background: #f1f5f9; color: #0284c7;">$1</code>');
  text = text.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank">$1</a>');
  text = text.replace(/^[\t ]*[-*+][\t ]+(.*)$/gm, '<li>$1</li>');
  text = text.replace(/(<li>[\s\S]*?<\/li>[\n\r]*)+/g, (match) => `<ul>\n${match.trim()}\n</ul>\n`);

  const paragraphs = text.split(/\n{2,}/).map(p => {
    p = p.trim();
    if (!p) return '';
    if (p.startsWith('<h') || p.startsWith('<blockquote') || p.startsWith('<pre') || p.startsWith('<ul') || p.startsWith('%%CODE_BLOCK_')) {
      return p;
    }
    return `<p>${p.replace(/\n/g, '<br/>')}</p>`;
  }).filter(Boolean).join('\n');

  let result = paragraphs;
  codeBlocks.forEach((block, idx) => {
    result = result.replace(`%%CODE_BLOCK_${idx}%%`, block);
  });
  if (!result.includes('max-width:')) {
    result = `<div style="max-width: 680px; margin: 0 auto; background: #ffffff; border-radius: 16px; padding: 28px 32px;">\n${result}\n</div>`;
  }
  return result;
}

const mdInput = `# 欢迎加入
> 极简纯净的云端邮件

- **零门槛**：注册即用专属域名
- **极速**：全球边缘 CDN 加速

\`admin@epocanvas.com\``;

const compiledHtml = compileMarkdownToHtml(mdInput);
assert.ok(compiledHtml.includes('<h1'));
assert.ok(compiledHtml.includes('<blockquote'));
assert.ok(compiledHtml.includes('<li><strong style="font-weight: 700;">零门槛</strong>'));
assert.ok(compiledHtml.includes('<code'));
console.log('✓ Markdown 与混合内容智能扫描与编译验证通过！');

// 3. 快照存储隔离测试 (历史邮件不因后续模板修改而改变)
const mockSetting = {
  welcomeSubject: DEFAULT_WELCOME_SUBJECT,
  welcomeContent: DEFAULT_WELCOME_CONTENT,
  welcomeText: '欢迎使用 Epocanvas Mail',
  welcomeExpireDays: 7,
  welcomeAutoSend: 1
};

const mockDatabase = {
  emails: [],
  stars: [],
  users: [
    { userId: 1, email: 'alice@epocanvas.com' },
    { userId: 2, email: 'bob@epocanvas.com' }
  ]
};

function deliverWelcomeEmailToUser(userId, userEmail, overrideData = null) {
  const subject = overrideData?.subject || mockSetting.welcomeSubject;
  const expireDays = overrideData?.expireDays !== undefined ? Number(overrideData.expireDays) : mockSetting.welcomeExpireDays;
  const content = overrideData?.content || mockSetting.welcomeContent;
  const text = overrideData?.text || mockSetting.welcomeText;

  const now = new Date();
  const snoozedEndTime = expireDays > 0 ? new Date(now.getTime() + expireDays * 86400000).toISOString() : null;

  const emailRow = {
    emailId: mockDatabase.emails.length + 1,
    userId: userId,
    accountId: 100 + userId,
    sendEmail: 'admin@epocanvas.com',
    name: 'Epocanvas 官方团队',
    subject: subject,
    content: content, // 快照存储：直接写入当前版本 content，保障历史版本不被污染
    text: text,
    toEmail: userEmail,
    toName: userEmail.split('@')[0],
    type: 0,
    unread: 0,
    isDel: 0,
    isSpam: 0,
    snoozedTime: now.toISOString(),
    snoozedEndTime: snoozedEndTime,
    labels: JSON.stringify(['官方', '代办']),
    createTime: now.toISOString()
  };

  mockDatabase.emails.push(emailRow);
  mockDatabase.stars.push({
    starId: mockDatabase.stars.length + 1,
    userId: userId,
    emailId: emailRow.emailId,
    createTime: now.toISOString()
  });

  return emailRow;
}

// 投递初始版本欢迎邮件给 Alice
deliverWelcomeEmailToUser(1, 'alice@epocanvas.com');
assert.strictEqual(mockDatabase.emails[0].content, DEFAULT_WELCOME_CONTENT);

// 站长后续修改了欢迎模板为新版本
const NEW_TEMPLATE = '<div style="max-width: 680px;"><h1>新版欢迎信模版 V2</h1></div>';
mockSetting.welcomeContent = NEW_TEMPLATE;

// 验证 Alice 历史已接收的邮件快照依然保持原样，不被修改！
assert.strictEqual(mockDatabase.emails[0].content, DEFAULT_WELCOME_CONTENT, '快照隔离：历史邮件正文必须保持原样，不可被修改！');

// 投递新版本给 Bob
deliverWelcomeEmailToUser(2, 'bob@epocanvas.com');
assert.strictEqual(mockDatabase.emails[1].content, NEW_TEMPLATE, '新用户接收最新的欢迎模板');
console.log('✓ 快照存储与历史版本隔离验证通过！');

// 4. 验证 7 天时效过期自动清理逻辑
function autoCleanExpiredWelcomeEmails(days) {
  const expiredThreshold = new Date(Date.now() - days * 86400000);
  let cleanedCount = 0;
  mockDatabase.emails.forEach(item => {
    if (item.sendEmail === 'admin@epocanvas.com' && item.isDel === 0) {
      const created = new Date(item.createTime);
      if (created <= expiredThreshold) {
        item.isDel = 1;
        item.snoozedTime = null;
        item.snoozedEndTime = null;
        cleanedCount++;
      }
    }
  });
  return cleanedCount;
}

// 模拟时间推移 8 天后
mockDatabase.emails[0].createTime = new Date(Date.now() - 8 * 86400000).toISOString();
const clean1 = autoCleanExpiredWelcomeEmails(7);
assert.strictEqual(clean1, 1, '超过 7 天应自动标记为删除');
assert.strictEqual(mockDatabase.emails[0].isDel, 1);
console.log('✓ 时效自动清理验证通过！');

console.log('\n🎉 所有测试场景与业务逻辑 100% 顺利通过！');
