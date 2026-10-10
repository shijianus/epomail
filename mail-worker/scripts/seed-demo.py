#!/usr/bin/env python3
"""Generate beautiful demo seed SQL for the local epomail demo instance.

Usage: python scripts/seed-demo.py <user_id> <account_id>
Writes demo-seed.sql next to this script. Data lives ONLY in local .wrangler state.
"""
import sys
from pathlib import Path

USER_ID = sys.argv[1]
ACCOUNT_ID = sys.argv[2]

L_WORK = '["工作"]'
L_COM = '["社群"]'
L_SUB = '["订阅"]'
L_ADS = '["推销"]'

def ts(spec):
    return f"strftime('%Y-%m-%d %H:%M:%S','now','{spec}')"

def mail(send, name, subj, html, *, to="admin@epomail.bond", to_name="站长", labels='[]',
         unread=1, typ=0, spam=0, dele=0, code='', when='-2 hours', snooze=''):
    snooze_sql = f"{ts(snooze)}" if snooze else "NULL"
    safe = html.replace("'", "''")
    return (f"({typ}, {ACCOUNT_ID}, {USER_ID}, '{send}', '{name}', '{to}', '{to_name}', "
            f"'{subj}', '{safe}', '', '{code}', '{labels}', {unread}, {spam}, {dele}, "
            f"{ts(when)}, '[]', {snooze_sql}),")

rows = []
A = rows.append

# —— 官方全域公告（announcement@ 官方发信身份）——
A(mail('announcement@epocanvas.com', 'EpoCanvas 运营团队',
    '全域公告：EpoCanvas Mail 迎来搜索与标签引擎大版本升级',
    """<div style="font-family:-apple-system,'Segoe UI',sans-serif;max-width:640px">
<div style="background:linear-gradient(135deg,#1967D2,#3b82f6);border-radius:12px 12px 0 0;padding:22px 26px;color:#fff">
  <div style="font-size:13px;opacity:.85;letter-spacing:.12em">EPOCANVAS MAIL · 全域公告</div>
  <div style="font-size:21px;font-weight:700;margin-top:6px">搜索与标签引擎大版本升级</div>
</div>
<div style="border:1px solid #e5e7eb;border-top:0;border-radius:0 0 12px 12px;padding:22px 26px;line-height:1.75;color:#13181D">
  <p>亲爱的站长，您好：</p>
  <p>本次升级为全部实例带来以下改进：</p>
  <ul>
    <li><b>搜索语法</b>：新增 <code style="background:#eef2ff;padding:1px 6px;border-radius:4px">from:</code> / <code style="background:#eef2ff;padding:1px 6px;border-radius:4px">larger:</code> / <code style="background:#eef2ff;padding:1px 6px;border-radius:4px">is:starred</code> 等 12 个检索算子；</li>
    <li><b>标签规则引擎</b>：按发件域、主题关键词自动归类，规则可自定义；</li>
    <li><b>垃圾邮件隔离</b>：隔离区邮件保留 7 日后自动转入回收站。</li>
  </ul>
  <p style="color:#6b7280;font-size:13px">此邮件由系统站长 (announcement@epocanvas.com) 统一发布 · 祝您使用愉快！</p>
</div></div>""", when='-26 hours'))

