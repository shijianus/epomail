/**
 * 全链路自动化测试：全员官方欢迎邮件与单实例存储/认证/重要与代办/自动清理时效
 */

import assert from 'assert';

console.log('--- 开始欢迎邮件全链路与业务逻辑测试 ---');

// 1. 测试欢迎邮件模板默认内容与结构
const DEFAULT_WELCOME_SUBJECT = '🎉 欢迎加入 Epocanvas Mail - 开启您的私密、高效云端邮件体验';
const DEFAULT_WELCOME_CONTENT = `<div style="max-width: 640px; margin: 0 auto; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b; line-height: 1.6; background: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 20px -2px rgba(0, 0, 0, 0.05);">
  <div style="background: linear-gradient(135deg, #0284c7 0%, #2563eb 50%, #4f46e5 100%); padding: 36px 32px 30px; text-align: left; position: relative;">
    <div style="display: inline-flex; align-items: center; gap: 8px; background: rgba(255, 255, 255, 0.18); padding: 4px 12px; border-radius: 20px; color: #ffffff; font-size: 13px; font-weight: 600; margin-bottom: 16px; backdrop-filter: blur(8px);">
      <span>✨ 官方系统引导</span>
    </div>
    <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 700; letter-spacing: -0.02em;">欢迎加入 Epocanvas Mail</h1>
    <p style="margin: 8px 0 0; color: rgba(255, 255, 255, 0.9); font-size: 14px;">您的私密、纯净且极速的全球云端邮件工作中心已就绪。</p>
  </div>
  <div style="padding: 32px 32px 24px;">
    <p style="font-size: 15px; color: #334155; margin-top: 0;">尊敬的用户，您好：</p>
    <p style="font-size: 14px; color: #475569; line-height: 1.7;">很高兴与您相遇！Epocanvas Mail 致力于为您提供安全自主、零广告干扰且具备极致生产力的全新邮件交互体验。为了帮助您快速上手，我们为您准备了以下核心特性与快速指引：</p>
    <div style="margin: 24px 0; display: grid; grid-template-columns: 1fr 1fr; gap: 14px;">
      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px;">
        <div style="font-size: 20px; margin-bottom: 6px;">🔒</div>
        <div style="font-weight: 600; font-size: 14px; color: #0f172a; margin-bottom: 4px;">端到端隐私保护</div>
        <div style="font-size: 12px; color: #64748b; line-height: 1.5;">全方位的防跟踪与垃圾邮件拦截，守护每一封往来信件的安全。</div>
      </div>
      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px;">
        <div style="font-size: 20px; margin-bottom: 6px;">⚡</div>
        <div style="font-weight: 600; font-size: 14px; color: #0f172a; margin-bottom: 4px;">稍后处理与代办流</div>
        <div style="font-size: 12px; color: #64748b; line-height: 1.5;">支持随时推迟邮件至代办，让收件箱重归清爽，聚焦核心要务。</div>
      </div>
      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px;">
        <div style="font-size: 20px; margin-bottom: 6px;">⭐</div>
        <div style="font-weight: 600; font-size: 14px; color: #0f172a; margin-bottom: 4px;">星标重要与极速检索</div>
        <div style="font-size: 12px; color: #64748b; line-height: 1.5;">一键归档高优先级信件，毫秒级关键字与语法检索，触手可及。</div>
      </div>
      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px;">
        <div style="font-size: 20px; margin-bottom: 6px;">🌐</div>
        <div style="font-weight: 600; font-size: 14px; color: #0f172a; margin-bottom: 4px;">多域别名无缝流转</div>
        <div style="font-size: 12px; color: #64748b; line-height: 1.5;">自由收发多域名前缀，随时切换发送身份，打造多重工作场景。</div>
      </div>
    </div>
    <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 12px; padding: 18px; margin: 20px 0;">
      <div style="font-weight: 600; font-size: 14px; color: #1e40af; margin-bottom: 10px; display: flex; align-items: center; gap: 6px;">
        <span>🚀 3 步开启高效邮件之旅</span>
      </div>
      <div style="font-size: 13px; color: #1e3a8a; line-height: 1.8;">
        <div><strong>1. 体验代办分类：</strong> 本邮件已自动放入您的【稍后处理 / 代办】与【星标 / 重要】中，体验快捷归档。</div>
        <div><strong>2. 探索个性化外观：</strong> 前往「系统设置」体验星空动态 UI、登录背景自定义与多语言自由切换。</div>
        <div><strong>3. 开启首封信件：</strong> 点击顶栏「写邮件」，即刻体验极速富文本撰写与全球极速投递。</div>
      </div>
    </div>
    <div style="margin-top: 24px; padding-top: 16px; border-top: 1px dashed #cbd5e1; font-size: 12px; color: #94a3b8; line-height: 1.6;">
      <div>📌 <strong>温馨提示：</strong> 此邮件由系统官方自动发送（admin@epocanvas.com）。站长设定了自动清理周期，到期后将自动从您的邮箱中安全移除，无需手动清理。</div>
      <div style="margin-top: 8px;">Epocanvas Mail 官方团队 · 敬上</div>
    </div>
  </div>
</div>`;