# —— 工作 ——
A(mail('lin.wei@epomail.bond', '林伟',
    '本周发布评审会改到周四 15:00（含议程）',
    """<div style="font-family:-apple-system,'Segoe UI',sans-serif;line-height:1.8;color:#13181D">
<p>Hi 站长，</p>
<p>因与 Cloudflare 社区活动冲突，本周发布评审会调整至 <b style="color:#1967D2">周四 15:00–16:00</b>，会议链接不变。议程如下：</p>
<ol>
  <li>v5.9 候选特性清单评审（15 分钟）</li>
  <li>附件级联删除回归结论（10 分钟）</li>
  <li>Workers AI 验证码提取准确率数据（10 分钟）</li>
</ol>
<p style="color:#6b7280;font-size:13px">—— 林伟 · EpoCanvas 运营团队</p>
</div>""", labels=L_WORK, when='-3 hours'))
A(mail('noreply@github.com', 'GitHub',
    '[epocanvas-mail] PR #482「feat: 级联删除分块加固」请求你的评审',
    """<div style="font-family:-apple-system,'Segoe UI',sans-serif;line-height:1.7;color:#13181D">
<div style="border:1px solid #d0d7de;border-radius:8px;overflow:hidden">
<div style="background:#f6f8fa;padding:12px 16px;border-bottom:1px solid #d0d7de">
  <b>epomail</b> · <span style="color:#57606a">epocanvas-mail</span>
</div>
<div style="padding:16px">
  <p style="margin:0 0 8px"><span style="background:#1a7f37;color:#fff;border-radius:10px;padding:2px 8px;font-size:12px">PR #482</span> <b>fix(core): 级联删除分块加固——规避 D1 单语句 100 绑定参数上限</b></p>
  <p style="color:#57606a;margin:0">@shijianus 请求你对本次改动进行评审：</p>
  <ul style="color:#57606a">
    <li>email-service.js：实体删除按 CHUNK=50 分批执行</li>
    <li>新增 19/19 证据测试全绿</li>
  </ul>
</div></div></div>""", labels=L_WORK, when='-5 hours'))
A(mail('ci@epomail.bond', 'CI 机器人',
    '构建成功：mail-vue 55 页 · 测试 106/106 全绿',
    """<div style="font-family:ui-monospace,SFMono-Regular,monospace;line-height:1.8;background:#0d1117;color:#e6edf3;border-radius:10px;padding:18px">
<div style="color:#3fb950">✔ build —— 55 页 · 0 警告 · 0 报错 <span style="color:#8b949e">(41.2s)</span></div>
<div style="color:#3fb950">✔ tests —— 106/106 全绿 <span style="color:#8b949e">(2m 18s)</span></div>
<div style="color:#3fb950">✔ i18n 对称 —— 6 语言键集一致</div>
<div style="color:#8b949e">分支：master · 提交：4c094f2</div>
</div>""", labels=L_WORK, unread=0, when='-8 hours'))
A(mail('pm@epomail.bond', '陈静',
    'Q4 路线图草案：移动端 PWA 推送与离线草稿',
    """<div style="font-family:-apple-system,'Segoe UI',sans-serif;line-height:1.8;color:#13181D">
<p>草案已放入共享文档，摘要：</p>
<table style="border-collapse:collapse;width:100%">
<tr style="background:#f3f4f6"><th style="border:1px solid #e5e7eb;padding:8px">里程碑</th><th style="border:1px solid #e5e7eb;padding:8px">内容</th><th style="border:1px solid #e5e7eb;padding:8px">目标</th></tr>
<tr><td style="border:1px solid #e5e7eb;padding:8px">M1</td><td style="border:1px solid #e5e7eb;padding:8px">Web Push 订阅</td><td style="border:1px solid #e5e7eb;padding:8px">10 月底</td></tr>
<tr><td style="border:1px solid #e5e7eb;padding:8px">M2</td><td style="border:1px solid #e5e7eb;padding:8px">离线草稿（IndexedDB）</td><td style="border:1px solid #e5e7eb;padding:8px">11 月中</td></tr>
</table>
<p>请于周四会前批注。</p></div>""", labels=L_WORK, unread=0, when='-1 days'))

# —— 验证码（code 字段，界面显示验证码提取徽标）——
A(mail('noreply@cloudflare.com', 'Cloudflare',
    '您的验证码：482913',
    """<div style="font-family:-apple-system,'Segoe UI',sans-serif;max-width:520px;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden">
<div style="padding:20px 24px;line-height:1.7;color:#13181D">
  <p style="margin:0 0 12px">您好，请在登录页面输入以下验证码完成验证：</p>
  <div style="background:#f0f6ff;border:1px dashed #1967D2;border-radius:10px;text-align:center;font-size:34px;letter-spacing:.35em;font-weight:700;color:#1967D2;padding:16px 0">482913</div>
  <p style="color:#6b7280;font-size:13px;margin-top:14px">验证码 10 分钟内有效。若非本人操作，请忽略本邮件。</p>
</div></div>""", code='482913', when='-40 minutes'))
A(mail('noreply@linux.do', 'Linux DO',
    'Linux DO 登录确认：6 位数验证码 735 210',
    """<div style="font-family:-apple-system,'Segoe UI',sans-serif;line-height:1.8;color:#13181D">
<p>有人正尝试使用 Linux DO 账号登录 EpoCanvas Mail。验证码：</p>
<div style="font-size:30px;font-weight:700;letter-spacing:.3em;color:#f59e0b">735210</div>
<p style="color:#6b7280;font-size:13px">若非本人操作，请立即修改密码并启用两步验证。</p></div>""", code='735210', unread=0, when='-1 days'))

# —— 社群 ——
A(mail('kevin.dev@gmail.com', 'Kevin Zhao',
    'Re: EpoCanvas Mail 自部署体验反馈（附配置片段）',
    """<div style="font-family:-apple-system,'Segoe UI',sans-serif;line-height:1.8;color:#13181D">
<p>站长你好！按文档完成了自部署，全流程 20 分钟不到，体验非常顺滑 👍</p>
<p>分享两个建议：</p>
<ol><li>BYOS 的 Backblaze B2 端点兼容性可以在文档里补个示例；</li>
<li>希望标签规则支持「正则匹配主题」。</li></ol>
<p style="background:#f6f8fa;border-left:3px solid #3b82f6;padding:10px 14px;border-radius:6px;color:#374151;font-size:13px">已稳定运行 14 天，收发 1,203 封，零丢信。</p></div>""", labels=L_COM, when='-6 hours'))
A(mail('sarah_w@outlook.com', 'Sarah Williams',
    '社区每周精选：三个自部署实例的运营心得',
    """<div style="font-family:-apple-system,'Segoe UI',sans-serif;line-height:1.8;color:#13181D">
<p>本周社区亮点：</p>
<ul>
<li><b>@mikko</b>：用 Workers Cron 实现附件配额日报；</li>
<li><b>@小鹿</b>：给家庭成员每人一个信箱的极简方案；</li>
<li><b>@devon</b>：Turnstile 人机验证阈值调优记录。</li>
</ul>
<p style="color:#6b7280;font-size:13px">—— 来自 EpoCanvas Mail 社区周刊</p></div>""", labels=L_COM, unread=0, when='-2 days'))

# —— 订阅 ——
A(mail('digest@workers-weekly.dev', 'Workers Weekly',
    '本期焦点：D1 全文检索实践与 Workers AI 定价更新',
    """<div style="font-family:-apple-system,'Segoe UI',sans-serif;line-height:1.8;color:#13181D">
<div style="border-left:4px solid #10b981;padding-left:14px">
<p><b>① D1 全文检索实践</b> —— FTS5 虚拟表在边缘数据库中的落地方案；</p>
<p><b>② Workers AI 定价更新</b> —— llama-3.1-8b 每百万 token 价格下调 22%；</p>
<p><b>③ 社区问答</b> —— Email Routing 与子地址（+tag）的最佳实践。</p>
</div>
<p style="color:#6b7280;font-size:13px">您收到本邮件是因为订阅了 Workers Weekly · 随时可在来源站点退订。</p></div>""", labels=L_SUB, when='-9 hours'))
A(mail('updates@figma.design', 'Figma',
    '产品更新：变量与开发模式迎来 12 项改进',
    """<div style="font-family:-apple-system,'Segoe UI',sans-serif;line-height:1.8;color:#13181D">
<p>本月更新速览：</p>
<p>🎨 变量支持多主题切换 · 🔧 开发模式批注导出 · 📐 自动布局增强</p>
<p style="color:#6b7280;font-size:13px">点击此处管理您的订阅偏好。</p></div>""", labels=L_SUB, unread=0, when='-2 days'))

# —— 推销 ——
A(mail('promo@megastore.shop', 'MegaStore 年中庆',
    '⏰ 最后 6 小时：全场满 300 减 120，会员叠加 95 折',
    """<div style="font-family:-apple-system,'Segoe UI',sans-serif;max-width:560px;text-align:center;border:1px solid #fde68a;border-radius:14px;overflow:hidden">
<div style="background:linear-gradient(135deg,#f59e0b,#ef4444);color:#fff;padding:26px">
  <div style="font-size:26px;font-weight:800">年中庆典 · 倒计时</div>
  <div style="font-size:15px;opacity:.92;margin-top:6px">全场满 300 减 120 · 会员再享 95 折</div>
</div>
<div style="padding:18px;color:#13181D">热门品类：机械键盘 · 显示器 · 键盘轴体<br>
<span style="color:#6b7280;font-size:12px">若不希望再收到推广邮件，可退订。</span></div></div>""", labels=L_ADS, unread=0, when='-30 hours'))
A(mail('deals@bookworm.store', 'Bookworm 书店',
    '科技图书节：架构与工程类 5 折起',
    """<div style="font-family:-apple-system,'Segoe UI',sans-serif;line-height:1.8;color:#13181D">
<p>📚 本周科技图书节：</p>
<p>《设计与数据密集型应用》5 折 · 《Clean Architecture》6 折</p>
<p style="color:#6b7280;font-size:13px">退订请回复本邮件。</p></div>""", labels=L_ADS, unread=0, when='-3 days'))