console.log('✓ 校验默认欢迎邮件模板结构与品牌信息...');
assert.ok(DEFAULT_WELCOME_SUBJECT.includes('欢迎加入 Epocanvas Mail'));
assert.ok(DEFAULT_WELCOME_CONTENT.includes('端到端隐私保护'));
assert.ok(DEFAULT_WELCOME_CONTENT.includes('稍后处理与代办流'));
assert.ok(DEFAULT_WELCOME_CONTENT.includes('admin@epocanvas.com'));
assert.ok(DEFAULT_WELCOME_CONTENT.includes('Epocanvas Mail 官方团队'));
console.log('✓ 欢迎邮件模板验证通过！');

// 2. 模拟单实例存储与用户投递
const mockSetting = {
  welcomeSubject: DEFAULT_WELCOME_SUBJECT,
  welcomeContent: DEFAULT_WELCOME_CONTENT,
  welcomeText: '欢迎使用 Epocanvas Mail，开启您的私密、高效云端邮件体验！',
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

  // 检查是否已有该邮件
  const exists = mockDatabase.emails.find(e => e.userId === userId && e.sendEmail === 'admin@epocanvas.com' && e.subject === subject && e.isDel === 0);
  if (exists) return null;

  const now = new Date();
  const snoozedEndTime = expireDays > 0 ? new Date(now.getTime() + expireDays * 86400000).toISOString() : null;

  const emailRow = {
    emailId: mockDatabase.emails.length + 1,
    userId: userId,
    accountId: 100 + userId,
    sendEmail: 'admin@epocanvas.com',
    name: 'Epocanvas 官方团队',
    subject: subject,
    content: null, // 关键：单实例存储，数据库内存储为 null，节约全站存储
    text: text,
    toEmail: userEmail,
    toName: userEmail.split('@')[0],
    type: 0, // RECEIVE
    unread: 0,
    isDel: 0,
    isSpam: 0,
    snoozedTime: now.toISOString(),
    snoozedEndTime: snoozedEndTime,
    labels: JSON.stringify(['官方', '代办']),
    createTime: now.toISOString()
  };

  mockDatabase.emails.push(emailRow);

  // 自动标记为星标 (重要)
  mockDatabase.stars.push({
    starId: mockDatabase.stars.length + 1,
    userId: userId,
    emailId: emailRow.emailId,
    createTime: now.toISOString()
  });

  return emailRow;
}

// 模拟全员群发
mockDatabase.users.forEach(u => {
  deliverWelcomeEmailToUser(u.userId, u.email);
});

console.log(`✓ 已向全员 ${mockDatabase.users.length} 位用户投递欢迎邮件`);