# —— 个人 / 通用 ——
A(mail('yuki.tanaka@gmail.com', 'Yuki Tanaka',
    '周末远足拍照整理好了（九张精选）',
    """<div style="font-family:-apple-system,'Segoe UI',sans-serif;line-height:1.8;color:#13181D">
<p>上周六的郊野公园照片挑了九张，都传到相册了！</p>
<p>🌅 日出那张构图最好，回头印一张送你。</p>
<p>下周三晚上一起吃饭？</p></div>""", labels=L_COM, when='-4 hours'))
A(mail('fly@tripplan.io', 'TripPlan 行程助手',
    '行程确认：10 月 18 日 TPE → NRT 机票与酒店凭据',
    """<div style="font-family:-apple-system,'Segoe UI',sans-serif;max-width:600px;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;line-height:1.7;color:#13181D">
<div style="background:#111827;color:#fff;padding:16px 22px;font-weight:700">✈ 行程确认单</div>
<div style="padding:18px 22px">
<p style="margin:0 0 6px"><b>TPE → NRT</b> · 10 月 18 日 08:35 起飞</p>
<p style="margin:0 0 6px">预订编号：<b>EP-20261018-7742</b> · 座位 32F</p>
<p style="margin:0">酒店：新宿格拉斯丽 · 10 月 18–21 日</p>
</div></div>""", labels='[]', unread=0, when='-2 days'))

# —— 已发送（type=1）——
A(mail('admin@epomail.bond', '站长',
    'Re: 自部署体验反馈已收到，正则规则已进路线图',
    """<div style="font-family:-apple-system,'Segoe UI',sans-serif;line-height:1.8;color:#13181D">
<p>Kevin 你好，反馈已收到！</p>
<p>正则匹配主题已列入标签规则引擎路线图（预计下个版本），B2 示例文档本周补充。感谢支持 🙌</p></div>""",
    to='kevin.dev@gmail.com', to_name='Kevin Zhao', typ=1, unread=0, when='-5 hours'))

# —— 垃圾邮件（隔离区）——
A(mail('winner@lucky-draw.biz', 'Lucky Draw',
    '恭喜您中得第二大奖！点击领取 8,888 元现金红包',
    """<div style="font-family:-apple-system,'Segoe UI',sans-serif;line-height:1.8;color:#13181D">
<p style="font-size:18px;color:#dc2626"><b>🎊 恭喜！您的邮箱被抽中为今日幸运用户！</b></p>
<p>点击下方链接立即领取 8,888 元现金红包，名额有限！</p>
<p style="color:#6b7280;font-size:13px">（系统已自动隔离此邮件）</p></div>""", spam=1, unread=0, when='-10 hours'))
A(mail('cloudflare-support@secure-verify.top', '账户安全中心',
    '紧急：您的账户存在异常登录，请立即验证',
    """<div style="font-family:-apple-system,'Segoe UI',sans-serif;line-height:1.8;color:#13181D">
<p>您的账户检测到异常异地登录，请立即点击链接验证身份，否则将被冻结。</p>
<p style="color:#6b7280;font-size:13px">（系统已自动隔离此冒名邮件）</p></div>""", spam=1, unread=0, when='-1 days'))

# —— 回收站 ——
A(mail('old@legacy-crm.net', 'Legacy CRM',
    '系统升级完成通知（2024 版）',
    """<div style="font-family:-apple-system,'Segoe UI',sans-serif;line-height:1.8;color:#9ca3af">
<p>旧版 CRM 系统升级完成，此邮件已过期并被移入回收站。</p></div>""", dele=1, unread=0, when='-6 days'))

# —— 稍后处理（延后提醒，+2 天）——
A(mail('review@journal-cs.org', 'Journal of CS Systems',
    '审稿邀请：Manuscript #EC-1187（请于 10 月 12 日前响应）',
    """<div style="font-family:-apple-system,'Segoe UI',sans-serif;line-height:1.8;color:#13181D">
<p>尊敬的专家，现邀请您审阅稿件 <b>「Edge-Native Mail Storage: A D1 Perspective」</b>。</p>
<p>响应截止：10 月 12 日。您已将此邀请延后处理。</p></div>""", labels=L_WORK, unread=0, when='-2 days', snooze='+2 days'))

values = "\n".join(rows).rstrip(',')

sql = f"""-- 本地演示数据（仅存在于 .wrangler/state 本地状态，不入库、不进生产）
DELETE FROM email WHERE user_id = {USER_ID};
DELETE FROM star WHERE user_id = {USER_ID};
INSERT INTO email (type, account_id, user_id, send_email, name, to_email, to_name, subject, content, text, code, labels, unread, is_spam, is_del, create_time, cc, snoozed_time)
VALUES
{values};
"""
Path(__file__).parent.joinpath("demo-seed.sql").write_text(sql, encoding="utf-8")
print(f"demo-seed.sql written with {len(rows)} mails (user {USER_ID}, account {ACCOUNT_ID})")