// 验证单实例存储
assert.strictEqual(mockDatabase.emails.length, 2);
mockDatabase.emails.forEach(e => {
  assert.strictEqual(e.sendEmail, 'admin@epocanvas.com');
  assert.strictEqual(e.name, 'Epocanvas 官方团队');
  assert.strictEqual(e.content, null, '单实例存储：用户记录 content 字段必须为 null');
  assert.ok(e.snoozedTime != null, '必须自动设为代办');
  assert.ok(e.labels.includes('官方'), '标签必须包含官方');
});
console.log('✓ 单实例存储与官方标识验证通过！');

// 验证星标重要
assert.strictEqual(mockDatabase.stars.length, 2);
console.log('✓ 自动标记为星标重要验证通过！');

// 3. 模拟邮件读取时动态注入单实例正文
function getEmailDetail(emailId) {
  const emailRow = mockDatabase.emails.find(e => e.emailId === emailId && e.isDel === 0);
  if (!emailRow) return null;

  const isOfficial = emailRow.sendEmail === 'admin@epocanvas.com' || (emailRow.labels && emailRow.labels.includes('官方'));
  const isStar = mockDatabase.stars.some(s => s.emailId === emailId);

  const result = {
    ...emailRow,
    isStar: isStar ? 1 : 0,
    isOfficial: isOfficial ? 1 : 0,
    expireDays: isOfficial ? mockSetting.welcomeExpireDays : 0,
    content: (!emailRow.content && isOfficial && mockSetting.welcomeContent) ? mockSetting.welcomeContent : emailRow.content
  };
  return result;
}

const email1Detail = getEmailDetail(1);
assert.ok(email1Detail.content.includes('欢迎加入 Epocanvas Mail'), '读取时动态注入官方正文');
assert.strictEqual(email1Detail.isOfficial, 1);
assert.strictEqual(email1Detail.isStar, 1);
assert.strictEqual(email1Detail.expireDays, 7);
console.log('✓ 读取时动态注入单实例正文与认证标识验证通过！');

// 4. 模拟视图过滤：在 收件箱(Inbox)、星标(Star)、代办(Snoozed)、全员(All) 中均可显示
function filterEmails(folder, userId) {
  return mockDatabase.emails.filter(item => {
    if (item.userId !== userId) return false;
    if (folder === 'trash') return item.isDel === 1;
    if (item.isDel === 1) return false;

    if (folder === 'spam') return item.isSpam === 1;
    if (item.isSpam === 1) return false;

    if (folder === 'snoozed') {
      return item.snoozedTime != null;
    }

    if (folder === 'star') {
      return mockDatabase.stars.some(s => s.emailId === item.emailId);
    }

    if (folder === 'inbox') {
      // 官方邮件特权：即使在代办中，也同时展示在收件箱中
      return item.snoozedTime == null || item.sendEmail === 'admin@epocanvas.com';
    }

    return true; // all
  });
}

const inboxList = filterEmails('inbox', 1);
const starList = filterEmails('star', 1);
const snoozedList = filterEmails('snoozed', 1);

assert.strictEqual(inboxList.length, 1, '收件箱必须显示官方欢迎邮件');
assert.strictEqual(starList.length, 1, '星标重要必须显示官方欢迎邮件');
assert.strictEqual(snoozedList.length, 1, '稍后处理代办必须显示官方欢迎邮件');
console.log('✓ 官方邮件跨收件箱/重要/代办全渠道呈现验证通过！');

// 5. 模拟 7 天时效过期自动清理逻辑
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

// 模拟未到期（当前时间）
const clean0 = autoCleanExpiredWelcomeEmails(7);
assert.strictEqual(clean0, 0, '未到期不应清理');

// 模拟时间推移 8 天后
mockDatabase.emails[0].createTime = new Date(Date.now() - 8 * 86400000).toISOString();
const clean1 = autoCleanExpiredWelcomeEmails(7);
assert.strictEqual(clean1, 1, '超过 7 天应自动标记为删除');
assert.strictEqual(mockDatabase.emails[0].isDel, 1);

console.log('✓ 7天时效自动清理逻辑验证通过！');

console.log('\n🎉 所有测试场景全部顺利通过！');
