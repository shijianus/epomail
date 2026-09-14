// Client-side multilingual welcome email templates
export const WELCOME_TEMPLATES = {
  zh: {
    lang: 'zh',
    name: '中文 (简体)',
    subject: "🎉 欢迎来到 Epocanvas Mail · 开启你的专属独立域名邮箱体验",
    content: `<div style="width: 100%; max-width: 100%; box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', Roboto, Helvetica, Arial, sans-serif; color: #1e293b; line-height: 1.6; background: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 10px 35px -6px rgba(0, 0, 0, 0.08);">
  <!-- Top Full-Width Banner with Microsoft Azure Gradient & Official EpoMail Brand Logo -->
  <div style="background: linear-gradient(135deg, #0078D4 0%, #0284c7 35%, #2563eb 70%, #4338ca 100%); padding: 40px 42px 34px; text-align: left; position: relative;">
    <div style="display: flex; align-items: center; justify-content: space-between; gap: 24px; flex-wrap: wrap;">
      <div style="flex: 1; min-width: 300px;">
        <div style="display: inline-flex; align-items: center; gap: 8px; background: rgba(255, 255, 255, 0.22); border: 1px solid rgba(255, 255, 255, 0.35); padding: 5px 14px; border-radius: 20px; color: #ffffff; font-size: 13px; font-weight: 600; margin-bottom: 14px; backdrop-filter: blur(8px);">
          <span>✨ 你的专属独立域名邮箱已就绪</span>
        </div>
        <h1 style="margin: 0; color: #ffffff; font-size: 26px; font-weight: 800; letter-spacing: -0.02em; line-height: 1.35;">嗨 {{user_name}}，很高兴认识你！</h1>
        <p style="margin: 10px 0 0; color: rgba(255, 255, 255, 0.95); font-size: 14.5px; line-height: 1.55;">零门槛免配置 · 纯净无广告 · 国内极速秒开 · 专属极客身份</p>
      </div>
      <!-- Official EpoMail Cloud Logo SVG Artwork -->
      <div style="flex-shrink: 0; display: flex; align-items: center; justify-content: center; width: 92px; height: 92px; background: rgba(255, 255, 255, 0.18); border-radius: 22px; border: 1.5px solid rgba(255, 255, 255, 0.38); box-shadow: 0 10px 28px rgba(0, 0, 0, 0.18); backdrop-filter: blur(10px);">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="76" height="76" style="display:block; flex-shrink:0;">
          <defs>
            <linearGradient id="epomailLogoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#00F5D4" />
              <stop offset="40%" stop-color="#0072FF" />
              <stop offset="100%" stop-color="#5B24FF" />
            </linearGradient>
            <mask id="epomailCutout">
              <rect width="100%" height="100%" fill="white" />
              <path d="M 15 210 L 200 270 L 385 210" fill="none" stroke="black" stroke-width="12" stroke-linecap="round" stroke-linejoin="round" />
              <line x1="60" y1="320" x2="140" y2="280" stroke="black" stroke-width="10" stroke-linecap="round" />
              <line x1="340" y1="320" x2="260" y2="280" stroke="black" stroke-width="10" stroke-linecap="round" />
              <circle cx="200" cy="270" r="26" fill="white" />
              <circle cx="200" cy="270" r="26" fill="none" stroke="black" stroke-width="10" />
              <circle cx="200" cy="270" r="4.5" fill="black" />
              <line x1="200" y1="270" x2="188" y2="258" stroke="black" stroke-width="7" stroke-linecap="round" />
              <line x1="200" y1="270" x2="215" y2="258" stroke="black" stroke-width="7" stroke-linecap="round" />
            </mask>
          </defs>
          <path d="M 60 110 Q 70 110 70 100 Q 70 110 80 110 Q 70 110 70 120 Q 70 110 60 110 Z" fill="#00F5D4" opacity="0.85" />
          <path d="M 330 90 Q 335 90 335 85 Q 335 90 340 90 Q 335 90 335 95 Q 335 90 330 90 Z" fill="#FF369B" opacity="0.9" />
          <circle cx="85" cy="180" r="2.5" fill="#5B24FF" opacity="0.6" />
          <circle cx="320" cy="180" r="3" fill="#0072FF" opacity="0.7" />
          <path d="M 40 220 A 60 60 0 0 1 120 155 A 85 85 0 0 1 280 155 A 60 60 0 0 1 360 220 L 360 260 C 360 325 290 335 200 335 C 110 335 40 325 40 260 Z" fill="url(#epomailLogoGrad)" mask="url(#epomailCutout)" />
        </svg>
      </div>
    </div>
  </div>

  <div style="padding: 36px 42px 34px;">
    <p style="font-size: 16px; color: #0f172a; margin-top: 0; font-weight: 700;">嗨 {{user_name}}，欢迎加入 Epocanvas Mail！</p>
    <p style="font-size: 14.5px; color: #475569; line-height: 1.8; margin: 0 0 28px;">
      很高兴能在这里与你相遇。这是一个由开发者精心搭建并免费开放给大家使用的专属独立域名邮箱。我们把底层复杂的域名购买、DNS 解析、MX/SPF 记录和云端服务器全部打包搞定——你不需要懂任何繁琐的技术，注册好就能直接拥有一张专属的高颜值域名名片。你的专属邮箱（{{user_email}}）已经准备好了！快来看看我们为你准备的贴心功能与上手指南吧：
    </p>

    <!-- 5 Alternating Zigzag Storytelling Value Sections -->
    <div style="margin: 28px 0; display: flex; flex-direction: column; gap: 20px;">
      
      <!-- Section 1 (Zigzag: Text Left, Illustration Right) -->
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 32px; background: linear-gradient(135deg, #f0f7ff 0%, #ffffff 100%); border: 1px solid #bfdbfe; border-radius: 16px; padding: 24px 28px; box-shadow: 0 4px 16px rgba(0, 120, 212, 0.05); flex-wrap: wrap;">
        <div style="flex: 1; min-width: 280px;">
          <div style="display: inline-flex; align-items: center; gap: 6px; background: rgba(0, 120, 212, 0.1); border: 1px solid rgba(0, 120, 212, 0.25); padding: 4px 12px; border-radius: 9999px; color: #0078D4; font-size: 12.5px; font-weight: 700; margin-bottom: 10px;">
            🌐 专属极客名片 · 免买域名免配置
          </div>
          <h3 style="font-size: 17.5px; font-weight: 800; color: #0f172a; margin: 0 0 8px;">无需折腾 DNS 与 MX 解析，即刻拥有专属身份</h3>
          <p style="font-size: 13.5px; color: #475569; line-height: 1.7; margin: 0 0 14px;">
            告别繁琐复杂的域名购买与解析配置。在 Epocanvas Mail，直接拥有 <code style="background: #e0f2fe; color: #0284c7; font-weight: 700; padding: 2px 8px; border-radius: 6px; font-size: 13px;">{{user_name}}@专属域名</code> 这样酷炫的邮箱地址，求职简历、技术交流或日常通讯，专业范与极客感瞬间拉满。
          </p>
          <div>
            <span style="background: #e2e8f0; color: #334155; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600; margin-right: 8px;">✨ 零门槛即开即用</span>
            <span style="background: #e2e8f0; color: #334155; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600;">🏷️ 多顶级域名随心选</span>
          </div>
        </div>
        <div style="width: 300px; flex-shrink: 0; display: flex; align-items: center; justify-content: center;">
          <svg width="100%" height="150" viewBox="0 0 320 180" fill="none" xmlns="http://www.w3.org/2000/svg" style="max-width: 300px; display: block; margin: 0 auto;">
            <rect width="320" height="180" rx="12" fill="#F8FAFC" stroke="#E2E8F0" stroke-width="1.5"/>
            <rect x="0" y="0" width="320" height="36" rx="12" fill="#FFFFFF"/>
            <rect x="0" y="24" width="320" height="12" fill="#FFFFFF"/>
            <line x1="0" y1="36" x2="320" y2="36" stroke="#E2E8F0" stroke-width="1"/>
            <circle cx="16" cy="18" r="4" fill="#EF4444"/>
            <circle cx="28" cy="18" r="4" fill="#F59E0B"/>
            <circle cx="40" cy="18" r="4" fill="#10B981"/>
            <rect x="56" y="8" width="248" height="20" rx="6" fill="#F1F5F9"/>
            <circle cx="68" cy="18" r="3" fill="#10B981"/>
            <text x="78" y="22" fill="#0284C7" font-size="10" font-weight="600" font-family="monospace">https://epomail.bond/@me</text>
            <rect x="20" y="52" width="280" height="110" rx="10" fill="#FFFFFF" stroke="#CBD5E1" stroke-width="1.2" filter="drop-shadow(0 4px 12px rgba(0,0,0,0.04))"/>
            <circle cx="50" cy="86" r="18" fill="#0078D4"/>
            <text x="50" y="92" fill="#FFFFFF" font-size="13" font-weight="800" text-anchor="middle">@</text>
            <text x="80" y="80" fill="#0F172A" font-size="13" font-weight="700">专属极客域名名片</text>
            <text x="80" y="96" fill="#64748B" font-size="11" font-weight="500" font-family="monospace">user@epomail.bond</text>
            <rect x="220" y="70" width="64" height="20" rx="10" fill="#ECFDF5" stroke="#A7F3D0" stroke-width="1"/>
            <text x="252" y="84" fill="#059669" font-size="10" font-weight="700" text-anchor="middle">● DNS 激活</text>
            <line x1="32" y1="120" x2="288" y2="120" stroke="#F1F5F9" stroke-width="1"/>
            <rect x="32" y="130" width="76" height="18" rx="4" fill="#EFF6FF"/>
            <text x="70" y="143" fill="#0078D4" font-size="9.5" font-weight="600" text-anchor="middle">SPF 权威验证</text>
            <rect x="116" y="130" width="80" height="18" rx="4" fill="#EFF6FF"/>
            <text x="156" y="143" fill="#0078D4" font-size="9.5" font-weight="600" text-anchor="middle">DKIM 密钥签发</text>
            <rect x="204" y="130" width="76" height="18" rx="4" fill="#EFF6FF"/>
            <text x="242" y="143" fill="#0078D4" font-size="9.5" font-weight="600" text-anchor="middle">DMARC 100%</text>
          </svg>
        </div>
      </div>

      <!-- Section 2 (Zigzag: Illustration Left, Text Right) -->
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 32px; background: linear-gradient(135deg, #ecfdf5 0%, #ffffff 100%); border: 1px solid #a7f3d0; border-radius: 16px; padding: 24px 28px; box-shadow: 0 4px 16px rgba(16, 185, 129, 0.05); flex-wrap: wrap;">
        <div style="width: 300px; flex-shrink: 0; display: flex; align-items: center; justify-content: center;">
          <svg width="100%" height="150" viewBox="0 0 320 180" fill="none" xmlns="http://www.w3.org/2000/svg" style="max-width: 300px; display: block; margin: 0 auto;">
            <rect width="320" height="180" rx="12" fill="#F8FAFC" stroke="#E2E8F0" stroke-width="1.5"/>
            <rect x="0" y="0" width="320" height="36" rx="12" fill="#FFFFFF"/>
            <rect x="0" y="24" width="320" height="12" fill="#FFFFFF"/>
            <line x1="0" y1="36" x2="320" y2="36" stroke="#E2E8F0" stroke-width="1"/>
            <circle cx="16" cy="18" r="4" fill="#10B981"/>
            <text x="28" y="22" fill="#0F172A" font-size="11" font-weight="700">隐私与数据安全监控台</text>
            <rect x="236" y="8" width="68" height="20" rx="10" fill="#ECFDF5" stroke="#A7F3D0" stroke-width="1"/>
            <text x="270" y="22" fill="#059669" font-size="10" font-weight="700" text-anchor="middle">100% 私密</text>
            <rect x="18" y="50" width="136" height="52" rx="8" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="1.2"/>
            <text x="30" y="70" fill="#64748B" font-size="10" font-weight="600">商业广告扫描</text>
            <text x="30" y="90" fill="#059669" font-size="14" font-weight="800">0 追踪 / 0 广告</text>
            <rect x="166" y="50" width="136" height="52" rx="8" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="1.2"/>
            <text x="178" y="70" fill="#64748B" font-size="10" font-weight="600">传输加密标准</text>
            <text x="178" y="90" fill="#0078D4" font-size="14" font-weight="800">TLS 1.3 / AES</text>
            <rect x="18" y="112" width="284" height="50" rx="8" fill="#ECFDF5" stroke="#A7F3D0" stroke-width="1.2"/>
            <circle cx="38" cy="137" r="10" fill="#059669"/>
            <path d="M34 137L37 140L42 134" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <text x="56" y="134" fill="#065F46" font-size="11.5" font-weight="700">绝不向第三方出售用户数据与信件画像</text>
            <text x="56" y="149" fill="#047857" font-size="10" font-weight="500">零开屏 · 零弹窗 · 纯粹邮箱通讯本位</text>
          </svg>
        </div>
        <div style="flex: 1; min-width: 280px;">
          <div style="display: inline-flex; align-items: center; gap: 6px; background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.25); padding: 4px 12px; border-radius: 9999px; color: #059669; font-size: 12.5px; font-weight: 700; margin-bottom: 10px;">
            🛡️ 纯粹私密 · 零广告零商业变现
          </div>
          <h3 style="font-size: 17.5px; font-weight: 800; color: #0f172a; margin: 0 0 8px;">无开屏、不弹窗，绝不窥探你的邮件隐私</h3>
          <p style="font-size: 13.5px; color: #475569; line-height: 1.7; margin: 0 0 14px;">
            我们坚守邮箱通讯最纯粹的本质。没有令人烦躁的开屏广告、横幅推广和垃圾营销弹窗；后台绝不对你的信件做商业挖掘或行为画像分析，给你一个干净、清爽、安心的专属通讯空间。
          </p>
          <div>
            <span style="background: #d1fae5; color: #065f46; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600; margin-right: 8px;">🚫 纯净零弹窗</span>
            <span style="background: #d1fae5; color: #065f46; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600;">🔒 隐私绝不商用</span>
          </div>
        </div>
      </div>

      <!-- Section 3 (Zigzag: Text Left, Illustration Right) -->
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 32px; background: linear-gradient(135deg, #fffbeb 0%, #ffffff 100%); border: 1px solid #fde68a; border-radius: 16px; padding: 24px 28px; box-shadow: 0 4px 16px rgba(245, 158, 11, 0.05); flex-wrap: wrap;">
        <div style="flex: 1; min-width: 280px;">
          <div style="display: inline-flex; align-items: center; gap: 6px; background: rgba(245, 158, 11, 0.1); border: 1px solid rgba(245, 158, 11, 0.25); padding: 4px 12px; border-radius: 9999px; color: #d97706; font-size: 12.5px; font-weight: 700; margin-bottom: 10px;">
            ⚡ 全球边缘网络 · 国内极速秒开
          </div>
          <h3 style="font-size: 17.5px; font-weight: 800; color: #0f172a; margin: 0 0 8px;">Cloudflare 全球边缘 CDN 直连，无需代理毫秒响应</h3>
          <p style="font-size: 13.5px; color: #475569; line-height: 1.7; margin: 0 0 14px;">
            基于全球 300+ 边缘节点与国内高速 CDN 加速。无论你在哪里，无需开启任何代理工具，邮件毫秒级秒开加载、全球各大邮箱秒级送达，随时随地稳定顺畅不失联。
          </p>
          <div>
            <span style="background: #fef3c7; color: #92400e; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600; margin-right: 8px;">🚀 毫秒级秒开</span>
            <span style="background: #fef3c7; color: #92400e; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600;">🌍 全球边缘直达</span>
          </div>
        </div>
        <div style="width: 300px; flex-shrink: 0; display: flex; align-items: center; justify-content: center;">
          <svg width="100%" height="150" viewBox="0 0 320 180" fill="none" xmlns="http://www.w3.org/2000/svg" style="max-width: 300px; display: block; margin: 0 auto;">
            <rect width="320" height="180" rx="12" fill="#F8FAFC" stroke="#E2E8F0" stroke-width="1.5"/>
            <rect x="0" y="0" width="320" height="36" rx="12" fill="#FFFFFF"/>
            <rect x="0" y="24" width="320" height="12" fill="#FFFFFF"/>
            <line x1="0" y1="36" x2="320" y2="36" stroke="#E2E8F0" stroke-width="1"/>
            <circle cx="16" cy="18" r="4" fill="#F59E0B"/>
            <text x="28" y="22" fill="#0F172A" font-size="11" font-weight="700">全球边缘 CDN 网络直连</text>
            <rect x="236" y="8" width="68" height="20" rx="10" fill="#FEF3C7" stroke="#FDE68A" stroke-width="1"/>
            <text x="270" y="22" fill="#D97706" font-size="10" font-weight="700" text-anchor="middle">⚡ &lt; 20ms</text>
            <rect x="18" y="50" width="284" height="112" rx="8" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="1.2"/>
            <line x1="60" y1="106" x2="160" y2="106" stroke="#0078D4" stroke-width="2" stroke-dasharray="4 3"/>
            <line x1="160" y1="106" x2="260" y2="106" stroke="#10B981" stroke-width="2"/>
            <circle cx="60" cy="106" r="16" fill="#EFF6FF" stroke="#0078D4" stroke-width="1.5"/>
            <text x="60" y="110" fill="#0078D4" font-size="11" font-weight="800" text-anchor="middle">用户</text>
            <text x="60" y="138" fill="#64748B" font-size="9.5" font-weight="600" text-anchor="middle">国内直连</text>
            <circle cx="160" cy="106" r="20" fill="#FEF3C7" stroke="#F59E0B" stroke-width="1.8"/>
            <text x="160" y="109" fill="#D97706" font-size="10" font-weight="800" text-anchor="middle">EDGE</text>
            <text x="160" y="120" fill="#B45309" font-size="8" font-weight="700" text-anchor="middle">CDN</text>
            <text x="160" y="144" fill="#D97706" font-size="9.5" font-weight="700" text-anchor="middle">300+ 节点</text>
            <circle cx="260" cy="106" r="16" fill="#ECFDF5" stroke="#10B981" stroke-width="1.5"/>
            <text x="260" y="110" fill="#059669" font-size="11" font-weight="800" text-anchor="middle">全球</text>
            <text x="260" y="138" fill="#64748B" font-size="9.5" font-weight="600" text-anchor="middle">秒级送达</text>
          </svg>
        </div>
      </div>

      <!-- Section 4 (Zigzag: Illustration Left, Text Right) -->
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 32px; background: linear-gradient(135deg, #f5f3ff 0%, #ffffff 100%); border: 1px solid #ddd6fe; border-radius: 16px; padding: 24px 28px; box-shadow: 0 4px 16px rgba(124, 58, 237, 0.05); flex-wrap: wrap;">
        <div style="width: 300px; flex-shrink: 0; display: flex; align-items: center; justify-content: center;">
          <svg width="100%" height="150" viewBox="0 0 320 180" fill="none" xmlns="http://www.w3.org/2000/svg" style="max-width: 300px; display: block; margin: 0 auto;">
            <rect width="320" height="180" rx="12" fill="#F8FAFC" stroke="#E2E8F0" stroke-width="1.5"/>
            <rect x="0" y="0" width="320" height="36" rx="12" fill="#FFFFFF"/>
            <rect x="0" y="24" width="320" height="12" fill="#FFFFFF"/>
            <line x1="0" y1="36" x2="320" y2="36" stroke="#E2E8F0" stroke-width="1"/>
            <circle cx="16" cy="18" r="4" fill="#7C3AED"/>
            <text x="28" y="22" fill="#0F172A" font-size="11" font-weight="700">智能收件箱代办流</text>
            <rect x="226" y="8" width="78" height="20" rx="10" fill="#EDE9FE" stroke="#DDD6FE" stroke-width="1"/>
            <text x="265" y="22" fill="#6D28D9" font-size="10" font-weight="700" text-anchor="middle">⏰ 稍后代办</text>
            <rect x="18" y="48" width="284" height="34" rx="6" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="1.2"/>
            <circle cx="34" cy="65" r="5" fill="#7C3AED"/>
            <text x="48" y="69" fill="#0F172A" font-size="11" font-weight="700">项目周报与架构评审</text>
            <rect x="220" y="55" width="72" height="20" rx="4" fill="#F5F3FF"/>
            <text x="256" y="69" fill="#7C3AED" font-size="9.5" font-weight="700" text-anchor="middle">⏰ 明天 09:00</text>
            <rect x="18" y="88" width="284" height="34" rx="6" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="1.2"/>
            <circle cx="34" cy="105" r="5" fill="#F59E0B"/>
            <text x="48" y="109" fill="#0F172A" font-size="11" font-weight="700">GitHub 安全警报通知</text>
            <rect x="220" y="95" width="72" height="20" rx="4" fill="#FEF3C7"/>
            <text x="256" y="109" fill="#D97706" font-size="9.5" font-weight="700" text-anchor="middle">⭐ 重要星标</text>
            <rect x="18" y="128" width="284" height="36" rx="6" fill="#F1F5F9" stroke="#CBD5E1" stroke-width="1"/>
            <text x="32" y="151" fill="#64748B" font-size="11" font-family="monospace">🔍 毫秒级全文即时检索...</text>
            <rect x="238" y="134" width="54" height="24" rx="4" fill="#0078D4"/>
            <text x="265" y="150" fill="#FFFFFF" font-size="10" font-weight="700" text-anchor="middle">回车检索</text>
          </svg>
        </div>
        <div style="flex: 1; min-width: 280px;">
          <div style="display: inline-flex; align-items: center; gap: 6px; background: rgba(124, 58, 237, 0.1); border: 1px solid rgba(124, 58, 237, 0.25); padding: 4px 12px; border-radius: 9999px; color: #7c3aed; font-size: 12.5px; font-weight: 700; margin-bottom: 10px;">
            📥 进阶工作流 · 极简轻快
          </div>
          <h3 style="font-size: 17.5px; font-weight: 800; color: #0f172a; margin: 0 0 8px;">稍后处理 (Snooze)、星标代办与全文即时检索</h3>
          <p style="font-size: 13.5px; color: #475569; line-height: 1.7; margin: 0 0 14px;">
            内置现代高效的工作流体验。重要的信件可以一键设为稍后提醒（Snooze），配合星标代办归档、自定义分类标签与全文即时检索，即使面对成百上千封邮件也能游刃有余、井井有条。
          </p>
          <div>
            <span style="background: #ede9fe; color: #5b21b6; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600; margin-right: 8px;">⏰ 稍后处理代办</span>
            <span style="background: #ede9fe; color: #5b21b6; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600;">⭐ 星标快捷归档</span>
          </div>
        </div>
      </div>

      <!-- Section 5 (Zigzag: Text Left, Illustration Right) -->
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 32px; background: linear-gradient(135deg, #fff1f2 0%, #ffffff 100%); border: 1px solid #fecdd3; border-radius: 16px; padding: 24px 28px; box-shadow: 0 4px 16px rgba(225, 29, 72, 0.05); flex-wrap: wrap;">
        <div style="flex: 1; min-width: 280px;">
          <div style="display: inline-flex; align-items: center; gap: 6px; background: rgba(225, 29, 72, 0.1); border: 1px solid rgba(225, 29, 72, 0.25); padding: 4px 12px; border-radius: 9999px; color: #e11d48; font-size: 12.5px; font-weight: 700; margin-bottom: 10px;">
            🔀 别名隔离 · 垃圾邮件一键熔断
          </div>
          <h3 style="font-size: 17.5px; font-weight: 800; color: #0f172a; margin: 0 0 8px;">各平台独立别名分发，外部泄露一键切断</h3>
          <p style="font-size: 13.5px; color: #475569; line-height: 1.7; margin: 0 0 14px;">
            支持为 GitHub、Steam 或各类网站独立分配专属别名。一旦某个外部平台遭遇数据泄露或被垃圾营销骚扰，只需一键禁用该别名即可物理熔断，你的真实主邮箱永远安全隐身。
          </p>
          <div>
            <span style="background: #ffe4e6; color: #9f1239; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600; margin-right: 8px;">🛑 一键物理熔断</span>
            <span style="background: #ffe4e6; color: #9f1239; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600;">🛡️ 真实主号隐身</span>
          </div>
        </div>
        <div style="width: 300px; flex-shrink: 0; display: flex; align-items: center; justify-content: center;">
          <svg width="100%" height="150" viewBox="0 0 320 180" fill="none" xmlns="http://www.w3.org/2000/svg" style="max-width: 300px; display: block; margin: 0 auto;">
            <rect width="320" height="180" rx="12" fill="#F8FAFC" stroke="#E2E8F0" stroke-width="1.5"/>
            <rect x="0" y="0" width="320" height="36" rx="12" fill="#FFFFFF"/>
            <rect x="0" y="24" width="320" height="12" fill="#FFFFFF"/>
            <line x1="0" y1="36" x2="320" y2="36" stroke="#E2E8F0" stroke-width="1"/>
            <circle cx="16" cy="18" r="4" fill="#E11D48"/>
            <text x="28" y="22" fill="#0F172A" font-size="11" font-weight="700">多别名分发与单向熔断器</text>
            <rect x="236" y="8" width="68" height="20" rx="10" fill="#FFE4E6" stroke="#FECDD3" stroke-width="1"/>
            <text x="270" y="22" fill="#E11D48" font-size="10" font-weight="700" text-anchor="middle">🛡️ 保护主号</text>
            <rect x="18" y="52" width="76" height="110" rx="8" fill="#0078D4" filter="drop-shadow(0 4px 10px rgba(0,120,212,0.25))"/>
            <circle cx="56" cy="85" r="14" fill="#FFFFFF" fill-opacity="0.2"/>
            <text x="56" y="90" fill="#FFFFFF" font-size="14" font-weight="800" text-anchor="middle">主</text>
            <text x="56" y="118" fill="#FFFFFF" font-size="11" font-weight="700" text-anchor="middle">主邮箱</text>
            <text x="56" y="134" fill="#BFDBFE" font-size="9" font-weight="600" text-anchor="middle">🔒 安全隐身</text>
            <path d="M94 72H130C140 72 140 64 150 64H170" stroke="#10B981" stroke-width="1.8"/>
            <path d="M94 107H170" stroke="#10B981" stroke-width="1.8"/>
            <path d="M94 142H130C140 142 140 150 150 150H170" stroke="#E11D48" stroke-width="1.8" stroke-dasharray="3 3"/>
            <rect x="170" y="48" width="132" height="32" rx="6" fill="#FFFFFF" stroke="#A7F3D0" stroke-width="1.2"/>
            <text x="180" y="68" fill="#0F172A" font-size="10" font-weight="600">github@alias</text>
            <rect x="254" y="54" width="42" height="20" rx="4" fill="#ECFDF5"/>
            <text x="275" y="68" fill="#059669" font-size="9" font-weight="700" text-anchor="middle">● 通畅</text>
            <rect x="170" y="91" width="132" height="32" rx="6" fill="#FFFFFF" stroke="#A7F3D0" stroke-width="1.2"/>
            <text x="180" y="111" fill="#0F172A" font-size="10" font-weight="600">steam@alias</text>
            <rect x="254" y="97" width="42" height="20" rx="4" fill="#ECFDF5"/>
            <text x="275" y="111" fill="#059669" font-size="9" font-weight="700" text-anchor="middle">● 通畅</text>
            <rect x="170" y="134" width="132" height="32" rx="6" fill="#FFF1F2" stroke="#FECDD3" stroke-width="1.2"/>
            <text x="180" y="154" fill="#9F1239" font-size="10" font-weight="600">spam@alias</text>
            <rect x="254" y="140" width="42" height="20" rx="4" fill="#FFE4E6"/>
            <text x="275" y="154" fill="#E11D48" font-size="9" font-weight="700" text-anchor="middle">✕ 已熔断</text>
          </svg>
        </div>
      </div>

    </div>

    <!-- Full-Width Interactive Call-To-Action (CTA) Buttons -->
    <div style="text-align: center; margin: 32px 0 24px;">
      <a href="/inbox" style="display: inline-block; background: linear-gradient(135deg, #0078D4 0%, #2563eb 100%); color: #ffffff; text-decoration: none; font-weight: 700; font-size: 15px; padding: 13px 32px; border-radius: 9999px; box-shadow: 0 4px 16px rgba(37, 99, 235, 0.35); margin: 0 10px 10px;">
        🚀 开启我的收件箱
      </a>
      <a href="/settings/profile" style="display: inline-block; background: #ffffff; color: #0078D4; text-decoration: none; font-weight: 600; font-size: 14.5px; padding: 12px 28px; border-radius: 9999px; border: 1.5px solid #bfdbfe; margin: 0 10px 10px;">
        👤 设定个人资料与讯息
      </a>
    </div>

    <!-- 3-Step Quick Start Guide -->
    <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 16px; padding: 22px 26px; margin: 24px 0;">
      <div style="font-weight: 700; font-size: 15px; color: #1e293b; margin-bottom: 12px; display: flex; align-items: center; gap: 8px;">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" fill="#0078D4"/>
        </svg>
        <span>新手 3 步快速上手指引</span>
      </div>
      <div style="font-size: 13.5px; color: #475569; line-height: 1.9;">
        <div><strong>1. 体验星标与代办归档：</strong> 这封信已经自动放入你的【稍后代办】与【星标 / 重要】中，点击感受快捷归档。</div>
        <div><strong>2. 设定个人资料与外观：</strong> 前往「个人设置」上传属于你的专属头像、昵称，并切换喜欢的个性化主题。</div>
        <div><strong>3. 写下你的第一封信：</strong> 点击左上角「写邮件」，即刻体验流畅轻快的撰写与全球极速投递。</div>
      </div>
    </div>

    <div style="margin-top: 24px; padding-top: 16px; border-top: 1px dashed #cbd5e1; font-size: 12.5px; color: #94a3b8; line-height: 1.65;">
      <div>📌 <strong>贴心提示：</strong> 这是一封官方系统引导信件。站长设置了自动清理周期，到期后会自动安全清理，无需手动删除。</div>
      <div style="margin-top: 10px; font-weight: 600; color: #64748b;">Epocanvas Mail 开发者团队 · 陪你开启高效每一天</div>
    </div>
  </div>
</div>`
  },
  'zh-Hant': {
    lang: 'zh-Hant',
    name: '正體中文 (繁體)',
    subject: "🎉 歡迎來到 Epocanvas Mail · 開啟你的專屬獨立域名郵箱體驗",
    content: `<div style="width: 100%; max-width: 100%; box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', Roboto, Helvetica, Arial, sans-serif; color: #1e293b; line-height: 1.6; background: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 10px 35px -6px rgba(0, 0, 0, 0.08);">
  <!-- Top Full-Width Banner with Microsoft Azure Gradient & Official EpoMail Brand Logo -->
  <div style="background: linear-gradient(135deg, #0078D4 0%, #0284c7 35%, #2563eb 70%, #4338ca 100%); padding: 40px 42px 34px; text-align: left; position: relative;">
    <div style="display: flex; align-items: center; justify-content: space-between; gap: 24px; flex-wrap: wrap;">
      <div style="flex: 1; min-width: 300px;">
        <div style="display: inline-flex; align-items: center; gap: 8px; background: rgba(255, 255, 255, 0.22); border: 1px solid rgba(255, 255, 255, 0.35); padding: 5px 14px; border-radius: 20px; color: #ffffff; font-size: 13px; font-weight: 600; margin-bottom: 14px; backdrop-filter: blur(8px);">
          <span>✨ 你的專屬獨立域名郵箱已就緒</span>
        </div>
        <h1 style="margin: 0; color: #ffffff; font-size: 26px; font-weight: 800; letter-spacing: -0.02em; line-height: 1.35;">嗨 {{user_name}}，很高興認識你！</h1>
        <p style="margin: 10px 0 0; color: rgba(255, 255, 255, 0.95); font-size: 14.5px; line-height: 1.55;">零門檻免配置 · 純淨無廣告 · 國內極速秒開 · 專屬極客身份</p>
      </div>
      <!-- Official EpoMail Cloud Logo SVG Artwork -->
      <div style="flex-shrink: 0; display: flex; align-items: center; justify-content: center; width: 92px; height: 92px; background: rgba(255, 255, 255, 0.18); border-radius: 22px; border: 1.5px solid rgba(255, 255, 255, 0.38); box-shadow: 0 10px 28px rgba(0, 0, 0, 0.18); backdrop-filter: blur(10px);">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="76" height="76" style="display:block; flex-shrink:0;">
          <defs>
            <linearGradient id="epomailLogoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#00F5D4" />
              <stop offset="40%" stop-color="#0072FF" />
              <stop offset="100%" stop-color="#5B24FF" />
            </linearGradient>
            <mask id="epomailCutout">
              <rect width="100%" height="100%" fill="white" />
              <path d="M 15 210 L 200 270 L 385 210" fill="none" stroke="black" stroke-width="12" stroke-linecap="round" stroke-linejoin="round" />
              <line x1="60" y1="320" x2="140" y2="280" stroke="black" stroke-width="10" stroke-linecap="round" />
              <line x1="340" y1="320" x2="260" y2="280" stroke="black" stroke-width="10" stroke-linecap="round" />
              <circle cx="200" cy="270" r="26" fill="white" />
              <circle cx="200" cy="270" r="26" fill="none" stroke="black" stroke-width="10" />
              <circle cx="200" cy="270" r="4.5" fill="black" />
              <line x1="200" y1="270" x2="188" y2="258" stroke="black" stroke-width="7" stroke-linecap="round" />
              <line x1="200" y1="270" x2="215" y2="258" stroke="black" stroke-width="7" stroke-linecap="round" />
            </mask>
          </defs>
          <path d="M 60 110 Q 70 110 70 100 Q 70 110 80 110 Q 70 110 70 120 Q 70 110 60 110 Z" fill="#00F5D4" opacity="0.85" />
          <path d="M 330 90 Q 335 90 335 85 Q 335 90 340 90 Q 335 90 335 95 Q 335 90 330 90 Z" fill="#FF369B" opacity="0.9" />
          <circle cx="85" cy="180" r="2.5" fill="#5B24FF" opacity="0.6" />
          <circle cx="320" cy="180" r="3" fill="#0072FF" opacity="0.7" />
          <path d="M 40 220 A 60 60 0 0 1 120 155 A 85 85 0 0 1 280 155 A 60 60 0 0 1 360 220 L 360 260 C 360 325 290 335 200 335 C 110 335 40 325 40 260 Z" fill="url(#epomailLogoGrad)" mask="url(#epomailCutout)" />
        </svg>
      </div>
    </div>
  </div>

  <div style="padding: 36px 42px 34px;">
    <p style="font-size: 16px; color: #0f172a; margin-top: 0; font-weight: 700;">嗨 {{user_name}}，歡迎加入 Epocanvas Mail！</p>
    <p style="font-size: 14.5px; color: #475569; line-height: 1.8; margin: 0 0 28px;">
      很高興能在這裡與你相遇。這是一個由開發者精心搭建並免費開放給大家使用的專屬獨立域名郵箱。我們把底層複雜的域名購買、DNS 解析、MX/SPF 記錄和雲端伺服器全部打包搞定——你不需要懂任何繁瑣的技術，註冊好就能直接擁有一張專屬的高顏值域名名片。你的專屬郵箱（{{user_email}}）已經準備好了！快來看看我們為你準備的貼心功能與上手指南吧：
    </p>

    <!-- 5 Alternating Zigzag Storytelling Value Sections -->
    <div style="margin: 28px 0; display: flex; flex-direction: column; gap: 20px;">
      
      <!-- Section 1 (Zigzag: Text Left, Illustration Right) -->
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 32px; background: linear-gradient(135deg, #f0f7ff 0%, #ffffff 100%); border: 1px solid #bfdbfe; border-radius: 16px; padding: 24px 28px; box-shadow: 0 4px 16px rgba(0, 120, 212, 0.05); flex-wrap: wrap;">
        <div style="flex: 1; min-width: 280px;">
          <div style="display: inline-flex; align-items: center; gap: 6px; background: rgba(0, 120, 212, 0.1); border: 1px solid rgba(0, 120, 212, 0.25); padding: 4px 12px; border-radius: 9999px; color: #0078D4; font-size: 12.5px; font-weight: 700; margin-bottom: 10px;">
            🌐 專屬極客名片 · 免買域名免配置
          </div>
          <h3 style="font-size: 17.5px; font-weight: 800; color: #0f172a; margin: 0 0 8px;">無需折騰 DNS 與 MX 解析，即刻擁有專屬身份</h3>
          <p style="font-size: 13.5px; color: #475569; line-height: 1.7; margin: 0 0 14px;">
            告別繁瑣複雜的域名購買與解析配置。在 Epocanvas Mail，直接擁有 <code style="background: #e0f2fe; color: #0284c7; font-weight: 700; padding: 2px 8px; border-radius: 6px; font-size: 13px;">{{user_name}}@專屬域名</code> 這樣酷炫的郵箱地址，求職簡歷、技術交流或日常通訊，專業範與極客感瞬間拉滿。
          </p>
          <div>
            <span style="background: #e2e8f0; color: #334155; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600; margin-right: 8px;">✨ 零門檻即開即用</span>
            <span style="background: #e2e8f0; color: #334155; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600;">🏷️ 多頂級域名隨心選</span>
          </div>
        </div>
        <div style="width: 300px; flex-shrink: 0; display: flex; align-items: center; justify-content: center;">
          <svg width="100%" height="150" viewBox="0 0 320 180" fill="none" xmlns="http://www.w3.org/2000/svg" style="max-width: 300px; display: block; margin: 0 auto;">
            <rect width="320" height="180" rx="12" fill="#F8FAFC" stroke="#E2E8F0" stroke-width="1.5"/>
            <rect x="0" y="0" width="320" height="36" rx="12" fill="#FFFFFF"/>
            <rect x="0" y="24" width="320" height="12" fill="#FFFFFF"/>
            <line x1="0" y1="36" x2="320" y2="36" stroke="#E2E8F0" stroke-width="1"/>
            <circle cx="16" cy="18" r="4" fill="#EF4444"/>
            <circle cx="28" cy="18" r="4" fill="#F59E0B"/>
            <circle cx="40" cy="18" r="4" fill="#10B981"/>
            <rect x="56" y="8" width="248" height="20" rx="6" fill="#F1F5F9"/>
            <circle cx="68" cy="18" r="3" fill="#10B981"/>
            <text x="78" y="22" fill="#0284C7" font-size="10" font-weight="600" font-family="monospace">https://epomail.bond/@me</text>
            <rect x="20" y="52" width="280" height="110" rx="10" fill="#FFFFFF" stroke="#CBD5E1" stroke-width="1.2" filter="drop-shadow(0 4px 12px rgba(0,0,0,0.04))"/>
            <circle cx="50" cy="86" r="18" fill="#0078D4"/>
            <text x="50" y="92" fill="#FFFFFF" font-size="13" font-weight="800" text-anchor="middle">@</text>
            <text x="80" y="80" fill="#0F172A" font-size="13" font-weight="700">專屬極客域名名片</text>
            <text x="80" y="96" fill="#64748B" font-size="11" font-weight="500" font-family="monospace">user@epomail.bond</text>
            <rect x="220" y="70" width="64" height="20" rx="10" fill="#ECFDF5" stroke="#A7F3D0" stroke-width="1"/>
            <text x="252" y="84" fill="#059669" font-size="10" font-weight="700" text-anchor="middle">● DNS 啟用</text>
            <line x1="32" y1="120" x2="288" y2="120" stroke="#F1F5F9" stroke-width="1"/>
            <rect x="32" y="130" width="76" height="18" rx="4" fill="#EFF6FF"/>
            <text x="70" y="143" fill="#0078D4" font-size="9.5" font-weight="600" text-anchor="middle">SPF 權威驗證</text>
            <rect x="116" y="130" width="80" height="18" rx="4" fill="#EFF6FF"/>
            <text x="156" y="143" fill="#0078D4" font-size="9.5" font-weight="600" text-anchor="middle">DKIM 金鑰簽發</text>
            <rect x="204" y="130" width="76" height="18" rx="4" fill="#EFF6FF"/>
            <text x="242" y="143" fill="#0078D4" font-size="9.5" font-weight="600" text-anchor="middle">DMARC 100%</text>
          </svg>
        </div>
      </div>

      <!-- Section 2 (Zigzag: Illustration Left, Text Right) -->
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 32px; background: linear-gradient(135deg, #ecfdf5 0%, #ffffff 100%); border: 1px solid #a7f3d0; border-radius: 16px; padding: 24px 28px; box-shadow: 0 4px 16px rgba(16, 185, 129, 0.05); flex-wrap: wrap;">
        <div style="width: 300px; flex-shrink: 0; display: flex; align-items: center; justify-content: center;">
          <svg width="100%" height="150" viewBox="0 0 320 180" fill="none" xmlns="http://www.w3.org/2000/svg" style="max-width: 300px; display: block; margin: 0 auto;">
            <rect width="320" height="180" rx="12" fill="#F8FAFC" stroke="#E2E8F0" stroke-width="1.5"/>
            <rect x="0" y="0" width="320" height="36" rx="12" fill="#FFFFFF"/>
            <rect x="0" y="24" width="320" height="12" fill="#FFFFFF"/>
            <line x1="0" y1="36" x2="320" y2="36" stroke="#E2E8F0" stroke-width="1"/>
            <circle cx="16" cy="18" r="4" fill="#10B981"/>
            <text x="28" y="22" fill="#0F172A" font-size="11" font-weight="700">隱私與資料安全監控臺</text>
            <rect x="236" y="8" width="68" height="20" rx="10" fill="#ECFDF5" stroke="#A7F3D0" stroke-width="1"/>
            <text x="270" y="22" fill="#059669" font-size="10" font-weight="700" text-anchor="middle">100% 私密</text>
            <rect x="18" y="50" width="136" height="52" rx="8" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="1.2"/>
            <text x="30" y="70" fill="#64748B" font-size="10" font-weight="600">商業廣告掃描</text>
            <text x="30" y="90" fill="#059669" font-size="14" font-weight="800">0 追蹤 / 0 廣告</text>
            <rect x="166" y="50" width="136" height="52" rx="8" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="1.2"/>
            <text x="178" y="70" fill="#64748B" font-size="10" font-weight="600">傳輸加密標準</text>
            <text x="178" y="90" fill="#0078D4" font-size="14" font-weight="800">TLS 1.3 / AES</text>
            <rect x="18" y="112" width="284" height="50" rx="8" fill="#ECFDF5" stroke="#A7F3D0" stroke-width="1.2"/>
            <circle cx="38" cy="137" r="10" fill="#059669"/>
            <path d="M34 137L37 140L42 134" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <text x="56" y="134" fill="#065F46" font-size="11.5" font-weight="700">絕不向第三方出售使用者資料與信件畫像</text>
            <text x="56" y="149" fill="#047857" font-size="10" font-weight="500">零開屏 · 零彈窗 · 純粹郵箱通訊本位</text>
          </svg>
        </div>
        <div style="flex: 1; min-width: 280px;">
          <div style="display: inline-flex; align-items: center; gap: 6px; background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.25); padding: 4px 12px; border-radius: 9999px; color: #059669; font-size: 12.5px; font-weight: 700; margin-bottom: 10px;">
            🛡️ 純粹私密 · 零廣告零商業變現
          </div>
          <h3 style="font-size: 17.5px; font-weight: 800; color: #0f172a; margin: 0 0 8px;">無開屏、不彈窗，絕不窺探你的郵件隱私</h3>
          <p style="font-size: 13.5px; color: #475569; line-height: 1.7; margin: 0 0 14px;">
            我們堅守郵箱通訊最純粹的本質。沒有令人煩躁的開屏廣告、橫幅推廣和垃圾營銷彈窗；後臺絕不對你的信件做商業挖掘或行為畫像分析，給你一個乾淨、清爽、安心的專屬通訊空間。
          </p>
          <div>
            <span style="background: #d1fae5; color: #065f46; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600; margin-right: 8px;">🚫 純淨零彈窗</span>
            <span style="background: #d1fae5; color: #065f46; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600;">🔒 隱私絕不商用</span>
          </div>
        </div>
      </div>

      <!-- Section 3 (Zigzag: Text Left, Illustration Right) -->
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 32px; background: linear-gradient(135deg, #fffbeb 0%, #ffffff 100%); border: 1px solid #fde68a; border-radius: 16px; padding: 24px 28px; box-shadow: 0 4px 16px rgba(245, 158, 11, 0.05); flex-wrap: wrap;">
        <div style="flex: 1; min-width: 280px;">
          <div style="display: inline-flex; align-items: center; gap: 6px; background: rgba(245, 158, 11, 0.1); border: 1px solid rgba(245, 158, 11, 0.25); padding: 4px 12px; border-radius: 9999px; color: #d97706; font-size: 12.5px; font-weight: 700; margin-bottom: 10px;">
            ⚡ 全球邊緣網路 · 國內極速秒開
          </div>
          <h3 style="font-size: 17.5px; font-weight: 800; color: #0f172a; margin: 0 0 8px;">Cloudflare 全球邊緣 CDN 直連，無需代理毫秒響應</h3>
          <p style="font-size: 13.5px; color: #475569; line-height: 1.7; margin: 0 0 14px;">
            基於全球 300+ 邊緣節點與國內高速 CDN 加速。無論你在哪裡，無需開啟任何代理工具，郵件毫秒級秒開載入、全球各大郵箱秒級送達，隨時隨地穩定順暢不失聯。
          </p>
          <div>
            <span style="background: #fef3c7; color: #92400e; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600; margin-right: 8px;">🚀 毫秒級秒開</span>
            <span style="background: #fef3c7; color: #92400e; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600;">🌍 全球邊緣直達</span>
          </div>
        </div>
        <div style="width: 300px; flex-shrink: 0; display: flex; align-items: center; justify-content: center;">
          <svg width="100%" height="150" viewBox="0 0 320 180" fill="none" xmlns="http://www.w3.org/2000/svg" style="max-width: 300px; display: block; margin: 0 auto;">
            <rect width="320" height="180" rx="12" fill="#F8FAFC" stroke="#E2E8F0" stroke-width="1.5"/>
            <rect x="0" y="0" width="320" height="36" rx="12" fill="#FFFFFF"/>
            <rect x="0" y="24" width="320" height="12" fill="#FFFFFF"/>
            <line x1="0" y1="36" x2="320" y2="36" stroke="#E2E8F0" stroke-width="1"/>
            <circle cx="16" cy="18" r="4" fill="#F59E0B"/>
            <text x="28" y="22" fill="#0F172A" font-size="11" font-weight="700">全球邊緣 CDN 網路直連</text>
            <rect x="236" y="8" width="68" height="20" rx="10" fill="#FEF3C7" stroke="#FDE68A" stroke-width="1"/>
            <text x="270" y="22" fill="#D97706" font-size="10" font-weight="700" text-anchor="middle">⚡ &lt; 20ms</text>
            <rect x="18" y="50" width="284" height="112" rx="8" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="1.2"/>
            <line x1="60" y1="106" x2="160" y2="106" stroke="#0078D4" stroke-width="2" stroke-dasharray="4 3"/>
            <line x1="160" y1="106" x2="260" y2="106" stroke="#10B981" stroke-width="2"/>
            <circle cx="60" cy="106" r="16" fill="#EFF6FF" stroke="#0078D4" stroke-width="1.5"/>
            <text x="60" y="110" fill="#0078D4" font-size="11" font-weight="800" text-anchor="middle">使用者</text>
            <text x="60" y="138" fill="#64748B" font-size="9.5" font-weight="600" text-anchor="middle">國內直連</text>
            <circle cx="160" cy="106" r="20" fill="#FEF3C7" stroke="#F59E0B" stroke-width="1.8"/>
            <text x="160" y="109" fill="#D97706" font-size="10" font-weight="800" text-anchor="middle">EDGE</text>
            <text x="160" y="120" fill="#B45309" font-size="8" font-weight="700" text-anchor="middle">CDN</text>
            <text x="160" y="144" fill="#D97706" font-size="9.5" font-weight="700" text-anchor="middle">300+ 節點</text>
            <circle cx="260" cy="106" r="16" fill="#ECFDF5" stroke="#10B981" stroke-width="1.5"/>
            <text x="260" y="110" fill="#059669" font-size="11" font-weight="800" text-anchor="middle">全球</text>
            <text x="260" y="138" fill="#64748B" font-size="9.5" font-weight="600" text-anchor="middle">秒級送達</text>
          </svg>
        </div>
      </div>

      <!-- Section 4 (Zigzag: Illustration Left, Text Right) -->
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 32px; background: linear-gradient(135deg, #f5f3ff 0%, #ffffff 100%); border: 1px solid #ddd6fe; border-radius: 16px; padding: 24px 28px; box-shadow: 0 4px 16px rgba(124, 58, 237, 0.05); flex-wrap: wrap;">
        <div style="width: 300px; flex-shrink: 0; display: flex; align-items: center; justify-content: center;">
          <svg width="100%" height="150" viewBox="0 0 320 180" fill="none" xmlns="http://www.w3.org/2000/svg" style="max-width: 300px; display: block; margin: 0 auto;">
            <rect width="320" height="180" rx="12" fill="#F8FAFC" stroke="#E2E8F0" stroke-width="1.5"/>
            <rect x="0" y="0" width="320" height="36" rx="12" fill="#FFFFFF"/>
            <rect x="0" y="24" width="320" height="12" fill="#FFFFFF"/>
            <line x1="0" y1="36" x2="320" y2="36" stroke="#E2E8F0" stroke-width="1"/>
            <circle cx="16" cy="18" r="4" fill="#7C3AED"/>
            <text x="28" y="22" fill="#0F172A" font-size="11" font-weight="700">智慧收件箱代辦流</text>
            <rect x="226" y="8" width="78" height="20" rx="10" fill="#EDE9FE" stroke="#DDD6FE" stroke-width="1"/>
            <text x="265" y="22" fill="#6D28D9" font-size="10" font-weight="700" text-anchor="middle">⏰ 稍後代辦</text>
            <rect x="18" y="48" width="284" height="34" rx="6" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="1.2"/>
            <circle cx="34" cy="65" r="5" fill="#7C3AED"/>
            <text x="48" y="69" fill="#0F172A" font-size="11" font-weight="700">專案週報與架構評審</text>
            <rect x="220" y="55" width="72" height="20" rx="4" fill="#F5F3FF"/>
            <text x="256" y="69" fill="#7C3AED" font-size="9.5" font-weight="700" text-anchor="middle">⏰ 明天 09:00</text>
            <rect x="18" y="88" width="284" height="34" rx="6" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="1.2"/>
            <circle cx="34" cy="105" r="5" fill="#F59E0B"/>
            <text x="48" y="109" fill="#0F172A" font-size="11" font-weight="700">GitHub 安全警報通知</text>
            <rect x="220" y="95" width="72" height="20" rx="4" fill="#FEF3C7"/>
            <text x="256" y="109" fill="#D97706" font-size="9.5" font-weight="700" text-anchor="middle">⭐ 重要星標</text>
            <rect x="18" y="128" width="284" height="36" rx="6" fill="#F1F5F9" stroke="#CBD5E1" stroke-width="1"/>
            <text x="32" y="151" fill="#64748B" font-size="11" font-family="monospace">🔍 毫秒級全文即時檢索...</text>
            <rect x="238" y="134" width="54" height="24" rx="4" fill="#0078D4"/>
            <text x="265" y="150" fill="#FFFFFF" font-size="10" font-weight="700" text-anchor="middle">回車檢索</text>
          </svg>
        </div>
        <div style="flex: 1; min-width: 280px;">
          <div style="display: inline-flex; align-items: center; gap: 6px; background: rgba(124, 58, 237, 0.1); border: 1px solid rgba(124, 58, 237, 0.25); padding: 4px 12px; border-radius: 9999px; color: #7c3aed; font-size: 12.5px; font-weight: 700; margin-bottom: 10px;">
            📥 進階工作流 · 極簡輕快
          </div>
          <h3 style="font-size: 17.5px; font-weight: 800; color: #0f172a; margin: 0 0 8px;">稍後處理 (Snooze)、星標代辦與全文即時檢索</h3>
          <p style="font-size: 13.5px; color: #475569; line-height: 1.7; margin: 0 0 14px;">
            內建現代高效的工作流體驗。重要的信件可以一鍵設為稍後提醒（Snooze），配合星標代辦歸檔、自定義分類標籤與全文即時檢索，即使面對成百上千封郵件也能遊刃有餘、井井有條。
          </p>
          <div>
            <span style="background: #ede9fe; color: #5b21b6; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600; margin-right: 8px;">⏰ 稍後處理代辦</span>
            <span style="background: #ede9fe; color: #5b21b6; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600;">⭐ 星標快捷歸檔</span>
          </div>
        </div>
      </div>

      <!-- Section 5 (Zigzag: Text Left, Illustration Right) -->
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 32px; background: linear-gradient(135deg, #fff1f2 0%, #ffffff 100%); border: 1px solid #fecdd3; border-radius: 16px; padding: 24px 28px; box-shadow: 0 4px 16px rgba(225, 29, 72, 0.05); flex-wrap: wrap;">
        <div style="flex: 1; min-width: 280px;">
          <div style="display: inline-flex; align-items: center; gap: 6px; background: rgba(225, 29, 72, 0.1); border: 1px solid rgba(225, 29, 72, 0.25); padding: 4px 12px; border-radius: 9999px; color: #e11d48; font-size: 12.5px; font-weight: 700; margin-bottom: 10px;">
            🔀 別名隔離 · 垃圾郵件一鍵熔斷
          </div>
          <h3 style="font-size: 17.5px; font-weight: 800; color: #0f172a; margin: 0 0 8px;">各平臺獨立別名分發，外部洩露一鍵切斷</h3>
          <p style="font-size: 13.5px; color: #475569; line-height: 1.7; margin: 0 0 14px;">
            支援為 GitHub、Steam 或各類網站獨立分配專屬別名。一旦某個外部平臺遭遇資料洩露或被垃圾營銷騷擾，只需一鍵停用該別名即可物理熔斷，你的真實主郵箱永遠安全隱身。
          </p>
          <div>
            <span style="background: #ffe4e6; color: #9f1239; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600; margin-right: 8px;">🛑 一鍵物理熔斷</span>
            <span style="background: #ffe4e6; color: #9f1239; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600;">🛡️ 真實主號隱身</span>
          </div>
        </div>
        <div style="width: 300px; flex-shrink: 0; display: flex; align-items: center; justify-content: center;">
          <svg width="100%" height="150" viewBox="0 0 320 180" fill="none" xmlns="http://www.w3.org/2000/svg" style="max-width: 300px; display: block; margin: 0 auto;">
            <rect width="320" height="180" rx="12" fill="#F8FAFC" stroke="#E2E8F0" stroke-width="1.5"/>
            <rect x="0" y="0" width="320" height="36" rx="12" fill="#FFFFFF"/>
            <rect x="0" y="24" width="320" height="12" fill="#FFFFFF"/>
            <line x1="0" y1="36" x2="320" y2="36" stroke="#E2E8F0" stroke-width="1"/>
            <circle cx="16" cy="18" r="4" fill="#E11D48"/>
            <text x="28" y="22" fill="#0F172A" font-size="11" font-weight="700">多別名分發與單向熔斷器</text>
            <rect x="236" y="8" width="68" height="20" rx="10" fill="#FFE4E6" stroke="#FECDD3" stroke-width="1"/>
            <text x="270" y="22" fill="#E11D48" font-size="10" font-weight="700" text-anchor="middle">🛡️ 保護主號</text>
            <rect x="18" y="52" width="76" height="110" rx="8" fill="#0078D4" filter="drop-shadow(0 4px 10px rgba(0,120,212,0.25))"/>
            <circle cx="56" cy="85" r="14" fill="#FFFFFF" fill-opacity="0.2"/>
            <text x="56" y="90" fill="#FFFFFF" font-size="14" font-weight="800" text-anchor="middle">主</text>
            <text x="56" y="118" fill="#FFFFFF" font-size="11" font-weight="700" text-anchor="middle">主郵箱</text>
            <text x="56" y="134" fill="#BFDBFE" font-size="9" font-weight="600" text-anchor="middle">🔒 安全隱身</text>
            <path d="M94 72H130C140 72 140 64 150 64H170" stroke="#10B981" stroke-width="1.8"/>
            <path d="M94 107H170" stroke="#10B981" stroke-width="1.8"/>
            <path d="M94 142H130C140 142 140 150 150 150H170" stroke="#E11D48" stroke-width="1.8" stroke-dasharray="3 3"/>
            <rect x="170" y="48" width="132" height="32" rx="6" fill="#FFFFFF" stroke="#A7F3D0" stroke-width="1.2"/>
            <text x="180" y="68" fill="#0F172A" font-size="10" font-weight="600">github@alias</text>
            <rect x="254" y="54" width="42" height="20" rx="4" fill="#ECFDF5"/>
            <text x="275" y="68" fill="#059669" font-size="9" font-weight="700" text-anchor="middle">● 通暢</text>
            <rect x="170" y="91" width="132" height="32" rx="6" fill="#FFFFFF" stroke="#A7F3D0" stroke-width="1.2"/>
            <text x="180" y="111" fill="#0F172A" font-size="10" font-weight="600">steam@alias</text>
            <rect x="254" y="97" width="42" height="20" rx="4" fill="#ECFDF5"/>
            <text x="275" y="111" fill="#059669" font-size="9" font-weight="700" text-anchor="middle">● 通暢</text>
            <rect x="170" y="134" width="132" height="32" rx="6" fill="#FFF1F2" stroke="#FECDD3" stroke-width="1.2"/>
            <text x="180" y="154" fill="#9F1239" font-size="10" font-weight="600">spam@alias</text>
            <rect x="254" y="140" width="42" height="20" rx="4" fill="#FFE4E6"/>
            <text x="275" y="154" fill="#E11D48" font-size="9" font-weight="700" text-anchor="middle">✕ 已熔斷</text>
          </svg>
        </div>
      </div>

    </div>

    <!-- Full-Width Interactive Call-To-Action (CTA) Buttons -->
    <div style="text-align: center; margin: 32px 0 24px;">
      <a href="/inbox" style="display: inline-block; background: linear-gradient(135deg, #0078D4 0%, #2563eb 100%); color: #ffffff; text-decoration: none; font-weight: 700; font-size: 15px; padding: 13px 32px; border-radius: 9999px; box-shadow: 0 4px 16px rgba(37, 99, 235, 0.35); margin: 0 10px 10px;">
        🚀 開啟我的收件箱
      </a>
      <a href="/settings/profile" style="display: inline-block; background: #ffffff; color: #0078D4; text-decoration: none; font-weight: 600; font-size: 14.5px; padding: 12px 28px; border-radius: 9999px; border: 1.5px solid #bfdbfe; margin: 0 10px 10px;">
        👤 設定個人資料與訊息
      </a>
    </div>

    <!-- 3-Step Quick Start Guide -->
    <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 16px; padding: 22px 26px; margin: 24px 0;">
      <div style="font-weight: 700; font-size: 15px; color: #1e293b; margin-bottom: 12px; display: flex; align-items: center; gap: 8px;">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" fill="#0078D4"/>
        </svg>
        <span>新手 3 步快速上手指引</span>
      </div>
      <div style="font-size: 13.5px; color: #475569; line-height: 1.9;">
        <div><strong>1. 體驗星標與代辦歸檔：</strong> 這封信已經自動放入你的【稍後代辦】與【星標 / 重要】中，點選感受快捷歸檔。</div>
        <div><strong>2. 設定個人資料與外觀：</strong> 前往「個人設定」上傳屬於你的專屬頭像、暱稱，並切換喜歡的個性化主題。</div>
        <div><strong>3. 寫下你的第一封信：</strong> 點選左上角「寫郵件」，即刻體驗流暢輕快的撰寫與全球極速投遞。</div>
      </div>
    </div>

    <div style="margin-top: 24px; padding-top: 16px; border-top: 1px dashed #cbd5e1; font-size: 12.5px; color: #94a3b8; line-height: 1.65;">
      <div>📌 <strong>貼心提示：</strong> 這是一封官方系統引導信件。站長設定了自動清理週期，到期後會自動安全清理，無需手動刪除。</div>
      <div style="margin-top: 10px; font-weight: 600; color: #64748b;">Epocanvas Mail 開發者團隊 · 陪你開啟高效每一天</div>
    </div>
  </div>
</div>`
  },
  en: {
    lang: 'en',
    name: 'English',
    subject: "🎉 Welcome to Epocanvas Mail · Your Exclusive Custom Domain Mailbox",
    content: `<div style="width: 100%; max-width: 100%; box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', Roboto, Helvetica, Arial, sans-serif; color: #1e293b; line-height: 1.6; background: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 10px 35px -6px rgba(0, 0, 0, 0.08);">
  <!-- Top Full-Width Banner with Microsoft Azure Gradient & Official EpoMail Brand Logo -->
  <div style="background: linear-gradient(135deg, #0078D4 0%, #0284c7 35%, #2563eb 70%, #4338ca 100%); padding: 40px 42px 34px; text-align: left; position: relative;">
    <div style="display: flex; align-items: center; justify-content: space-between; gap: 24px; flex-wrap: wrap;">
      <div style="flex: 1; min-width: 300px;">
        <div style="display: inline-flex; align-items: center; gap: 8px; background: rgba(255, 255, 255, 0.22); border: 1px solid rgba(255, 255, 255, 0.35); padding: 5px 14px; border-radius: 20px; color: #ffffff; font-size: 13px; font-weight: 600; margin-bottom: 14px; backdrop-filter: blur(8px);">
          <span>✨ Your Custom Domain Mailbox is Ready</span>
        </div>
        <h1 style="margin: 0; color: #ffffff; font-size: 26px; font-weight: 800; letter-spacing: -0.02em; line-height: 1.35;">Hi {{user_name}}, Great to Meet You!</h1>
        <p style="margin: 10px 0 0; color: rgba(255, 255, 255, 0.95); font-size: 14.5px; line-height: 1.55;">Zero Configuration · Ad-Free · Blazing Fast · Exclusive Geek Identity</p>
      </div>
      <!-- Official EpoMail Cloud Logo SVG Artwork -->
      <div style="flex-shrink: 0; display: flex; align-items: center; justify-content: center; width: 92px; height: 92px; background: rgba(255, 255, 255, 0.18); border-radius: 22px; border: 1.5px solid rgba(255, 255, 255, 0.38); box-shadow: 0 10px 28px rgba(0, 0, 0, 0.18); backdrop-filter: blur(10px);">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="76" height="76" style="display:block; flex-shrink:0;">
          <defs>
            <linearGradient id="epomailLogoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#00F5D4" />
              <stop offset="40%" stop-color="#0072FF" />
              <stop offset="100%" stop-color="#5B24FF" />
            </linearGradient>
            <mask id="epomailCutout">
              <rect width="100%" height="100%" fill="white" />
              <path d="M 15 210 L 200 270 L 385 210" fill="none" stroke="black" stroke-width="12" stroke-linecap="round" stroke-linejoin="round" />
              <line x1="60" y1="320" x2="140" y2="280" stroke="black" stroke-width="10" stroke-linecap="round" />
              <line x1="340" y1="320" x2="260" y2="280" stroke="black" stroke-width="10" stroke-linecap="round" />
              <circle cx="200" cy="270" r="26" fill="white" />
              <circle cx="200" cy="270" r="26" fill="none" stroke="black" stroke-width="10" />
              <circle cx="200" cy="270" r="4.5" fill="black" />
              <line x1="200" y1="270" x2="188" y2="258" stroke="black" stroke-width="7" stroke-linecap="round" />
              <line x1="200" y1="270" x2="215" y2="258" stroke="black" stroke-width="7" stroke-linecap="round" />
            </mask>
          </defs>
          <path d="M 60 110 Q 70 110 70 100 Q 70 110 80 110 Q 70 110 70 120 Q 70 110 60 110 Z" fill="#00F5D4" opacity="0.85" />
          <path d="M 330 90 Q 335 90 335 85 Q 335 90 340 90 Q 335 90 335 95 Q 335 90 330 90 Z" fill="#FF369B" opacity="0.9" />
          <circle cx="85" cy="180" r="2.5" fill="#5B24FF" opacity="0.6" />
          <circle cx="320" cy="180" r="3" fill="#0072FF" opacity="0.7" />
          <path d="M 40 220 A 60 60 0 0 1 120 155 A 85 85 0 0 1 280 155 A 60 60 0 0 1 360 220 L 360 260 C 360 325 290 335 200 335 C 110 335 40 325 40 260 Z" fill="url(#epomailLogoGrad)" mask="url(#epomailCutout)" />
        </svg>
      </div>
    </div>
  </div>

  <div style="padding: 36px 42px 34px;">
    <p style="font-size: 16px; color: #0f172a; margin-top: 0; font-weight: 700;">Hi {{user_name}}, Welcome to Epocanvas Mail!</p>
    <p style="font-size: 14.5px; color: #475569; line-height: 1.8; margin: 0 0 28px;">
      We are thrilled to welcome you. This is an exclusive custom domain mailbox crafted with passion and open for everyone. We have fully handled the underlying complexity of domain purchases, DNS records, MX/SPF verification, and cloud servers. You don’t need complex technical knowledge—upon registration, you immediately own a sleek, professional domain identity. Your dedicated mailbox ({{user_email}}) is ready! Explore our highlights and getting-started guide below:
    </p>

    <!-- 5 Alternating Zigzag Storytelling Value Sections -->
    <div style="margin: 28px 0; display: flex; flex-direction: column; gap: 20px;">
      
      <!-- Section 1 (Zigzag: Text Left, Illustration Right) -->
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 32px; background: linear-gradient(135deg, #f0f7ff 0%, #ffffff 100%); border: 1px solid #bfdbfe; border-radius: 16px; padding: 24px 28px; box-shadow: 0 4px 16px rgba(0, 120, 212, 0.05); flex-wrap: wrap;">
        <div style="flex: 1; min-width: 280px;">
          <div style="display: inline-flex; align-items: center; gap: 6px; background: rgba(0, 120, 212, 0.1); border: 1px solid rgba(0, 120, 212, 0.25); padding: 4px 12px; border-radius: 9999px; color: #0078D4; font-size: 12.5px; font-weight: 700; margin-bottom: 10px;">
            🌐 Exclusive Geek Identity · Zero Domain Hassle
          </div>
          <h3 style="font-size: 17.5px; font-weight: 800; color: #0f172a; margin: 0 0 8px;">No DNS or MX configuration needed — Instant custom identity</h3>
          <p style="font-size: 13.5px; color: #475569; line-height: 1.7; margin: 0 0 14px;">
            Say goodbye to complex domain purchasing and record configurations. With Epocanvas Mail, you immediately get a cool address like <code style="background: #e0f2fe; color: #0284c7; font-weight: 700; padding: 2px 8px; border-radius: 6px; font-size: 13px;">{{user_name}}@domain</code> for resumes, tech collaboration, or daily communications.
          </p>
          <div>
            <span style="background: #e2e8f0; color: #334155; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600; margin-right: 8px;">✨ Instant Ready-to-Use</span>
            <span style="background: #e2e8f0; color: #334155; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600;">🏷️ Multiple Domains</span>
          </div>
        </div>
        <div style="width: 300px; flex-shrink: 0; display: flex; align-items: center; justify-content: center;">
          <svg width="100%" height="150" viewBox="0 0 320 180" fill="none" xmlns="http://www.w3.org/2000/svg" style="max-width: 300px; display: block; margin: 0 auto;">
            <rect width="320" height="180" rx="12" fill="#F8FAFC" stroke="#E2E8F0" stroke-width="1.5"/>
            <rect x="0" y="0" width="320" height="36" rx="12" fill="#FFFFFF"/>
            <rect x="0" y="24" width="320" height="12" fill="#FFFFFF"/>
            <line x1="0" y1="36" x2="320" y2="36" stroke="#E2E8F0" stroke-width="1"/>
            <circle cx="16" cy="18" r="4" fill="#EF4444"/>
            <circle cx="28" cy="18" r="4" fill="#F59E0B"/>
            <circle cx="40" cy="18" r="4" fill="#10B981"/>
            <rect x="56" y="8" width="248" height="20" rx="6" fill="#F1F5F9"/>
            <circle cx="68" cy="18" r="3" fill="#10B981"/>
            <text x="78" y="22" fill="#0284C7" font-size="10" font-weight="600" font-family="monospace">https://epomail.bond/@me</text>
            <rect x="20" y="52" width="280" height="110" rx="10" fill="#FFFFFF" stroke="#CBD5E1" stroke-width="1.2" filter="drop-shadow(0 4px 12px rgba(0,0,0,0.04))"/>
            <circle cx="50" cy="86" r="18" fill="#0078D4"/>
            <text x="50" y="92" fill="#FFFFFF" font-size="13" font-weight="800" text-anchor="middle">@</text>
            <text x="80" y="80" fill="#0F172A" font-size="13" font-weight="700">Custom Geek Business Card</text>
            <text x="80" y="96" fill="#64748B" font-size="11" font-weight="500" font-family="monospace">user@epomail.bond</text>
            <rect x="220" y="70" width="64" height="20" rx="10" fill="#ECFDF5" stroke="#A7F3D0" stroke-width="1"/>
            <text x="252" y="84" fill="#059669" font-size="10" font-weight="700" text-anchor="middle">● DNS Active</text>
            <line x1="32" y1="120" x2="288" y2="120" stroke="#F1F5F9" stroke-width="1"/>
            <rect x="32" y="130" width="76" height="18" rx="4" fill="#EFF6FF"/>
            <text x="70" y="143" fill="#0078D4" font-size="9.5" font-weight="600" text-anchor="middle">SPF Verified</text>
            <rect x="116" y="130" width="80" height="18" rx="4" fill="#EFF6FF"/>
            <text x="156" y="143" fill="#0078D4" font-size="9.5" font-weight="600" text-anchor="middle">DKIM Signed</text>
            <rect x="204" y="130" width="76" height="18" rx="4" fill="#EFF6FF"/>
            <text x="242" y="143" fill="#0078D4" font-size="9.5" font-weight="600" text-anchor="middle">DMARC 100%</text>
          </svg>
        </div>
      </div>

      <!-- Section 2 (Zigzag: Illustration Left, Text Right) -->
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 32px; background: linear-gradient(135deg, #ecfdf5 0%, #ffffff 100%); border: 1px solid #a7f3d0; border-radius: 16px; padding: 24px 28px; box-shadow: 0 4px 16px rgba(16, 185, 129, 0.05); flex-wrap: wrap;">
        <div style="width: 300px; flex-shrink: 0; display: flex; align-items: center; justify-content: center;">
          <svg width="100%" height="150" viewBox="0 0 320 180" fill="none" xmlns="http://www.w3.org/2000/svg" style="max-width: 300px; display: block; margin: 0 auto;">
            <rect width="320" height="180" rx="12" fill="#F8FAFC" stroke="#E2E8F0" stroke-width="1.5"/>
            <rect x="0" y="0" width="320" height="36" rx="12" fill="#FFFFFF"/>
            <rect x="0" y="24" width="320" height="12" fill="#FFFFFF"/>
            <line x1="0" y1="36" x2="320" y2="36" stroke="#E2E8F0" stroke-width="1"/>
            <circle cx="16" cy="18" r="4" fill="#10B981"/>
            <text x="28" y="22" fill="#0F172A" font-size="11" font-weight="700">Privacy & Security Console</text>
            <rect x="236" y="8" width="68" height="20" rx="10" fill="#ECFDF5" stroke="#A7F3D0" stroke-width="1"/>
            <text x="270" y="22" fill="#059669" font-size="10" font-weight="700" text-anchor="middle">100% Private</text>
            <rect x="18" y="50" width="136" height="52" rx="8" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="1.2"/>
            <text x="30" y="70" fill="#64748B" font-size="10" font-weight="600">Ad Scanning</text>
            <text x="30" y="90" fill="#059669" font-size="14" font-weight="800">0 Tracking / 0 Ads</text>
            <rect x="166" y="50" width="136" height="52" rx="8" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="1.2"/>
            <text x="178" y="70" fill="#64748B" font-size="10" font-weight="600">Encryption Standard</text>
            <text x="178" y="90" fill="#0078D4" font-size="14" font-weight="800">TLS 1.3 / AES</text>
            <rect x="18" y="112" width="284" height="50" rx="8" fill="#ECFDF5" stroke="#A7F3D0" stroke-width="1.2"/>
            <circle cx="38" cy="137" r="10" fill="#059669"/>
            <path d="M34 137L37 140L42 134" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <text x="56" y="134" fill="#065F46" font-size="11.5" font-weight="700">Never selling user data or profiles to third parties</text>
            <text x="56" y="149" fill="#047857" font-size="10" font-weight="500">Zero ads · Zero popups · True communication focus</text>
          </svg>
        </div>
        <div style="flex: 1; min-width: 280px;">
          <div style="display: inline-flex; align-items: center; gap: 6px; background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.25); padding: 4px 12px; border-radius: 9999px; color: #059669; font-size: 12.5px; font-weight: 700; margin-bottom: 10px;">
            🛡️ Pure & Private · 100% Ad-Free
          </div>
          <h3 style="font-size: 17.5px; font-weight: 800; color: #0f172a; margin: 0 0 8px;">No Splash, No Popups, Never Peeking at Your Emails</h3>
          <p style="font-size: 13.5px; color: #475569; line-height: 1.7; margin: 0 0 14px;">
            We stay true to the pure essence of email communication. No annoying splash ads, banners, or spam popups. Our system never performs commercial data mining or behavioral profiling, giving you a clean, tranquil, and reliable workspace.
          </p>
          <div>
            <span style="background: #d1fae5; color: #065f46; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600; margin-right: 8px;">🚫 Zero Popups</span>
            <span style="background: #d1fae5; color: #065f46; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600;">🔒 Privacy First</span>
          </div>
        </div>
      </div>

      <!-- Section 3 (Zigzag: Text Left, Illustration Right) -->
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 32px; background: linear-gradient(135deg, #fffbeb 0%, #ffffff 100%); border: 1px solid #fde68a; border-radius: 16px; padding: 24px 28px; box-shadow: 0 4px 16px rgba(245, 158, 11, 0.05); flex-wrap: wrap;">
        <div style="flex: 1; min-width: 280px;">
          <div style="display: inline-flex; align-items: center; gap: 6px; background: rgba(245, 158, 11, 0.1); border: 1px solid rgba(245, 158, 11, 0.25); padding: 4px 12px; border-radius: 9999px; color: #d97706; font-size: 12.5px; font-weight: 700; margin-bottom: 10px;">
            ⚡ Global Edge Network · Blazing Fast
          </div>
          <h3 style="font-size: 17.5px; font-weight: 800; color: #0f172a; margin: 0 0 8px;">Global Edge CDN Direct Connection, Millisecond Response</h3>
          <p style="font-size: 13.5px; color: #475569; line-height: 1.7; margin: 0 0 14px;">
            Powered by 300+ edge nodes worldwide with high-speed CDN acceleration. Wherever you are, enjoy millisecond loading and instant global delivery without requiring proxies.
          </p>
          <div>
            <span style="background: #fef3c7; color: #92400e; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600; margin-right: 8px;">🚀 Sub-second Loading</span>
            <span style="background: #fef3c7; color: #92400e; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600;">🌍 Global Edge CDN</span>
          </div>
        </div>
        <div style="width: 300px; flex-shrink: 0; display: flex; align-items: center; justify-content: center;">
          <svg width="100%" height="150" viewBox="0 0 320 180" fill="none" xmlns="http://www.w3.org/2000/svg" style="max-width: 300px; display: block; margin: 0 auto;">
            <rect width="320" height="180" rx="12" fill="#F8FAFC" stroke="#E2E8F0" stroke-width="1.5"/>
            <rect x="0" y="0" width="320" height="36" rx="12" fill="#FFFFFF"/>
            <rect x="0" y="24" width="320" height="12" fill="#FFFFFF"/>
            <line x1="0" y1="36" x2="320" y2="36" stroke="#E2E8F0" stroke-width="1"/>
            <circle cx="16" cy="18" r="4" fill="#F59E0B"/>
            <text x="28" y="22" fill="#0F172A" font-size="11" font-weight="700">Global Edge CDN Direct Link</text>
            <rect x="236" y="8" width="68" height="20" rx="10" fill="#FEF3C7" stroke="#FDE68A" stroke-width="1"/>
            <text x="270" y="22" fill="#D97706" font-size="10" font-weight="700" text-anchor="middle">⚡ &lt; 20ms</text>
            <rect x="18" y="50" width="284" height="112" rx="8" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="1.2"/>
            <line x1="60" y1="106" x2="160" y2="106" stroke="#0078D4" stroke-width="2" stroke-dasharray="4 3"/>
            <line x1="160" y1="106" x2="260" y2="106" stroke="#10B981" stroke-width="2"/>
            <circle cx="60" cy="106" r="16" fill="#EFF6FF" stroke="#0078D4" stroke-width="1.5"/>
            <text x="60" y="110" fill="#0078D4" font-size="11" font-weight="800" text-anchor="middle">User</text>
            <text x="60" y="138" fill="#64748B" font-size="9.5" font-weight="600" text-anchor="middle">Direct Link</text>
            <circle cx="160" cy="106" r="20" fill="#FEF3C7" stroke="#F59E0B" stroke-width="1.8"/>
            <text x="160" y="109" fill="#D97706" font-size="10" font-weight="800" text-anchor="middle">EDGE</text>
            <text x="160" y="120" fill="#B45309" font-size="8" font-weight="700" text-anchor="middle">CDN</text>
            <text x="160" y="144" fill="#D97706" font-size="9.5" font-weight="700" text-anchor="middle">300+ Nodes</text>
            <circle cx="260" cy="106" r="16" fill="#ECFDF5" stroke="#10B981" stroke-width="1.5"/>
            <text x="260" y="110" fill="#059669" font-size="11" font-weight="800" text-anchor="middle">Global</text>
            <text x="260" y="138" fill="#64748B" font-size="9.5" font-weight="600" text-anchor="middle">Fast Delivery</text>
          </svg>
        </div>
      </div>

      <!-- Section 4 (Zigzag: Illustration Left, Text Right) -->
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 32px; background: linear-gradient(135deg, #f5f3ff 0%, #ffffff 100%); border: 1px solid #ddd6fe; border-radius: 16px; padding: 24px 28px; box-shadow: 0 4px 16px rgba(124, 58, 237, 0.05); flex-wrap: wrap;">
        <div style="width: 300px; flex-shrink: 0; display: flex; align-items: center; justify-content: center;">
          <svg width="100%" height="150" viewBox="0 0 320 180" fill="none" xmlns="http://www.w3.org/2000/svg" style="max-width: 300px; display: block; margin: 0 auto;">
            <rect width="320" height="180" rx="12" fill="#F8FAFC" stroke="#E2E8F0" stroke-width="1.5"/>
            <rect x="0" y="0" width="320" height="36" rx="12" fill="#FFFFFF"/>
            <rect x="0" y="24" width="320" height="12" fill="#FFFFFF"/>
            <line x1="0" y1="36" x2="320" y2="36" stroke="#E2E8F0" stroke-width="1"/>
            <circle cx="16" cy="18" r="4" fill="#7C3AED"/>
            <text x="28" y="22" fill="#0F172A" font-size="11" font-weight="700">Smart Inbox Action Stream</text>
            <rect x="226" y="8" width="78" height="20" rx="10" fill="#EDE9FE" stroke="#DDD6FE" stroke-width="1"/>
            <text x="265" y="22" fill="#6D28D9" font-size="10" font-weight="700" text-anchor="middle">⏰ Snoozed</text>
            <rect x="18" y="48" width="284" height="34" rx="6" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="1.2"/>
            <circle cx="34" cy="65" r="5" fill="#7C3AED"/>
            <text x="48" y="69" fill="#0F172A" font-size="11" font-weight="700">Weekly Report & Architecture Review</text>
            <rect x="220" y="55" width="72" height="20" rx="4" fill="#F5F3FF"/>
            <text x="256" y="69" fill="#7C3AED" font-size="9.5" font-weight="700" text-anchor="middle">⏰ Tomorrow 09:00</text>
            <rect x="18" y="88" width="284" height="34" rx="6" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="1.2"/>
            <circle cx="34" cy="105" r="5" fill="#F59E0B"/>
            <text x="48" y="109" fill="#0F172A" font-size="11" font-weight="700">GitHub Security Alert</text>
            <rect x="220" y="95" width="72" height="20" rx="4" fill="#FEF3C7"/>
            <text x="256" y="109" fill="#D97706" font-size="9.5" font-weight="700" text-anchor="middle">⭐ 重要星标</text>
            <rect x="18" y="128" width="284" height="36" rx="6" fill="#F1F5F9" stroke="#CBD5E1" stroke-width="1"/>
            <text x="32" y="151" fill="#64748B" font-size="11" font-family="monospace">🔍 毫秒级全文即时检索...</text>
            <rect x="238" y="134" width="54" height="24" rx="4" fill="#0078D4"/>
            <text x="265" y="150" fill="#FFFFFF" font-size="10" font-weight="700" text-anchor="middle">回车检索</text>
          </svg>
        </div>
        <div style="flex: 1; min-width: 280px;">
          <div style="display: inline-flex; align-items: center; gap: 6px; background: rgba(124, 58, 237, 0.1); border: 1px solid rgba(124, 58, 237, 0.25); padding: 4px 12px; border-radius: 9999px; color: #7c3aed; font-size: 12.5px; font-weight: 700; margin-bottom: 10px;">
            📥 进阶工作流 · 极简轻快
          </div>
          <h3 style="font-size: 17.5px; font-weight: 800; color: #0f172a; margin: 0 0 8px;">稍后处理 (Snooze)、星标代办与全文即时检索</h3>
          <p style="font-size: 13.5px; color: #475569; line-height: 1.7; margin: 0 0 14px;">
            内置现代高效的工作流体验。重要的信件可以一键设为稍后提醒（Snooze），配合星标代办归档、自定义分类标签与全文即时检索，即使面对成百上千封邮件也能游刃有余、井井有条。
          </p>
          <div>
            <span style="background: #ede9fe; color: #5b21b6; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600; margin-right: 8px;">⏰ 稍后处理代办</span>
            <span style="background: #ede9fe; color: #5b21b6; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600;">⭐ 星标快捷归档</span>
          </div>
        </div>
      </div>

      <!-- Section 5 (Zigzag: Text Left, Illustration Right) -->
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 32px; background: linear-gradient(135deg, #fff1f2 0%, #ffffff 100%); border: 1px solid #fecdd3; border-radius: 16px; padding: 24px 28px; box-shadow: 0 4px 16px rgba(225, 29, 72, 0.05); flex-wrap: wrap;">
        <div style="flex: 1; min-width: 280px;">
          <div style="display: inline-flex; align-items: center; gap: 6px; background: rgba(225, 29, 72, 0.1); border: 1px solid rgba(225, 29, 72, 0.25); padding: 4px 12px; border-radius: 9999px; color: #e11d48; font-size: 12.5px; font-weight: 700; margin-bottom: 10px;">
            🔀 别名隔离 · 垃圾邮件一键熔断
          </div>
          <h3 style="font-size: 17.5px; font-weight: 800; color: #0f172a; margin: 0 0 8px;">各平台独立别名分发，外部泄露一键切断</h3>
          <p style="font-size: 13.5px; color: #475569; line-height: 1.7; margin: 0 0 14px;">
            支持为 GitHub、Steam 或各类网站独立分配专属别名。一旦某个外部平台遭遇数据泄露或被垃圾营销骚扰，只需一键禁用该别名即可物理熔断，你的真实Main邮箱永远安全隐身。
          </p>
          <div>
            <span style="background: #ffe4e6; color: #9f1239; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600; margin-right: 8px;">🛑 一键物理熔断</span>
            <span style="background: #ffe4e6; color: #9f1239; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600;">🛡️ 真实Main号隐身</span>
          </div>
        </div>
        <div style="width: 300px; flex-shrink: 0; display: flex; align-items: center; justify-content: center;">
          <svg width="100%" height="150" viewBox="0 0 320 180" fill="none" xmlns="http://www.w3.org/2000/svg" style="max-width: 300px; display: block; margin: 0 auto;">
            <rect width="320" height="180" rx="12" fill="#F8FAFC" stroke="#E2E8F0" stroke-width="1.5"/>
            <rect x="0" y="0" width="320" height="36" rx="12" fill="#FFFFFF"/>
            <rect x="0" y="24" width="320" height="12" fill="#FFFFFF"/>
            <line x1="0" y1="36" x2="320" y2="36" stroke="#E2E8F0" stroke-width="1"/>
            <circle cx="16" cy="18" r="4" fill="#E11D48"/>
            <text x="28" y="22" fill="#0F172A" font-size="11" font-weight="700">Multi-Alias Routing & Fuse</text>
            <rect x="236" y="8" width="68" height="20" rx="10" fill="#FFE4E6" stroke="#FECDD3" stroke-width="1"/>
            <text x="270" y="22" fill="#E11D48" font-size="10" font-weight="700" text-anchor="middle">🛡️ Protect Primary</text>
            <rect x="18" y="52" width="76" height="110" rx="8" fill="#0078D4" filter="drop-shadow(0 4px 10px rgba(0,120,212,0.25))"/>
            <circle cx="56" cy="85" r="14" fill="#FFFFFF" fill-opacity="0.2"/>
            <text x="56" y="90" fill="#FFFFFF" font-size="14" font-weight="800" text-anchor="middle">Main</text>
            <text x="56" y="118" fill="#FFFFFF" font-size="11" font-weight="700" text-anchor="middle">Main邮箱</text>
            <text x="56" y="134" fill="#BFDBFE" font-size="9" font-weight="600" text-anchor="middle">🔒 Safe & Hidden</text>
            <path d="M94 72H130C140 72 140 64 150 64H170" stroke="#10B981" stroke-width="1.8"/>
            <path d="M94 107H170" stroke="#10B981" stroke-width="1.8"/>
            <path d="M94 142H130C140 142 140 150 150 150H170" stroke="#E11D48" stroke-width="1.8" stroke-dasharray="3 3"/>
            <rect x="170" y="48" width="132" height="32" rx="6" fill="#FFFFFF" stroke="#A7F3D0" stroke-width="1.2"/>
            <text x="180" y="68" fill="#0F172A" font-size="10" font-weight="600">github@alias</text>
            <rect x="254" y="54" width="42" height="20" rx="4" fill="#ECFDF5"/>
            <text x="275" y="68" fill="#059669" font-size="9" font-weight="700" text-anchor="middle">● Active</text>
            <rect x="170" y="91" width="132" height="32" rx="6" fill="#FFFFFF" stroke="#A7F3D0" stroke-width="1.2"/>
            <text x="180" y="111" fill="#0F172A" font-size="10" font-weight="600">steam@alias</text>
            <rect x="254" y="97" width="42" height="20" rx="4" fill="#ECFDF5"/>
            <text x="275" y="111" fill="#059669" font-size="9" font-weight="700" text-anchor="middle">● Active</text>
            <rect x="170" y="134" width="132" height="32" rx="6" fill="#FFF1F2" stroke="#FECDD3" stroke-width="1.2"/>
            <text x="180" y="154" fill="#9F1239" font-size="10" font-weight="600">spam@alias</text>
            <rect x="254" y="140" width="42" height="20" rx="4" fill="#FFE4E6"/>
            <text x="275" y="154" fill="#E11D48" font-size="9" font-weight="700" text-anchor="middle">✕ Fused</text>
          </svg>
        </div>
      </div>

    </div>

    <!-- Full-Width Interactive Call-To-Action (CTA) Buttons -->
    <div style="text-align: center; margin: 32px 0 24px;">
      <a href="/inbox" style="display: inline-block; background: linear-gradient(135deg, #0078D4 0%, #2563eb 100%); color: #ffffff; text-decoration: none; font-weight: 700; font-size: 15px; padding: 13px 32px; border-radius: 9999px; box-shadow: 0 4px 16px rgba(37, 99, 235, 0.35); margin: 0 10px 10px;">
        🚀 Open My Inbox
      </a>
      <a href="/settings/profile" style="display: inline-block; background: #ffffff; color: #0078D4; text-decoration: none; font-weight: 600; font-size: 14.5px; padding: 12px 28px; border-radius: 9999px; border: 1.5px solid #bfdbfe; margin: 0 10px 10px;">
        👤 Configure Profile & Settings
      </a>
    </div>

    <!-- 3-Step Quick Start Guide -->
    <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 16px; padding: 22px 26px; margin: 24px 0;">
      <div style="font-weight: 700; font-size: 15px; color: #1e293b; margin-bottom: 12px; display: flex; align-items: center; gap: 8px;">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" fill="#0078D4"/>
        </svg>
        <span>3-Step Quick Start Guide</span>
      </div>
      <div style="font-size: 13.5px; color: #475569; line-height: 1.9;">
        <div><strong>1. Experience Starring & Snoozing: </strong> This welcome email is automatically placed in your [Snoozed] and [Starred] folders. Click to explore instant triage.</div>
        <div><strong>2. Set Up Profile & Appearance: </strong> 前往「个人设置」上传属于你的专属头像、昵称，并切换喜欢的个性化Main题。</div>
        <div><strong>3. Compose Your First Email: </strong> 点击左上角「写邮件」，即刻体验流畅轻快的撰写与Global极速投递。</div>
      </div>
    </div>

    <div style="margin-top: 24px; padding-top: 16px; border-top: 1px dashed #cbd5e1; font-size: 12.5px; color: #94a3b8; line-height: 1.65;">
      <div>📌 <strong>贴心提示：</strong> This is an official onboarding email. The system has set an auto-cleanup retention period; it will safely expire automatically without requiring manual deletion.</div>
      <div style="margin-top: 10px; font-weight: 600; color: #64748b;">Epocanvas Mail Team · Powering Your Productive Days</div>
    </div>
  </div>
</div>`
  },
  fr: {
    lang: 'fr',
    name: 'Français',
    subject: "🎉 Bienvenue sur Epocanvas Mail · Votre messagerie à domaine exclusif",
    content: `<div style="width: 100%; max-width: 100%; box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', Roboto, Helvetica, Arial, sans-serif; color: #1e293b; line-height: 1.6; background: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 10px 35px -6px rgba(0, 0, 0, 0.08);">
  <!-- Top Full-Width Banner with Microsoft Azure Gradient & Official EpoMail Brand Logo -->
  <div style="background: linear-gradient(135deg, #0078D4 0%, #0284c7 35%, #2563eb 70%, #4338ca 100%); padding: 40px 42px 34px; text-align: left; position: relative;">
    <div style="display: flex; align-items: center; justify-content: space-between; gap: 24px; flex-wrap: wrap;">
      <div style="flex: 1; min-width: 300px;">
        <div style="display: inline-flex; align-items: center; gap: 8px; background: rgba(255, 255, 255, 0.22); border: 1px solid rgba(255, 255, 255, 0.35); padding: 5px 14px; border-radius: 20px; color: #ffffff; font-size: 13px; font-weight: 600; margin-bottom: 14px; backdrop-filter: blur(8px);">
          <span>✨ Votre messagerie à domaine exclusif est prête</span>
        </div>
        <h1 style="margin: 0; color: #ffffff; font-size: 26px; font-weight: 800; letter-spacing: -0.02em; line-height: 1.35;">Bonjour {{user_name}}, ravis de vous rencontrer !</h1>
        <p style="margin: 10px 0 0; color: rgba(255, 255, 255, 0.95); font-size: 14.5px; line-height: 1.55;">Zéro configuration · Sans publicité · Ultra-rapide · Identité geek exclusive</p>
      </div>
      <!-- Official EpoMail Cloud Logo SVG Artwork -->
      <div style="flex-shrink: 0; display: flex; align-items: center; justify-content: center; width: 92px; height: 92px; background: rgba(255, 255, 255, 0.18); border-radius: 22px; border: 1.5px solid rgba(255, 255, 255, 0.38); box-shadow: 0 10px 28px rgba(0, 0, 0, 0.18); backdrop-filter: blur(10px);">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="76" height="76" style="display:block; flex-shrink:0;">
          <defs>
            <linearGradient id="epomailLogoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#00F5D4" />
              <stop offset="40%" stop-color="#0072FF" />
              <stop offset="100%" stop-color="#5B24FF" />
            </linearGradient>
            <mask id="epomailCutout">
              <rect width="100%" height="100%" fill="white" />
              <path d="M 15 210 L 200 270 L 385 210" fill="none" stroke="black" stroke-width="12" stroke-linecap="round" stroke-linejoin="round" />
              <line x1="60" y1="320" x2="140" y2="280" stroke="black" stroke-width="10" stroke-linecap="round" />
              <line x1="340" y1="320" x2="260" y2="280" stroke="black" stroke-width="10" stroke-linecap="round" />
              <circle cx="200" cy="270" r="26" fill="white" />
              <circle cx="200" cy="270" r="26" fill="none" stroke="black" stroke-width="10" />
              <circle cx="200" cy="270" r="4.5" fill="black" />
              <line x1="200" y1="270" x2="188" y2="258" stroke="black" stroke-width="7" stroke-linecap="round" />
              <line x1="200" y1="270" x2="215" y2="258" stroke="black" stroke-width="7" stroke-linecap="round" />
            </mask>
          </defs>
          <path d="M 60 110 Q 70 110 70 100 Q 70 110 80 110 Q 70 110 70 120 Q 70 110 60 110 Z" fill="#00F5D4" opacity="0.85" />
          <path d="M 330 90 Q 335 90 335 85 Q 335 90 340 90 Q 335 90 335 95 Q 335 90 330 90 Z" fill="#FF369B" opacity="0.9" />
          <circle cx="85" cy="180" r="2.5" fill="#5B24FF" opacity="0.6" />
          <circle cx="320" cy="180" r="3" fill="#0072FF" opacity="0.7" />
          <path d="M 40 220 A 60 60 0 0 1 120 155 A 85 85 0 0 1 280 155 A 60 60 0 0 1 360 220 L 360 260 C 360 325 290 335 200 335 C 110 335 40 325 40 260 Z" fill="url(#epomailLogoGrad)" mask="url(#epomailCutout)" />
        </svg>
      </div>
    </div>
  </div>

  <div style="padding: 36px 42px 34px;">
    <p style="font-size: 16px; color: #0f172a; margin-top: 0; font-weight: 700;">Bonjour {{user_name}}, bienvenue sur Epocanvas Mail !</p>
    <p style="font-size: 14.5px; color: #475569; line-height: 1.8; margin: 0 0 28px;">
      Nous sommes ravis de vous accueillir. Il s'agit d'une messagerie à nom de domaine personnalisé conçue avec passion et ouverte à tous. Nous prenons en charge toute la complexité technique : achat de domaine, DNS, vérifications MX/SPF et serveurs cloud. Votre boîte mail dédiée ({{user_email}}) est prête ! Découvrez nos fonctionnalités ci-dessous :
    </p>

    <!-- 5 Alternating Zigzag Storytelling Value Sections -->
    <div style="margin: 28px 0; display: flex; flex-direction: column; gap: 20px;">
      
      <!-- Section 1 (Zigzag: Text Left, Illustration Right) -->
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 32px; background: linear-gradient(135deg, #f0f7ff 0%, #ffffff 100%); border: 1px solid #bfdbfe; border-radius: 16px; padding: 24px 28px; box-shadow: 0 4px 16px rgba(0, 120, 212, 0.05); flex-wrap: wrap;">
        <div style="flex: 1; min-width: 280px;">
          <div style="display: inline-flex; align-items: center; gap: 6px; background: rgba(0, 120, 212, 0.1); border: 1px solid rgba(0, 120, 212, 0.25); padding: 4px 12px; border-radius: 9999px; color: #0078D4; font-size: 12.5px; font-weight: 700; margin-bottom: 10px;">
            🌐 Identité geek exclusive · Zéro souci de domaine
          </div>
          <h3 style="font-size: 17.5px; font-weight: 800; color: #0f172a; margin: 0 0 8px;">Aucune configuration DNS ou MX requise — Identité immédiate</h3>
          <p style="font-size: 13.5px; color: #475569; line-height: 1.7; margin: 0 0 14px;">
            Say goodbye to complex domain purchasing and record configurations. With Epocanvas Mail, you immediately get a cool address like <code style="background: #e0f2fe; color: #0284c7; font-weight: 700; padding: 2px 8px; border-radius: 6px; font-size: 13px;">{{user_name}}@domain</code> for resumes, tech collaboration, or daily communications.
          </p>
          <div>
            <span style="background: #e2e8f0; color: #334155; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600; margin-right: 8px;">✨ Prêt à l'emploi</span>
            <span style="background: #e2e8f0; color: #334155; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600;">🏷️ Multiples domaines</span>
          </div>
        </div>
        <div style="width: 300px; flex-shrink: 0; display: flex; align-items: center; justify-content: center;">
          <svg width="100%" height="150" viewBox="0 0 320 180" fill="none" xmlns="http://www.w3.org/2000/svg" style="max-width: 300px; display: block; margin: 0 auto;">
            <rect width="320" height="180" rx="12" fill="#F8FAFC" stroke="#E2E8F0" stroke-width="1.5"/>
            <rect x="0" y="0" width="320" height="36" rx="12" fill="#FFFFFF"/>
            <rect x="0" y="24" width="320" height="12" fill="#FFFFFF"/>
            <line x1="0" y1="36" x2="320" y2="36" stroke="#E2E8F0" stroke-width="1"/>
            <circle cx="16" cy="18" r="4" fill="#EF4444"/>
            <circle cx="28" cy="18" r="4" fill="#F59E0B"/>
            <circle cx="40" cy="18" r="4" fill="#10B981"/>
            <rect x="56" y="8" width="248" height="20" rx="6" fill="#F1F5F9"/>
            <circle cx="68" cy="18" r="3" fill="#10B981"/>
            <text x="78" y="22" fill="#0284C7" font-size="10" font-weight="600" font-family="monospace">https://epomail.bond/@me</text>
            <rect x="20" y="52" width="280" height="110" rx="10" fill="#FFFFFF" stroke="#CBD5E1" stroke-width="1.2" filter="drop-shadow(0 4px 12px rgba(0,0,0,0.04))"/>
            <circle cx="50" cy="86" r="18" fill="#0078D4"/>
            <text x="50" y="92" fill="#FFFFFF" font-size="13" font-weight="800" text-anchor="middle">@</text>
            <text x="80" y="80" fill="#0F172A" font-size="13" font-weight="700">Carte de visite geek exclusive</text>
            <text x="80" y="96" fill="#64748B" font-size="11" font-weight="500" font-family="monospace">user@epomail.bond</text>
            <rect x="220" y="70" width="64" height="20" rx="10" fill="#ECFDF5" stroke="#A7F3D0" stroke-width="1"/>
            <text x="252" y="84" fill="#059669" font-size="10" font-weight="700" text-anchor="middle">● DNS actif</text>
            <line x1="32" y1="120" x2="288" y2="120" stroke="#F1F5F9" stroke-width="1"/>
            <rect x="32" y="130" width="76" height="18" rx="4" fill="#EFF6FF"/>
            <text x="70" y="143" fill="#0078D4" font-size="9.5" font-weight="600" text-anchor="middle">SPF vérifié</text>
            <rect x="116" y="130" width="80" height="18" rx="4" fill="#EFF6FF"/>
            <text x="156" y="143" fill="#0078D4" font-size="9.5" font-weight="600" text-anchor="middle">DKIM signé</text>
            <rect x="204" y="130" width="76" height="18" rx="4" fill="#EFF6FF"/>
            <text x="242" y="143" fill="#0078D4" font-size="9.5" font-weight="600" text-anchor="middle">DMARC 100%</text>
          </svg>
        </div>
      </div>

      <!-- Section 2 (Zigzag: Illustration Left, Text Right) -->
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 32px; background: linear-gradient(135deg, #ecfdf5 0%, #ffffff 100%); border: 1px solid #a7f3d0; border-radius: 16px; padding: 24px 28px; box-shadow: 0 4px 16px rgba(16, 185, 129, 0.05); flex-wrap: wrap;">
        <div style="width: 300px; flex-shrink: 0; display: flex; align-items: center; justify-content: center;">
          <svg width="100%" height="150" viewBox="0 0 320 180" fill="none" xmlns="http://www.w3.org/2000/svg" style="max-width: 300px; display: block; margin: 0 auto;">
            <rect width="320" height="180" rx="12" fill="#F8FAFC" stroke="#E2E8F0" stroke-width="1.5"/>
            <rect x="0" y="0" width="320" height="36" rx="12" fill="#FFFFFF"/>
            <rect x="0" y="24" width="320" height="12" fill="#FFFFFF"/>
            <line x1="0" y1="36" x2="320" y2="36" stroke="#E2E8F0" stroke-width="1"/>
            <circle cx="16" cy="18" r="4" fill="#10B981"/>
            <text x="28" y="22" fill="#0F172A" font-size="11" font-weight="700">Console de sécurité et confidentialité</text>
            <rect x="236" y="8" width="68" height="20" rx="10" fill="#ECFDF5" stroke="#A7F3D0" stroke-width="1"/>
            <text x="270" y="22" fill="#059669" font-size="10" font-weight="700" text-anchor="middle">100% privé</text>
            <rect x="18" y="50" width="136" height="52" rx="8" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="1.2"/>
            <text x="30" y="70" fill="#64748B" font-size="10" font-weight="600">Analyse publicitaire</text>
            <text x="30" y="90" fill="#059669" font-size="14" font-weight="800">0 pistage / 0 pub</text>
            <rect x="166" y="50" width="136" height="52" rx="8" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="1.2"/>
            <text x="178" y="70" fill="#64748B" font-size="10" font-weight="600">Chiffrement</text>
            <text x="178" y="90" fill="#0078D4" font-size="14" font-weight="800">TLS 1.3 / AES</text>
            <rect x="18" y="112" width="284" height="50" rx="8" fill="#ECFDF5" stroke="#A7F3D0" stroke-width="1.2"/>
            <circle cx="38" cy="137" r="10" fill="#059669"/>
            <path d="M34 137L37 140L42 134" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <text x="56" y="134" fill="#065F46" font-size="11.5" font-weight="700">Aucune revente de données à des tiers</text>
            <text x="56" y="149" fill="#047857" font-size="10" font-weight="500">Zéro pub · Zéro popup · Communication pure</text>
          </svg>
        </div>
        <div style="flex: 1; min-width: 280px;">
          <div style="display: inline-flex; align-items: center; gap: 6px; background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.25); padding: 4px 12px; border-radius: 9999px; color: #059669; font-size: 12.5px; font-weight: 700; margin-bottom: 10px;">
            🛡️ Pur et privé · 100% sans publicité
          </div>
          <h3 style="font-size: 17.5px; font-weight: 800; color: #0f172a; margin: 0 0 8px;">Sans publicité, sans popups, respect total de votre vie privée</h3>
          <p style="font-size: 13.5px; color: #475569; line-height: 1.7; margin: 0 0 14px;">
            We stay true to the pure essence of email communication. No annoying splash ads, banners, or spam popups. Our system never performs commercial data mining or behavioral profiling, giving you a clean, tranquil, and reliable workspace.
          </p>
          <div>
            <span style="background: #d1fae5; color: #065f46; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600; margin-right: 8px;">🚫 Zéro popup</span>
            <span style="background: #d1fae5; color: #065f46; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600;">🔒 Confidentialité absolue</span>
          </div>
        </div>
      </div>

      <!-- Section 3 (Zigzag: Text Left, Illustration Right) -->
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 32px; background: linear-gradient(135deg, #fffbeb 0%, #ffffff 100%); border: 1px solid #fde68a; border-radius: 16px; padding: 24px 28px; box-shadow: 0 4px 16px rgba(245, 158, 11, 0.05); flex-wrap: wrap;">
        <div style="flex: 1; min-width: 280px;">
          <div style="display: inline-flex; align-items: center; gap: 6px; background: rgba(245, 158, 11, 0.1); border: 1px solid rgba(245, 158, 11, 0.25); padding: 4px 12px; border-radius: 9999px; color: #d97706; font-size: 12.5px; font-weight: 700; margin-bottom: 10px;">
            ⚡ Réseau Edge mondial · Ultra-rapide
          </div>
          <h3 style="font-size: 17.5px; font-weight: 800; color: #0f172a; margin: 0 0 8px;">Connexion CDN Edge mondiale directe, réponse en millisecondes</h3>
          <p style="font-size: 13.5px; color: #475569; line-height: 1.7; margin: 0 0 14px;">
            Powered by 300+ edge nodes worldwide with high-speed CDN acceleration. Wherever you are, enjoy millisecond loading and instant global delivery without requiring proxies.
          </p>
          <div>
            <span style="background: #fef3c7; color: #92400e; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600; margin-right: 8px;">🚀 Chargement instantané</span>
            <span style="background: #fef3c7; color: #92400e; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600;">🌍 Réseau CDN mondial</span>
          </div>
        </div>
        <div style="width: 300px; flex-shrink: 0; display: flex; align-items: center; justify-content: center;">
          <svg width="100%" height="150" viewBox="0 0 320 180" fill="none" xmlns="http://www.w3.org/2000/svg" style="max-width: 300px; display: block; margin: 0 auto;">
            <rect width="320" height="180" rx="12" fill="#F8FAFC" stroke="#E2E8F0" stroke-width="1.5"/>
            <rect x="0" y="0" width="320" height="36" rx="12" fill="#FFFFFF"/>
            <rect x="0" y="24" width="320" height="12" fill="#FFFFFF"/>
            <line x1="0" y1="36" x2="320" y2="36" stroke="#E2E8F0" stroke-width="1"/>
            <circle cx="16" cy="18" r="4" fill="#F59E0B"/>
            <text x="28" y="22" fill="#0F172A" font-size="11" font-weight="700">Liaison directe CDN Edge</text>
            <rect x="236" y="8" width="68" height="20" rx="10" fill="#FEF3C7" stroke="#FDE68A" stroke-width="1"/>
            <text x="270" y="22" fill="#D97706" font-size="10" font-weight="700" text-anchor="middle">⚡ &lt; 20ms</text>
            <rect x="18" y="50" width="284" height="112" rx="8" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="1.2"/>
            <line x1="60" y1="106" x2="160" y2="106" stroke="#0078D4" stroke-width="2" stroke-dasharray="4 3"/>
            <line x1="160" y1="106" x2="260" y2="106" stroke="#10B981" stroke-width="2"/>
            <circle cx="60" cy="106" r="16" fill="#EFF6FF" stroke="#0078D4" stroke-width="1.5"/>
            <text x="60" y="110" fill="#0078D4" font-size="11" font-weight="800" text-anchor="middle">Utilisateur</text>
            <text x="60" y="138" fill="#64748B" font-size="9.5" font-weight="600" text-anchor="middle">Liaison directe</text>
            <circle cx="160" cy="106" r="20" fill="#FEF3C7" stroke="#F59E0B" stroke-width="1.8"/>
            <text x="160" y="109" fill="#D97706" font-size="10" font-weight="800" text-anchor="middle">EDGE</text>
            <text x="160" y="120" fill="#B45309" font-size="8" font-weight="700" text-anchor="middle">CDN</text>
            <text x="160" y="144" fill="#D97706" font-size="9.5" font-weight="700" text-anchor="middle">300+ nœuds</text>
            <circle cx="260" cy="106" r="16" fill="#ECFDF5" stroke="#10B981" stroke-width="1.5"/>
            <text x="260" y="110" fill="#059669" font-size="11" font-weight="800" text-anchor="middle">Mondial</text>
            <text x="260" y="138" fill="#64748B" font-size="9.5" font-weight="600" text-anchor="middle">Envoi rapide</text>
          </svg>
        </div>
      </div>

      <!-- Section 4 (Zigzag: Illustration Left, Text Right) -->
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 32px; background: linear-gradient(135deg, #f5f3ff 0%, #ffffff 100%); border: 1px solid #ddd6fe; border-radius: 16px; padding: 24px 28px; box-shadow: 0 4px 16px rgba(124, 58, 237, 0.05); flex-wrap: wrap;">
        <div style="width: 300px; flex-shrink: 0; display: flex; align-items: center; justify-content: center;">
          <svg width="100%" height="150" viewBox="0 0 320 180" fill="none" xmlns="http://www.w3.org/2000/svg" style="max-width: 300px; display: block; margin: 0 auto;">
            <rect width="320" height="180" rx="12" fill="#F8FAFC" stroke="#E2E8F0" stroke-width="1.5"/>
            <rect x="0" y="0" width="320" height="36" rx="12" fill="#FFFFFF"/>
            <rect x="0" y="24" width="320" height="12" fill="#FFFFFF"/>
            <line x1="0" y1="36" x2="320" y2="36" stroke="#E2E8F0" stroke-width="1"/>
            <circle cx="16" cy="18" r="4" fill="#7C3AED"/>
            <text x="28" y="22" fill="#0F172A" font-size="11" font-weight="700">Flux d'actions intelligent</text>
            <rect x="226" y="8" width="78" height="20" rx="10" fill="#EDE9FE" stroke="#DDD6FE" stroke-width="1"/>
            <text x="265" y="22" fill="#6D28D9" font-size="10" font-weight="700" text-anchor="middle">⏰ En attente</text>
            <rect x="18" y="48" width="284" height="34" rx="6" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="1.2"/>
            <circle cx="34" cy="65" r="5" fill="#7C3AED"/>
            <text x="48" y="69" fill="#0F172A" font-size="11" font-weight="700">Rapport hebdomadaire et revue</text>
            <rect x="220" y="55" width="72" height="20" rx="4" fill="#F5F3FF"/>
            <text x="256" y="69" fill="#7C3AED" font-size="9.5" font-weight="700" text-anchor="middle">⏰ Demain 09:00</text>
            <rect x="18" y="88" width="284" height="34" rx="6" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="1.2"/>
            <circle cx="34" cy="105" r="5" fill="#F59E0B"/>
            <text x="48" y="109" fill="#0F172A" font-size="11" font-weight="700">Alerte sécurité GitHub</text>
            <rect x="220" y="95" width="72" height="20" rx="4" fill="#FEF3C7"/>
            <text x="256" y="109" fill="#D97706" font-size="9.5" font-weight="700" text-anchor="middle">⭐ 重要星标</text>
            <rect x="18" y="128" width="284" height="36" rx="6" fill="#F1F5F9" stroke="#CBD5E1" stroke-width="1"/>
            <text x="32" y="151" fill="#64748B" font-size="11" font-family="monospace">🔍 毫秒级全文即时检索...</text>
            <rect x="238" y="134" width="54" height="24" rx="4" fill="#0078D4"/>
            <text x="265" y="150" fill="#FFFFFF" font-size="10" font-weight="700" text-anchor="middle">回车检索</text>
          </svg>
        </div>
        <div style="flex: 1; min-width: 280px;">
          <div style="display: inline-flex; align-items: center; gap: 6px; background: rgba(124, 58, 237, 0.1); border: 1px solid rgba(124, 58, 237, 0.25); padding: 4px 12px; border-radius: 9999px; color: #7c3aed; font-size: 12.5px; font-weight: 700; margin-bottom: 10px;">
            📥 进阶工作流 · 极简轻快
          </div>
          <h3 style="font-size: 17.5px; font-weight: 800; color: #0f172a; margin: 0 0 8px;">稍后处理 (Snooze)、星标代办与全文即时检索</h3>
          <p style="font-size: 13.5px; color: #475569; line-height: 1.7; margin: 0 0 14px;">
            内置现代高效的工作流体验。重要的信件可以一键设为稍后提醒（Snooze），配合星标代办归档、自定义分类标签与全文即时检索，即使面对成百上千封邮件也能游刃有余、井井有条。
          </p>
          <div>
            <span style="background: #ede9fe; color: #5b21b6; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600; margin-right: 8px;">⏰ 稍后处理代办</span>
            <span style="background: #ede9fe; color: #5b21b6; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600;">⭐ 星标快捷归档</span>
          </div>
        </div>
      </div>

      <!-- Section 5 (Zigzag: Text Left, Illustration Right) -->
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 32px; background: linear-gradient(135deg, #fff1f2 0%, #ffffff 100%); border: 1px solid #fecdd3; border-radius: 16px; padding: 24px 28px; box-shadow: 0 4px 16px rgba(225, 29, 72, 0.05); flex-wrap: wrap;">
        <div style="flex: 1; min-width: 280px;">
          <div style="display: inline-flex; align-items: center; gap: 6px; background: rgba(225, 29, 72, 0.1); border: 1px solid rgba(225, 29, 72, 0.25); padding: 4px 12px; border-radius: 9999px; color: #e11d48; font-size: 12.5px; font-weight: 700; margin-bottom: 10px;">
            🔀 别名隔离 · 垃圾邮件一键熔断
          </div>
          <h3 style="font-size: 17.5px; font-weight: 800; color: #0f172a; margin: 0 0 8px;">各平台独立别名分发，外部泄露一键切断</h3>
          <p style="font-size: 13.5px; color: #475569; line-height: 1.7; margin: 0 0 14px;">
            支持为 GitHub、Steam 或各类网站独立分配专属别名。一旦某个外部平台遭遇数据泄露或被垃圾营销骚扰，只需一键禁用该别名即可物理熔断，你的真实Principal邮箱永远安全隐身。
          </p>
          <div>
            <span style="background: #ffe4e6; color: #9f1239; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600; margin-right: 8px;">🛑 一键物理熔断</span>
            <span style="background: #ffe4e6; color: #9f1239; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600;">🛡️ 真实Principal号隐身</span>
          </div>
        </div>
        <div style="width: 300px; flex-shrink: 0; display: flex; align-items: center; justify-content: center;">
          <svg width="100%" height="150" viewBox="0 0 320 180" fill="none" xmlns="http://www.w3.org/2000/svg" style="max-width: 300px; display: block; margin: 0 auto;">
            <rect width="320" height="180" rx="12" fill="#F8FAFC" stroke="#E2E8F0" stroke-width="1.5"/>
            <rect x="0" y="0" width="320" height="36" rx="12" fill="#FFFFFF"/>
            <rect x="0" y="24" width="320" height="12" fill="#FFFFFF"/>
            <line x1="0" y1="36" x2="320" y2="36" stroke="#E2E8F0" stroke-width="1"/>
            <circle cx="16" cy="18" r="4" fill="#E11D48"/>
            <text x="28" y="22" fill="#0F172A" font-size="11" font-weight="700">Routage multi-alias et fusible</text>
            <rect x="236" y="8" width="68" height="20" rx="10" fill="#FFE4E6" stroke="#FECDD3" stroke-width="1"/>
            <text x="270" y="22" fill="#E11D48" font-size="10" font-weight="700" text-anchor="middle">🛡️ Protéger l'adresse principale</text>
            <rect x="18" y="52" width="76" height="110" rx="8" fill="#0078D4" filter="drop-shadow(0 4px 10px rgba(0,120,212,0.25))"/>
            <circle cx="56" cy="85" r="14" fill="#FFFFFF" fill-opacity="0.2"/>
            <text x="56" y="90" fill="#FFFFFF" font-size="14" font-weight="800" text-anchor="middle">Principal</text>
            <text x="56" y="118" fill="#FFFFFF" font-size="11" font-weight="700" text-anchor="middle">Principal邮箱</text>
            <text x="56" y="134" fill="#BFDBFE" font-size="9" font-weight="600" text-anchor="middle">🔒 En sécurité</text>
            <path d="M94 72H130C140 72 140 64 150 64H170" stroke="#10B981" stroke-width="1.8"/>
            <path d="M94 107H170" stroke="#10B981" stroke-width="1.8"/>
            <path d="M94 142H130C140 142 140 150 150 150H170" stroke="#E11D48" stroke-width="1.8" stroke-dasharray="3 3"/>
            <rect x="170" y="48" width="132" height="32" rx="6" fill="#FFFFFF" stroke="#A7F3D0" stroke-width="1.2"/>
            <text x="180" y="68" fill="#0F172A" font-size="10" font-weight="600">github@alias</text>
            <rect x="254" y="54" width="42" height="20" rx="4" fill="#ECFDF5"/>
            <text x="275" y="68" fill="#059669" font-size="9" font-weight="700" text-anchor="middle">● Actif</text>
            <rect x="170" y="91" width="132" height="32" rx="6" fill="#FFFFFF" stroke="#A7F3D0" stroke-width="1.2"/>
            <text x="180" y="111" fill="#0F172A" font-size="10" font-weight="600">steam@alias</text>
            <rect x="254" y="97" width="42" height="20" rx="4" fill="#ECFDF5"/>
            <text x="275" y="111" fill="#059669" font-size="9" font-weight="700" text-anchor="middle">● Actif</text>
            <rect x="170" y="134" width="132" height="32" rx="6" fill="#FFF1F2" stroke="#FECDD3" stroke-width="1.2"/>
            <text x="180" y="154" fill="#9F1239" font-size="10" font-weight="600">spam@alias</text>
            <rect x="254" y="140" width="42" height="20" rx="4" fill="#FFE4E6"/>
            <text x="275" y="154" fill="#E11D48" font-size="9" font-weight="700" text-anchor="middle">✕ Coupé</text>
          </svg>
        </div>
      </div>

    </div>

    <!-- Full-Width Interactive Call-To-Action (CTA) Buttons -->
    <div style="text-align: center; margin: 32px 0 24px;">
      <a href="/inbox" style="display: inline-block; background: linear-gradient(135deg, #0078D4 0%, #2563eb 100%); color: #ffffff; text-decoration: none; font-weight: 700; font-size: 15px; padding: 13px 32px; border-radius: 9999px; box-shadow: 0 4px 16px rgba(37, 99, 235, 0.35); margin: 0 10px 10px;">
        🚀 Ouvrir ma boîte de réception
      </a>
      <a href="/settings/profile" style="display: inline-block; background: #ffffff; color: #0078D4; text-decoration: none; font-weight: 600; font-size: 14.5px; padding: 12px 28px; border-radius: 9999px; border: 1.5px solid #bfdbfe; margin: 0 10px 10px;">
        👤 Configurer mon profil
      </a>
    </div>

    <!-- Guide de démarrage en 3 étapes -->
    <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 16px; padding: 22px 26px; margin: 24px 0;">
      <div style="font-weight: 700; font-size: 15px; color: #1e293b; margin-bottom: 12px; display: flex; align-items: center; gap: 8px;">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" fill="#0078D4"/>
        </svg>
        <span>Guide de démarrage en 3 étapes</span>
      </div>
      <div style="font-size: 13.5px; color: #475569; line-height: 1.9;">
        <div><strong>1. Découvrez les favoris et rappels : </strong> Cet email est automatiquement placé dans vos dossiers [En attente] et [Favoris]. Cliquez pour explorer le tri rapide.</div>
        <div><strong>2. Personnalisez votre profil : </strong> 前往「个人设置」上传属于你的专属头像、昵称，并切换喜欢的个性化Principal题。</div>
        <div><strong>3. Écrivez votre premier email : </strong> 点击左上角「写邮件」，即刻体验流畅轻快的撰写与Mondial极速投递。</div>
      </div>
    </div>

    <div style="margin-top: 24px; padding-top: 16px; border-top: 1px dashed #cbd5e1; font-size: 12.5px; color: #94a3b8; line-height: 1.65;">
      <div>📌 <strong>贴心提示：</strong> Ceci est un message officiel d'accueil. Une période de rétention automatique est configurée ; il sera nettoyé automatiquement.</div>
      <div style="margin-top: 10px; font-weight: 600; color: #64748b;">L'équipe Epocanvas Mail · Pour vos journées productives</div>
    </div>
  </div>
</div>`
  },
  es: {
    lang: 'es',
    name: 'Español',
    subject: "🎉 Bienvenido a Epocanvas Mail · Tu buzón con dominio exclusivo",
    content: `<div style="width: 100%; max-width: 100%; box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', Roboto, Helvetica, Arial, sans-serif; color: #1e293b; line-height: 1.6; background: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 10px 35px -6px rgba(0, 0, 0, 0.08);">
  <!-- Top Full-Width Banner with Microsoft Azure Gradient & Official EpoMail Brand Logo -->
  <div style="background: linear-gradient(135deg, #0078D4 0%, #0284c7 35%, #2563eb 70%, #4338ca 100%); padding: 40px 42px 34px; text-align: left; position: relative;">
    <div style="display: flex; align-items: center; justify-content: space-between; gap: 24px; flex-wrap: wrap;">
      <div style="flex: 1; min-width: 300px;">
        <div style="display: inline-flex; align-items: center; gap: 8px; background: rgba(255, 255, 255, 0.22); border: 1px solid rgba(255, 255, 255, 0.35); padding: 5px 14px; border-radius: 20px; color: #ffffff; font-size: 13px; font-weight: 600; margin-bottom: 14px; backdrop-filter: blur(8px);">
          <span>✨ Tu buzón con dominio exclusivo está listo</span>
        </div>
        <h1 style="margin: 0; color: #ffffff; font-size: 26px; font-weight: 800; letter-spacing: -0.02em; line-height: 1.35;">¡Hola {{user_name}}, un placer conocerte!</h1>
        <p style="margin: 10px 0 0; color: rgba(255, 255, 255, 0.95); font-size: 14.5px; line-height: 1.55;">Cero configuración · Sin publicidad · Súper rápido · Identidad geek exclusiva</p>
      </div>
      <!-- Official EpoMail Cloud Logo SVG Artwork -->
      <div style="flex-shrink: 0; display: flex; align-items: center; justify-content: center; width: 92px; height: 92px; background: rgba(255, 255, 255, 0.18); border-radius: 22px; border: 1.5px solid rgba(255, 255, 255, 0.38); box-shadow: 0 10px 28px rgba(0, 0, 0, 0.18); backdrop-filter: blur(10px);">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="76" height="76" style="display:block; flex-shrink:0;">
          <defs>
            <linearGradient id="epomailLogoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#00F5D4" />
              <stop offset="40%" stop-color="#0072FF" />
              <stop offset="100%" stop-color="#5B24FF" />
            </linearGradient>
            <mask id="epomailCutout">
              <rect width="100%" height="100%" fill="white" />
              <path d="M 15 210 L 200 270 L 385 210" fill="none" stroke="black" stroke-width="12" stroke-linecap="round" stroke-linejoin="round" />
              <line x1="60" y1="320" x2="140" y2="280" stroke="black" stroke-width="10" stroke-linecap="round" />
              <line x1="340" y1="320" x2="260" y2="280" stroke="black" stroke-width="10" stroke-linecap="round" />
              <circle cx="200" cy="270" r="26" fill="white" />
              <circle cx="200" cy="270" r="26" fill="none" stroke="black" stroke-width="10" />
              <circle cx="200" cy="270" r="4.5" fill="black" />
              <line x1="200" y1="270" x2="188" y2="258" stroke="black" stroke-width="7" stroke-linecap="round" />
              <line x1="200" y1="270" x2="215" y2="258" stroke="black" stroke-width="7" stroke-linecap="round" />
            </mask>
          </defs>
          <path d="M 60 110 Q 70 110 70 100 Q 70 110 80 110 Q 70 110 70 120 Q 70 110 60 110 Z" fill="#00F5D4" opacity="0.85" />
          <path d="M 330 90 Q 335 90 335 85 Q 335 90 340 90 Q 335 90 335 95 Q 335 90 330 90 Z" fill="#FF369B" opacity="0.9" />
          <circle cx="85" cy="180" r="2.5" fill="#5B24FF" opacity="0.6" />
          <circle cx="320" cy="180" r="3" fill="#0072FF" opacity="0.7" />
          <path d="M 40 220 A 60 60 0 0 1 120 155 A 85 85 0 0 1 280 155 A 60 60 0 0 1 360 220 L 360 260 C 360 325 290 335 200 335 C 110 335 40 325 40 260 Z" fill="url(#epomailLogoGrad)" mask="url(#epomailCutout)" />
        </svg>
      </div>
    </div>
  </div>

  <div style="padding: 36px 42px 34px;">
    <p style="font-size: 16px; color: #0f172a; margin-top: 0; font-weight: 700;">¡Hola {{user_name}}, bienvenido a Epocanvas Mail!</p>
    <p style="font-size: 14.5px; color: #475569; line-height: 1.8; margin: 0 0 28px;">
      Estamos encantados de darte la bienvenida. Este es un buzón con dominio personalizado creado con pasión y abierto para todos. Nos encargamos de toda la complejidad técnica: compra de dominios, DNS, registros MX/SPF y servidores en la nube. ¡Tu buzón dedicado ({{user_email}}) ya está listo! Descubre nuestras funciones a continuación:
    </p>

    <!-- 5 Alternating Zigzag Storytelling Value Sections -->
    <div style="margin: 28px 0; display: flex; flex-direction: column; gap: 20px;">
      
      <!-- Section 1 (Zigzag: Text Left, Illustration Right) -->
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 32px; background: linear-gradient(135deg, #f0f7ff 0%, #ffffff 100%); border: 1px solid #bfdbfe; border-radius: 16px; padding: 24px 28px; box-shadow: 0 4px 16px rgba(0, 120, 212, 0.05); flex-wrap: wrap;">
        <div style="flex: 1; min-width: 280px;">
          <div style="display: inline-flex; align-items: center; gap: 6px; background: rgba(0, 120, 212, 0.1); border: 1px solid rgba(0, 120, 212, 0.25); padding: 4px 12px; border-radius: 9999px; color: #0078D4; font-size: 12.5px; font-weight: 700; margin-bottom: 10px;">
            🌐 Identidad geek exclusiva · Cero complicaciones
          </div>
          <h3 style="font-size: 17.5px; font-weight: 800; color: #0f172a; margin: 0 0 8px;">Sin necesidad de configurar DNS o MX — Identidad inmediata</h3>
          <p style="font-size: 13.5px; color: #475569; line-height: 1.7; margin: 0 0 14px;">
            Say goodbye to complex domain purchasing and record configurations. With Epocanvas Mail, you immediately get a cool address like <code style="background: #e0f2fe; color: #0284c7; font-weight: 700; padding: 2px 8px; border-radius: 6px; font-size: 13px;">{{user_name}}@domain</code> for resumes, tech collaboration, or daily communications.
          </p>
          <div>
            <span style="background: #e2e8f0; color: #334155; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600; margin-right: 8px;">✨ Listo para usar al instante</span>
            <span style="background: #e2e8f0; color: #334155; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600;">🏷️ Múltiples dominios</span>
          </div>
        </div>
        <div style="width: 300px; flex-shrink: 0; display: flex; align-items: center; justify-content: center;">
          <svg width="100%" height="150" viewBox="0 0 320 180" fill="none" xmlns="http://www.w3.org/2000/svg" style="max-width: 300px; display: block; margin: 0 auto;">
            <rect width="320" height="180" rx="12" fill="#F8FAFC" stroke="#E2E8F0" stroke-width="1.5"/>
            <rect x="0" y="0" width="320" height="36" rx="12" fill="#FFFFFF"/>
            <rect x="0" y="24" width="320" height="12" fill="#FFFFFF"/>
            <line x1="0" y1="36" x2="320" y2="36" stroke="#E2E8F0" stroke-width="1"/>
            <circle cx="16" cy="18" r="4" fill="#EF4444"/>
            <circle cx="28" cy="18" r="4" fill="#F59E0B"/>
            <circle cx="40" cy="18" r="4" fill="#10B981"/>
            <rect x="56" y="8" width="248" height="20" rx="6" fill="#F1F5F9"/>
            <circle cx="68" cy="18" r="3" fill="#10B981"/>
            <text x="78" y="22" fill="#0284C7" font-size="10" font-weight="600" font-family="monospace">https://epomail.bond/@me</text>
            <rect x="20" y="52" width="280" height="110" rx="10" fill="#FFFFFF" stroke="#CBD5E1" stroke-width="1.2" filter="drop-shadow(0 4px 12px rgba(0,0,0,0.04))"/>
            <circle cx="50" cy="86" r="18" fill="#0078D4"/>
            <text x="50" y="92" fill="#FFFFFF" font-size="13" font-weight="800" text-anchor="middle">@</text>
            <text x="80" y="80" fill="#0F172A" font-size="13" font-weight="700">Tarjeta de presentación geek</text>
            <text x="80" y="96" fill="#64748B" font-size="11" font-weight="500" font-family="monospace">user@epomail.bond</text>
            <rect x="220" y="70" width="64" height="20" rx="10" fill="#ECFDF5" stroke="#A7F3D0" stroke-width="1"/>
            <text x="252" y="84" fill="#059669" font-size="10" font-weight="700" text-anchor="middle">● DNS activo</text>
            <line x1="32" y1="120" x2="288" y2="120" stroke="#F1F5F9" stroke-width="1"/>
            <rect x="32" y="130" width="76" height="18" rx="4" fill="#EFF6FF"/>
            <text x="70" y="143" fill="#0078D4" font-size="9.5" font-weight="600" text-anchor="middle">SPF verificado</text>
            <rect x="116" y="130" width="80" height="18" rx="4" fill="#EFF6FF"/>
            <text x="156" y="143" fill="#0078D4" font-size="9.5" font-weight="600" text-anchor="middle">DKIM firmado</text>
            <rect x="204" y="130" width="76" height="18" rx="4" fill="#EFF6FF"/>
            <text x="242" y="143" fill="#0078D4" font-size="9.5" font-weight="600" text-anchor="middle">DMARC 100%</text>
          </svg>
        </div>
      </div>

      <!-- Section 2 (Zigzag: Illustration Left, Text Right) -->
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 32px; background: linear-gradient(135deg, #ecfdf5 0%, #ffffff 100%); border: 1px solid #a7f3d0; border-radius: 16px; padding: 24px 28px; box-shadow: 0 4px 16px rgba(16, 185, 129, 0.05); flex-wrap: wrap;">
        <div style="width: 300px; flex-shrink: 0; display: flex; align-items: center; justify-content: center;">
          <svg width="100%" height="150" viewBox="0 0 320 180" fill="none" xmlns="http://www.w3.org/2000/svg" style="max-width: 300px; display: block; margin: 0 auto;">
            <rect width="320" height="180" rx="12" fill="#F8FAFC" stroke="#E2E8F0" stroke-width="1.5"/>
            <rect x="0" y="0" width="320" height="36" rx="12" fill="#FFFFFF"/>
            <rect x="0" y="24" width="320" height="12" fill="#FFFFFF"/>
            <line x1="0" y1="36" x2="320" y2="36" stroke="#E2E8F0" stroke-width="1"/>
            <circle cx="16" cy="18" r="4" fill="#10B981"/>
            <text x="28" y="22" fill="#0F172A" font-size="11" font-weight="700">Consola de privacidad y seguridad</text>
            <rect x="236" y="8" width="68" height="20" rx="10" fill="#ECFDF5" stroke="#A7F3D0" stroke-width="1"/>
            <text x="270" y="22" fill="#059669" font-size="10" font-weight="700" text-anchor="middle">100% privado</text>
            <rect x="18" y="50" width="136" height="52" rx="8" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="1.2"/>
            <text x="30" y="70" fill="#64748B" font-size="10" font-weight="600">Escaneo de anuncios</text>
            <text x="30" y="90" fill="#059669" font-size="14" font-weight="800">0 rastreo / 0 publicidad</text>
            <rect x="166" y="50" width="136" height="52" rx="8" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="1.2"/>
            <text x="178" y="70" fill="#64748B" font-size="10" font-weight="600">Estándar de cifrado</text>
            <text x="178" y="90" fill="#0078D4" font-size="14" font-weight="800">TLS 1.3 / AES</text>
            <rect x="18" y="112" width="284" height="50" rx="8" fill="#ECFDF5" stroke="#A7F3D0" stroke-width="1.2"/>
            <circle cx="38" cy="137" r="10" fill="#059669"/>
            <path d="M34 137L37 140L42 134" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <text x="56" y="134" fill="#065F46" font-size="11.5" font-weight="700">Nunca vendemos datos de usuarios a terceros</text>
            <text x="56" y="149" fill="#047857" font-size="10" font-weight="500">Cero publicidad · Cero popups · Comunicación pura</text>
          </svg>
        </div>
        <div style="flex: 1; min-width: 280px;">
          <div style="display: inline-flex; align-items: center; gap: 6px; background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.25); padding: 4px 12px; border-radius: 9999px; color: #059669; font-size: 12.5px; font-weight: 700; margin-bottom: 10px;">
            🛡️ Puro y privado · 100% sin publicidad
          </div>
          <h3 style="font-size: 17.5px; font-weight: 800; color: #0f172a; margin: 0 0 8px;">Sin anuncios de pantalla completa, sin popups, total privacidad</h3>
          <p style="font-size: 13.5px; color: #475569; line-height: 1.7; margin: 0 0 14px;">
            We stay true to the pure essence of email communication. No annoying splash ads, banners, or spam popups. Our system never performs commercial data mining or behavioral profiling, giving you a clean, tranquil, and reliable workspace.
          </p>
          <div>
            <span style="background: #d1fae5; color: #065f46; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600; margin-right: 8px;">🚫 Cero popups</span>
            <span style="background: #d1fae5; color: #065f46; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600;">🔒 Privacidad primero</span>
          </div>
        </div>
      </div>

      <!-- Section 3 (Zigzag: Text Left, Illustration Right) -->
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 32px; background: linear-gradient(135deg, #fffbeb 0%, #ffffff 100%); border: 1px solid #fde68a; border-radius: 16px; padding: 24px 28px; box-shadow: 0 4px 16px rgba(245, 158, 11, 0.05); flex-wrap: wrap;">
        <div style="flex: 1; min-width: 280px;">
          <div style="display: inline-flex; align-items: center; gap: 6px; background: rgba(245, 158, 11, 0.1); border: 1px solid rgba(245, 158, 11, 0.25); padding: 4px 12px; border-radius: 9999px; color: #d97706; font-size: 12.5px; font-weight: 700; margin-bottom: 10px;">
            ⚡ Red Edge global · Súper veloz
          </div>
          <h3 style="font-size: 17.5px; font-weight: 800; color: #0f172a; margin: 0 0 8px;">Conexión directa CDN Edge global, respuesta en milisegundos</h3>
          <p style="font-size: 13.5px; color: #475569; line-height: 1.7; margin: 0 0 14px;">
            Powered by 300+ edge nodes worldwide with high-speed CDN acceleration. Wherever you are, enjoy millisecond loading and instant global delivery without requiring proxies.
          </p>
          <div>
            <span style="background: #fef3c7; color: #92400e; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600; margin-right: 8px;">🚀 Carga en milisegundos</span>
            <span style="background: #fef3c7; color: #92400e; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600;">🌍 CDN Edge global</span>
          </div>
        </div>
        <div style="width: 300px; flex-shrink: 0; display: flex; align-items: center; justify-content: center;">
          <svg width="100%" height="150" viewBox="0 0 320 180" fill="none" xmlns="http://www.w3.org/2000/svg" style="max-width: 300px; display: block; margin: 0 auto;">
            <rect width="320" height="180" rx="12" fill="#F8FAFC" stroke="#E2E8F0" stroke-width="1.5"/>
            <rect x="0" y="0" width="320" height="36" rx="12" fill="#FFFFFF"/>
            <rect x="0" y="24" width="320" height="12" fill="#FFFFFF"/>
            <line x1="0" y1="36" x2="320" y2="36" stroke="#E2E8F0" stroke-width="1"/>
            <circle cx="16" cy="18" r="4" fill="#F59E0B"/>
            <text x="28" y="22" fill="#0F172A" font-size="11" font-weight="700">Enlace directo CDN Edge</text>
            <rect x="236" y="8" width="68" height="20" rx="10" fill="#FEF3C7" stroke="#FDE68A" stroke-width="1"/>
            <text x="270" y="22" fill="#D97706" font-size="10" font-weight="700" text-anchor="middle">⚡ &lt; 20ms</text>
            <rect x="18" y="50" width="284" height="112" rx="8" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="1.2"/>
            <line x1="60" y1="106" x2="160" y2="106" stroke="#0078D4" stroke-width="2" stroke-dasharray="4 3"/>
            <line x1="160" y1="106" x2="260" y2="106" stroke="#10B981" stroke-width="2"/>
            <circle cx="60" cy="106" r="16" fill="#EFF6FF" stroke="#0078D4" stroke-width="1.5"/>
            <text x="60" y="110" fill="#0078D4" font-size="11" font-weight="800" text-anchor="middle">Usuario</text>
            <text x="60" y="138" fill="#64748B" font-size="9.5" font-weight="600" text-anchor="middle">Conexión directa</text>
            <circle cx="160" cy="106" r="20" fill="#FEF3C7" stroke="#F59E0B" stroke-width="1.8"/>
            <text x="160" y="109" fill="#D97706" font-size="10" font-weight="800" text-anchor="middle">EDGE</text>
            <text x="160" y="120" fill="#B45309" font-size="8" font-weight="700" text-anchor="middle">CDN</text>
            <text x="160" y="144" fill="#D97706" font-size="9.5" font-weight="700" text-anchor="middle">300+ nodos</text>
            <circle cx="260" cy="106" r="16" fill="#ECFDF5" stroke="#10B981" stroke-width="1.5"/>
            <text x="260" y="110" fill="#059669" font-size="11" font-weight="800" text-anchor="middle">Global</text>
            <text x="260" y="138" fill="#64748B" font-size="9.5" font-weight="600" text-anchor="middle">Entrega rápida</text>
          </svg>
        </div>
      </div>

      <!-- Section 4 (Zigzag: Illustration Left, Text Right) -->
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 32px; background: linear-gradient(135deg, #f5f3ff 0%, #ffffff 100%); border: 1px solid #ddd6fe; border-radius: 16px; padding: 24px 28px; box-shadow: 0 4px 16px rgba(124, 58, 237, 0.05); flex-wrap: wrap;">
        <div style="width: 300px; flex-shrink: 0; display: flex; align-items: center; justify-content: center;">
          <svg width="100%" height="150" viewBox="0 0 320 180" fill="none" xmlns="http://www.w3.org/2000/svg" style="max-width: 300px; display: block; margin: 0 auto;">
            <rect width="320" height="180" rx="12" fill="#F8FAFC" stroke="#E2E8F0" stroke-width="1.5"/>
            <rect x="0" y="0" width="320" height="36" rx="12" fill="#FFFFFF"/>
            <rect x="0" y="24" width="320" height="12" fill="#FFFFFF"/>
            <line x1="0" y1="36" x2="320" y2="36" stroke="#E2E8F0" stroke-width="1"/>
            <circle cx="16" cy="18" r="4" fill="#7C3AED"/>
            <text x="28" y="22" fill="#0F172A" font-size="11" font-weight="700">Flujo de acciones inteligente</text>
            <rect x="226" y="8" width="78" height="20" rx="10" fill="#EDE9FE" stroke="#DDD6FE" stroke-width="1"/>
            <text x="265" y="22" fill="#6D28D9" font-size="10" font-weight="700" text-anchor="middle">⏰ Pospuesto</text>
            <rect x="18" y="48" width="284" height="34" rx="6" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="1.2"/>
            <circle cx="34" cy="65" r="5" fill="#7C3AED"/>
            <text x="48" y="69" fill="#0F172A" font-size="11" font-weight="700">Informe semanal y revisión</text>
            <rect x="220" y="55" width="72" height="20" rx="4" fill="#F5F3FF"/>
            <text x="256" y="69" fill="#7C3AED" font-size="9.5" font-weight="700" text-anchor="middle">⏰ Mañana 09:00</text>
            <rect x="18" y="88" width="284" height="34" rx="6" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="1.2"/>
            <circle cx="34" cy="105" r="5" fill="#F59E0B"/>
            <text x="48" y="109" fill="#0F172A" font-size="11" font-weight="700">Alerta de seguridad GitHub</text>
            <rect x="220" y="95" width="72" height="20" rx="4" fill="#FEF3C7"/>
            <text x="256" y="109" fill="#D97706" font-size="9.5" font-weight="700" text-anchor="middle">⭐ 重要星标</text>
            <rect x="18" y="128" width="284" height="36" rx="6" fill="#F1F5F9" stroke="#CBD5E1" stroke-width="1"/>
            <text x="32" y="151" fill="#64748B" font-size="11" font-family="monospace">🔍 毫秒级全文即时检索...</text>
            <rect x="238" y="134" width="54" height="24" rx="4" fill="#0078D4"/>
            <text x="265" y="150" fill="#FFFFFF" font-size="10" font-weight="700" text-anchor="middle">回车检索</text>
          </svg>
        </div>
        <div style="flex: 1; min-width: 280px;">
          <div style="display: inline-flex; align-items: center; gap: 6px; background: rgba(124, 58, 237, 0.1); border: 1px solid rgba(124, 58, 237, 0.25); padding: 4px 12px; border-radius: 9999px; color: #7c3aed; font-size: 12.5px; font-weight: 700; margin-bottom: 10px;">
            📥 进阶工作流 · 极简轻快
          </div>
          <h3 style="font-size: 17.5px; font-weight: 800; color: #0f172a; margin: 0 0 8px;">稍后处理 (Snooze)、星标代办与全文即时检索</h3>
          <p style="font-size: 13.5px; color: #475569; line-height: 1.7; margin: 0 0 14px;">
            内置现代高效的工作流体验。重要的信件可以一键设为稍后提醒（Snooze），配合星标代办归档、自定义分类标签与全文即时检索，即使面对成百上千封邮件也能游刃有余、井井有条。
          </p>
          <div>
            <span style="background: #ede9fe; color: #5b21b6; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600; margin-right: 8px;">⏰ 稍后处理代办</span>
            <span style="background: #ede9fe; color: #5b21b6; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600;">⭐ 星标快捷归档</span>
          </div>
        </div>
      </div>

      <!-- Section 5 (Zigzag: Text Left, Illustration Right) -->
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 32px; background: linear-gradient(135deg, #fff1f2 0%, #ffffff 100%); border: 1px solid #fecdd3; border-radius: 16px; padding: 24px 28px; box-shadow: 0 4px 16px rgba(225, 29, 72, 0.05); flex-wrap: wrap;">
        <div style="flex: 1; min-width: 280px;">
          <div style="display: inline-flex; align-items: center; gap: 6px; background: rgba(225, 29, 72, 0.1); border: 1px solid rgba(225, 29, 72, 0.25); padding: 4px 12px; border-radius: 9999px; color: #e11d48; font-size: 12.5px; font-weight: 700; margin-bottom: 10px;">
            🔀 别名隔离 · 垃圾邮件一键熔断
          </div>
          <h3 style="font-size: 17.5px; font-weight: 800; color: #0f172a; margin: 0 0 8px;">各平台独立别名分发，外部泄露一键切断</h3>
          <p style="font-size: 13.5px; color: #475569; line-height: 1.7; margin: 0 0 14px;">
            支持为 GitHub、Steam 或各类网站独立分配专属别名。一旦某个外部平台遭遇数据泄露或被垃圾营销骚扰，只需一键禁用该别名即可物理熔断，你的真实Principal邮箱永远安全隐身。
          </p>
          <div>
            <span style="background: #ffe4e6; color: #9f1239; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600; margin-right: 8px;">🛑 一键物理熔断</span>
            <span style="background: #ffe4e6; color: #9f1239; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600;">🛡️ 真实Principal号隐身</span>
          </div>
        </div>
        <div style="width: 300px; flex-shrink: 0; display: flex; align-items: center; justify-content: center;">
          <svg width="100%" height="150" viewBox="0 0 320 180" fill="none" xmlns="http://www.w3.org/2000/svg" style="max-width: 300px; display: block; margin: 0 auto;">
            <rect width="320" height="180" rx="12" fill="#F8FAFC" stroke="#E2E8F0" stroke-width="1.5"/>
            <rect x="0" y="0" width="320" height="36" rx="12" fill="#FFFFFF"/>
            <rect x="0" y="24" width="320" height="12" fill="#FFFFFF"/>
            <line x1="0" y1="36" x2="320" y2="36" stroke="#E2E8F0" stroke-width="1"/>
            <circle cx="16" cy="18" r="4" fill="#E11D48"/>
            <text x="28" y="22" fill="#0F172A" font-size="11" font-weight="700">Enrutamiento y fusible de alias</text>
            <rect x="236" y="8" width="68" height="20" rx="10" fill="#FFE4E6" stroke="#FECDD3" stroke-width="1"/>
            <text x="270" y="22" fill="#E11D48" font-size="10" font-weight="700" text-anchor="middle">🛡️ Proteger correo principal</text>
            <rect x="18" y="52" width="76" height="110" rx="8" fill="#0078D4" filter="drop-shadow(0 4px 10px rgba(0,120,212,0.25))"/>
            <circle cx="56" cy="85" r="14" fill="#FFFFFF" fill-opacity="0.2"/>
            <text x="56" y="90" fill="#FFFFFF" font-size="14" font-weight="800" text-anchor="middle">Principal</text>
            <text x="56" y="118" fill="#FFFFFF" font-size="11" font-weight="700" text-anchor="middle">Principal邮箱</text>
            <text x="56" y="134" fill="#BFDBFE" font-size="9" font-weight="600" text-anchor="middle">🔒 Seguro y oculto</text>
            <path d="M94 72H130C140 72 140 64 150 64H170" stroke="#10B981" stroke-width="1.8"/>
            <path d="M94 107H170" stroke="#10B981" stroke-width="1.8"/>
            <path d="M94 142H130C140 142 140 150 150 150H170" stroke="#E11D48" stroke-width="1.8" stroke-dasharray="3 3"/>
            <rect x="170" y="48" width="132" height="32" rx="6" fill="#FFFFFF" stroke="#A7F3D0" stroke-width="1.2"/>
            <text x="180" y="68" fill="#0F172A" font-size="10" font-weight="600">github@alias</text>
            <rect x="254" y="54" width="42" height="20" rx="4" fill="#ECFDF5"/>
            <text x="275" y="68" fill="#059669" font-size="9" font-weight="700" text-anchor="middle">● Activo</text>
            <rect x="170" y="91" width="132" height="32" rx="6" fill="#FFFFFF" stroke="#A7F3D0" stroke-width="1.2"/>
            <text x="180" y="111" fill="#0F172A" font-size="10" font-weight="600">steam@alias</text>
            <rect x="254" y="97" width="42" height="20" rx="4" fill="#ECFDF5"/>
            <text x="275" y="111" fill="#059669" font-size="9" font-weight="700" text-anchor="middle">● Activo</text>
            <rect x="170" y="134" width="132" height="32" rx="6" fill="#FFF1F2" stroke="#FECDD3" stroke-width="1.2"/>
            <text x="180" y="154" fill="#9F1239" font-size="10" font-weight="600">spam@alias</text>
            <rect x="254" y="140" width="42" height="20" rx="4" fill="#FFE4E6"/>
            <text x="275" y="154" fill="#E11D48" font-size="9" font-weight="700" text-anchor="middle">✕ Desconectado</text>
          </svg>
        </div>
      </div>

    </div>

    <!-- Full-Width Interactive Call-To-Action (CTA) Buttons -->
    <div style="text-align: center; margin: 32px 0 24px;">
      <a href="/inbox" style="display: inline-block; background: linear-gradient(135deg, #0078D4 0%, #2563eb 100%); color: #ffffff; text-decoration: none; font-weight: 700; font-size: 15px; padding: 13px 32px; border-radius: 9999px; box-shadow: 0 4px 16px rgba(37, 99, 235, 0.35); margin: 0 10px 10px;">
        🚀 Abrir mi bandeja de entrada
      </a>
      <a href="/settings/profile" style="display: inline-block; background: #ffffff; color: #0078D4; text-decoration: none; font-weight: 600; font-size: 14.5px; padding: 12px 28px; border-radius: 9999px; border: 1.5px solid #bfdbfe; margin: 0 10px 10px;">
        👤 Configurar mi perfil
      </a>
    </div>

    <!-- Guía rápida de inicio en 3 pasos -->
    <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 16px; padding: 22px 26px; margin: 24px 0;">
      <div style="font-weight: 700; font-size: 15px; color: #1e293b; margin-bottom: 12px; display: flex; align-items: center; gap: 8px;">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" fill="#0078D4"/>
        </svg>
        <span>Guía rápida de inicio en 3 pasos</span>
      </div>
      <div style="font-size: 13.5px; color: #475569; line-height: 1.9;">
        <div><strong>1. Prueba destacados y posponer: </strong> Este correo de bienvenida está archivado automáticamente en [Pospuestos] y [Destacados]. Haz clic para explorar.</div>
        <div><strong>2. Configura tu perfil y tema: </strong> 前往「个人设置」上传属于你的专属头像、昵称，并切换喜欢的个性化Principal题。</div>
        <div><strong>3. Redacta tu primer correo: </strong> 点击左上角「写邮件」，即刻体验流畅轻快的撰写与Global极速投递。</div>
      </div>
    </div>

    <div style="margin-top: 24px; padding-top: 16px; border-top: 1px dashed #cbd5e1; font-size: 12.5px; color: #94a3b8; line-height: 1.65;">
      <div>📌 <strong>贴心提示：</strong> Este es un correo oficial del sistema. Se ha establecido un período de retención automática; caducará de forma segura sin requerir eliminación manual.</div>
      <div style="margin-top: 10px; font-weight: 600; color: #64748b;">El equipo de Epocanvas Mail · Impulsando tus días productivos</div>
    </div>
  </div>
</div>`
  },
  nl: {
    lang: 'nl',
    name: 'Nederlands',
    subject: "🎉 Welkom bij Epocanvas Mail · Uw exclusieve eigen domein mailbox",
    content: `<div style="width: 100%; max-width: 100%; box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', Roboto, Helvetica, Arial, sans-serif; color: #1e293b; line-height: 1.6; background: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 10px 35px -6px rgba(0, 0, 0, 0.08);">
  <!-- Top Full-Width Banner with Microsoft Azure Gradient & Official EpoMail Brand Logo -->
  <div style="background: linear-gradient(135deg, #0078D4 0%, #0284c7 35%, #2563eb 70%, #4338ca 100%); padding: 40px 42px 34px; text-align: left; position: relative;">
    <div style="display: flex; align-items: center; justify-content: space-between; gap: 24px; flex-wrap: wrap;">
      <div style="flex: 1; min-width: 300px;">
        <div style="display: inline-flex; align-items: center; gap: 8px; background: rgba(255, 255, 255, 0.22); border: 1px solid rgba(255, 255, 255, 0.35); padding: 5px 14px; border-radius: 20px; color: #ffffff; font-size: 13px; font-weight: 600; margin-bottom: 14px; backdrop-filter: blur(8px);">
          <span>✨ Uw eigen domein mailbox is gereed</span>
        </div>
        <h1 style="margin: 0; color: #ffffff; font-size: 26px; font-weight: 800; letter-spacing: -0.02em; line-height: 1.35;">Hallo {{user_name}}, leuk u te ontmoeten!</h1>
        <p style="margin: 10px 0 0; color: rgba(255, 255, 255, 0.95); font-size: 14.5px; line-height: 1.55;">Nul configuratie · Reclamevrij · Razendsnel · Exclusieve geek-identiteit</p>
      </div>
      <!-- Official EpoMail Cloud Logo SVG Artwork -->
      <div style="flex-shrink: 0; display: flex; align-items: center; justify-content: center; width: 92px; height: 92px; background: rgba(255, 255, 255, 0.18); border-radius: 22px; border: 1.5px solid rgba(255, 255, 255, 0.38); box-shadow: 0 10px 28px rgba(0, 0, 0, 0.18); backdrop-filter: blur(10px);">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="76" height="76" style="display:block; flex-shrink:0;">
          <defs>
            <linearGradient id="epomailLogoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#00F5D4" />
              <stop offset="40%" stop-color="#0072FF" />
              <stop offset="100%" stop-color="#5B24FF" />
            </linearGradient>
            <mask id="epomailCutout">
              <rect width="100%" height="100%" fill="white" />
              <path d="M 15 210 L 200 270 L 385 210" fill="none" stroke="black" stroke-width="12" stroke-linecap="round" stroke-linejoin="round" />
              <line x1="60" y1="320" x2="140" y2="280" stroke="black" stroke-width="10" stroke-linecap="round" />
              <line x1="340" y1="320" x2="260" y2="280" stroke="black" stroke-width="10" stroke-linecap="round" />
              <circle cx="200" cy="270" r="26" fill="white" />
              <circle cx="200" cy="270" r="26" fill="none" stroke="black" stroke-width="10" />
              <circle cx="200" cy="270" r="4.5" fill="black" />
              <line x1="200" y1="270" x2="188" y2="258" stroke="black" stroke-width="7" stroke-linecap="round" />
              <line x1="200" y1="270" x2="215" y2="258" stroke="black" stroke-width="7" stroke-linecap="round" />
            </mask>
          </defs>
          <path d="M 60 110 Q 70 110 70 100 Q 70 110 80 110 Q 70 110 70 120 Q 70 110 60 110 Z" fill="#00F5D4" opacity="0.85" />
          <path d="M 330 90 Q 335 90 335 85 Q 335 90 340 90 Q 335 90 335 95 Q 335 90 330 90 Z" fill="#FF369B" opacity="0.9" />
          <circle cx="85" cy="180" r="2.5" fill="#5B24FF" opacity="0.6" />
          <circle cx="320" cy="180" r="3" fill="#0072FF" opacity="0.7" />
          <path d="M 40 220 A 60 60 0 0 1 120 155 A 85 85 0 0 1 280 155 A 60 60 0 0 1 360 220 L 360 260 C 360 325 290 335 200 335 C 110 335 40 325 40 260 Z" fill="url(#epomailLogoGrad)" mask="url(#epomailCutout)" />
        </svg>
      </div>
    </div>
  </div>

  <div style="padding: 36px 42px 34px;">
    <p style="font-size: 16px; color: #0f172a; margin-top: 0; font-weight: 700;">Hallo {{user_name}}, welkom bij Epocanvas Mail!</p>
    <p style="font-size: 14.5px; color: #475569; line-height: 1.8; margin: 0 0 28px;">
      We heten u van harte welkom. Dit is een exclusieve mailbox met eigen domein, gemaakt met passie en voor iedereen toegankelijk. Wij regelen alle technische complexiteit: domeinaankopen, DNS-records, MX/SPF-verificaties en cloudservers. Uw eigen mailbox ({{user_email}}) is gereed! Ontdek hieronder onze functies:
    </p>

    <!-- 5 Alternating Zigzag Storytelling Value Sections -->
    <div style="margin: 28px 0; display: flex; flex-direction: column; gap: 20px;">
      
      <!-- Section 1 (Zigzag: Text Left, Illustration Right) -->
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 32px; background: linear-gradient(135deg, #f0f7ff 0%, #ffffff 100%); border: 1px solid #bfdbfe; border-radius: 16px; padding: 24px 28px; box-shadow: 0 4px 16px rgba(0, 120, 212, 0.05); flex-wrap: wrap;">
        <div style="flex: 1; min-width: 280px;">
          <div style="display: inline-flex; align-items: center; gap: 6px; background: rgba(0, 120, 212, 0.1); border: 1px solid rgba(0, 120, 212, 0.25); padding: 4px 12px; border-radius: 9999px; color: #0078D4; font-size: 12.5px; font-weight: 700; margin-bottom: 10px;">
            🌐 Exclusieve geek-identiteit · Zonder domeinzorgen
          </div>
          <h3 style="font-size: 17.5px; font-weight: 800; color: #0f172a; margin: 0 0 8px;">Geen DNS- of MX-configuratie nodig — Direct een eigen identiteit</h3>
          <p style="font-size: 13.5px; color: #475569; line-height: 1.7; margin: 0 0 14px;">
            Say goodbye to complex domain purchasing and record configurations. With Epocanvas Mail, you immediately get a cool address like <code style="background: #e0f2fe; color: #0284c7; font-weight: 700; padding: 2px 8px; border-radius: 6px; font-size: 13px;">{{user_name}}@domain</code> for resumes, tech collaboration, or daily communications.
          </p>
          <div>
            <span style="background: #e2e8f0; color: #334155; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600; margin-right: 8px;">✨ Direct klaar voor gebruik</span>
            <span style="background: #e2e8f0; color: #334155; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600;">🏷️ Meerdere domeinen</span>
          </div>
        </div>
        <div style="width: 300px; flex-shrink: 0; display: flex; align-items: center; justify-content: center;">
          <svg width="100%" height="150" viewBox="0 0 320 180" fill="none" xmlns="http://www.w3.org/2000/svg" style="max-width: 300px; display: block; margin: 0 auto;">
            <rect width="320" height="180" rx="12" fill="#F8FAFC" stroke="#E2E8F0" stroke-width="1.5"/>
            <rect x="0" y="0" width="320" height="36" rx="12" fill="#FFFFFF"/>
            <rect x="0" y="24" width="320" height="12" fill="#FFFFFF"/>
            <line x1="0" y1="36" x2="320" y2="36" stroke="#E2E8F0" stroke-width="1"/>
            <circle cx="16" cy="18" r="4" fill="#EF4444"/>
            <circle cx="28" cy="18" r="4" fill="#F59E0B"/>
            <circle cx="40" cy="18" r="4" fill="#10B981"/>
            <rect x="56" y="8" width="248" height="20" rx="6" fill="#F1F5F9"/>
            <circle cx="68" cy="18" r="3" fill="#10B981"/>
            <text x="78" y="22" fill="#0284C7" font-size="10" font-weight="600" font-family="monospace">https://epomail.bond/@me</text>
            <rect x="20" y="52" width="280" height="110" rx="10" fill="#FFFFFF" stroke="#CBD5E1" stroke-width="1.2" filter="drop-shadow(0 4px 12px rgba(0,0,0,0.04))"/>
            <circle cx="50" cy="86" r="18" fill="#0078D4"/>
            <text x="50" y="92" fill="#FFFFFF" font-size="13" font-weight="800" text-anchor="middle">@</text>
            <text x="80" y="80" fill="#0F172A" font-size="13" font-weight="700">Geek-visitekaartje</text>
            <text x="80" y="96" fill="#64748B" font-size="11" font-weight="500" font-family="monospace">user@epomail.bond</text>
            <rect x="220" y="70" width="64" height="20" rx="10" fill="#ECFDF5" stroke="#A7F3D0" stroke-width="1"/>
            <text x="252" y="84" fill="#059669" font-size="10" font-weight="700" text-anchor="middle">● DNS actief</text>
            <line x1="32" y1="120" x2="288" y2="120" stroke="#F1F5F9" stroke-width="1"/>
            <rect x="32" y="130" width="76" height="18" rx="4" fill="#EFF6FF"/>
            <text x="70" y="143" fill="#0078D4" font-size="9.5" font-weight="600" text-anchor="middle">SPF geverifieerd</text>
            <rect x="116" y="130" width="80" height="18" rx="4" fill="#EFF6FF"/>
            <text x="156" y="143" fill="#0078D4" font-size="9.5" font-weight="600" text-anchor="middle">DKIM ondertekend</text>
            <rect x="204" y="130" width="76" height="18" rx="4" fill="#EFF6FF"/>
            <text x="242" y="143" fill="#0078D4" font-size="9.5" font-weight="600" text-anchor="middle">DMARC 100%</text>
          </svg>
        </div>
      </div>

      <!-- Section 2 (Zigzag: Illustration Left, Text Right) -->
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 32px; background: linear-gradient(135deg, #ecfdf5 0%, #ffffff 100%); border: 1px solid #a7f3d0; border-radius: 16px; padding: 24px 28px; box-shadow: 0 4px 16px rgba(16, 185, 129, 0.05); flex-wrap: wrap;">
        <div style="width: 300px; flex-shrink: 0; display: flex; align-items: center; justify-content: center;">
          <svg width="100%" height="150" viewBox="0 0 320 180" fill="none" xmlns="http://www.w3.org/2000/svg" style="max-width: 300px; display: block; margin: 0 auto;">
            <rect width="320" height="180" rx="12" fill="#F8FAFC" stroke="#E2E8F0" stroke-width="1.5"/>
            <rect x="0" y="0" width="320" height="36" rx="12" fill="#FFFFFF"/>
            <rect x="0" y="24" width="320" height="12" fill="#FFFFFF"/>
            <line x1="0" y1="36" x2="320" y2="36" stroke="#E2E8F0" stroke-width="1"/>
            <circle cx="16" cy="18" r="4" fill="#10B981"/>
            <text x="28" y="22" fill="#0F172A" font-size="11" font-weight="700">Privacy- en beveiligingsconsole</text>
            <rect x="236" y="8" width="68" height="20" rx="10" fill="#ECFDF5" stroke="#A7F3D0" stroke-width="1"/>
            <text x="270" y="22" fill="#059669" font-size="10" font-weight="700" text-anchor="middle">100% privé</text>
            <rect x="18" y="50" width="136" height="52" rx="8" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="1.2"/>
            <text x="30" y="70" fill="#64748B" font-size="10" font-weight="600">Advertentiescan</text>
            <text x="30" y="90" fill="#059669" font-size="14" font-weight="800">0 tracking / 0 advertenties</text>
            <rect x="166" y="50" width="136" height="52" rx="8" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="1.2"/>
            <text x="178" y="70" fill="#64748B" font-size="10" font-weight="600">Encryptiestandaard</text>
            <text x="178" y="90" fill="#0078D4" font-size="14" font-weight="800">TLS 1.3 / AES</text>
            <rect x="18" y="112" width="284" height="50" rx="8" fill="#ECFDF5" stroke="#A7F3D0" stroke-width="1.2"/>
            <circle cx="38" cy="137" r="10" fill="#059669"/>
            <path d="M34 137L37 140L42 134" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <text x="56" y="134" fill="#065F46" font-size="11.5" font-weight="700">Geen verkoop van gebruikersgegevens aan derden</text>
            <text x="56" y="149" fill="#047857" font-size="10" font-weight="500">Geen reclame · Geen pop-ups · Focus op communicatie</text>
          </svg>
        </div>
        <div style="flex: 1; min-width: 280px;">
          <div style="display: inline-flex; align-items: center; gap: 6px; background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.25); padding: 4px 12px; border-radius: 9999px; color: #059669; font-size: 12.5px; font-weight: 700; margin-bottom: 10px;">
            🛡️ Puur & privé · 100% reclamevrij
          </div>
          <h3 style="font-size: 17.5px; font-weight: 800; color: #0f172a; margin: 0 0 8px;">Geen advertenties, geen pop-ups, volledige privacy</h3>
          <p style="font-size: 13.5px; color: #475569; line-height: 1.7; margin: 0 0 14px;">
            We stay true to the pure essence of email communication. No annoying splash ads, banners, or spam popups. Our system never performs commercial data mining or behavioral profiling, giving you a clean, tranquil, and reliable workspace.
          </p>
          <div>
            <span style="background: #d1fae5; color: #065f46; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600; margin-right: 8px;">🚫 Nul pop-ups</span>
            <span style="background: #d1fae5; color: #065f46; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600;">🔒 Privacy voorop</span>
          </div>
        </div>
      </div>

      <!-- Section 3 (Zigzag: Text Left, Illustration Right) -->
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 32px; background: linear-gradient(135deg, #fffbeb 0%, #ffffff 100%); border: 1px solid #fde68a; border-radius: 16px; padding: 24px 28px; box-shadow: 0 4px 16px rgba(245, 158, 11, 0.05); flex-wrap: wrap;">
        <div style="flex: 1; min-width: 280px;">
          <div style="display: inline-flex; align-items: center; gap: 6px; background: rgba(245, 158, 11, 0.1); border: 1px solid rgba(245, 158, 11, 0.25); padding: 4px 12px; border-radius: 9999px; color: #d97706; font-size: 12.5px; font-weight: 700; margin-bottom: 10px;">
            ⚡ Wereldwijd Edge-netwerk · Razendsnel
          </div>
          <h3 style="font-size: 17.5px; font-weight: 800; color: #0f172a; margin: 0 0 8px;">Directe verbinding met wereldwijd Edge CDN, millisecondenrespons</h3>
          <p style="font-size: 13.5px; color: #475569; line-height: 1.7; margin: 0 0 14px;">
            Powered by 300+ edge nodes worldwide with high-speed CDN acceleration. Wherever you are, enjoy millisecond loading and instant global delivery without requiring proxies.
          </p>
          <div>
            <span style="background: #fef3c7; color: #92400e; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600; margin-right: 8px;">🚀 Direct laden</span>
            <span style="background: #fef3c7; color: #92400e; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600;">🌍 Wereldwijd Edge CDN</span>
          </div>
        </div>
        <div style="width: 300px; flex-shrink: 0; display: flex; align-items: center; justify-content: center;">
          <svg width="100%" height="150" viewBox="0 0 320 180" fill="none" xmlns="http://www.w3.org/2000/svg" style="max-width: 300px; display: block; margin: 0 auto;">
            <rect width="320" height="180" rx="12" fill="#F8FAFC" stroke="#E2E8F0" stroke-width="1.5"/>
            <rect x="0" y="0" width="320" height="36" rx="12" fill="#FFFFFF"/>
            <rect x="0" y="24" width="320" height="12" fill="#FFFFFF"/>
            <line x1="0" y1="36" x2="320" y2="36" stroke="#E2E8F0" stroke-width="1"/>
            <circle cx="16" cy="18" r="4" fill="#F59E0B"/>
            <text x="28" y="22" fill="#0F172A" font-size="11" font-weight="700">Directe Edge CDN-verbinding</text>
            <rect x="236" y="8" width="68" height="20" rx="10" fill="#FEF3C7" stroke="#FDE68A" stroke-width="1"/>
            <text x="270" y="22" fill="#D97706" font-size="10" font-weight="700" text-anchor="middle">⚡ &lt; 20ms</text>
            <rect x="18" y="50" width="284" height="112" rx="8" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="1.2"/>
            <line x1="60" y1="106" x2="160" y2="106" stroke="#0078D4" stroke-width="2" stroke-dasharray="4 3"/>
            <line x1="160" y1="106" x2="260" y2="106" stroke="#10B981" stroke-width="2"/>
            <circle cx="60" cy="106" r="16" fill="#EFF6FF" stroke="#0078D4" stroke-width="1.5"/>
            <text x="60" y="110" fill="#0078D4" font-size="11" font-weight="800" text-anchor="middle">Gebruiker</text>
            <text x="60" y="138" fill="#64748B" font-size="9.5" font-weight="600" text-anchor="middle">Directe verbinding</text>
            <circle cx="160" cy="106" r="20" fill="#FEF3C7" stroke="#F59E0B" stroke-width="1.8"/>
            <text x="160" y="109" fill="#D97706" font-size="10" font-weight="800" text-anchor="middle">EDGE</text>
            <text x="160" y="120" fill="#B45309" font-size="8" font-weight="700" text-anchor="middle">CDN</text>
            <text x="160" y="144" fill="#D97706" font-size="9.5" font-weight="700" text-anchor="middle">300+ knooppunten</text>
            <circle cx="260" cy="106" r="16" fill="#ECFDF5" stroke="#10B981" stroke-width="1.5"/>
            <text x="260" y="110" fill="#059669" font-size="11" font-weight="800" text-anchor="middle">Wereldwijd</text>
            <text x="260" y="138" fill="#64748B" font-size="9.5" font-weight="600" text-anchor="middle">Snelle bezorging</text>
          </svg>
        </div>
      </div>

      <!-- Section 4 (Zigzag: Illustration Left, Text Right) -->
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 32px; background: linear-gradient(135deg, #f5f3ff 0%, #ffffff 100%); border: 1px solid #ddd6fe; border-radius: 16px; padding: 24px 28px; box-shadow: 0 4px 16px rgba(124, 58, 237, 0.05); flex-wrap: wrap;">
        <div style="width: 300px; flex-shrink: 0; display: flex; align-items: center; justify-content: center;">
          <svg width="100%" height="150" viewBox="0 0 320 180" fill="none" xmlns="http://www.w3.org/2000/svg" style="max-width: 300px; display: block; margin: 0 auto;">
            <rect width="320" height="180" rx="12" fill="#F8FAFC" stroke="#E2E8F0" stroke-width="1.5"/>
            <rect x="0" y="0" width="320" height="36" rx="12" fill="#FFFFFF"/>
            <rect x="0" y="24" width="320" height="12" fill="#FFFFFF"/>
            <line x1="0" y1="36" x2="320" y2="36" stroke="#E2E8F0" stroke-width="1"/>
            <circle cx="16" cy="18" r="4" fill="#7C3AED"/>
            <text x="28" y="22" fill="#0F172A" font-size="11" font-weight="700">Slimme inbox-actiestroom</text>
            <rect x="226" y="8" width="78" height="20" rx="10" fill="#EDE9FE" stroke="#DDD6FE" stroke-width="1"/>
            <text x="265" y="22" fill="#6D28D9" font-size="10" font-weight="700" text-anchor="middle">⏰ Uitgesteld</text>
            <rect x="18" y="48" width="284" height="34" rx="6" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="1.2"/>
            <circle cx="34" cy="65" r="5" fill="#7C3AED"/>
            <text x="48" y="69" fill="#0F172A" font-size="11" font-weight="700">Wekelijks rapport en architectuurbeoordeling</text>
            <rect x="220" y="55" width="72" height="20" rx="4" fill="#F5F3FF"/>
            <text x="256" y="69" fill="#7C3AED" font-size="9.5" font-weight="700" text-anchor="middle">⏰ Morgen 09:00</text>
            <rect x="18" y="88" width="284" height="34" rx="6" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="1.2"/>
            <circle cx="34" cy="105" r="5" fill="#F59E0B"/>
            <text x="48" y="109" fill="#0F172A" font-size="11" font-weight="700">GitHub-beveiligingsmelding</text>
            <rect x="220" y="95" width="72" height="20" rx="4" fill="#FEF3C7"/>
            <text x="256" y="109" fill="#D97706" font-size="9.5" font-weight="700" text-anchor="middle">⭐ 重要星标</text>
            <rect x="18" y="128" width="284" height="36" rx="6" fill="#F1F5F9" stroke="#CBD5E1" stroke-width="1"/>
            <text x="32" y="151" fill="#64748B" font-size="11" font-family="monospace">🔍 毫秒级全文即时检索...</text>
            <rect x="238" y="134" width="54" height="24" rx="4" fill="#0078D4"/>
            <text x="265" y="150" fill="#FFFFFF" font-size="10" font-weight="700" text-anchor="middle">回车检索</text>
          </svg>
        </div>
        <div style="flex: 1; min-width: 280px;">
          <div style="display: inline-flex; align-items: center; gap: 6px; background: rgba(124, 58, 237, 0.1); border: 1px solid rgba(124, 58, 237, 0.25); padding: 4px 12px; border-radius: 9999px; color: #7c3aed; font-size: 12.5px; font-weight: 700; margin-bottom: 10px;">
            📥 进阶工作流 · 极简轻快
          </div>
          <h3 style="font-size: 17.5px; font-weight: 800; color: #0f172a; margin: 0 0 8px;">稍后处理 (Snooze)、星标代办与全文即时检索</h3>
          <p style="font-size: 13.5px; color: #475569; line-height: 1.7; margin: 0 0 14px;">
            内置现代高效的工作流体验。重要的信件可以一键设为稍后提醒（Snooze），配合星标代办归档、自定义分类标签与全文即时检索，即使面对成百上千封邮件也能游刃有余、井井有条。
          </p>
          <div>
            <span style="background: #ede9fe; color: #5b21b6; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600; margin-right: 8px;">⏰ 稍后处理代办</span>
            <span style="background: #ede9fe; color: #5b21b6; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600;">⭐ 星标快捷归档</span>
          </div>
        </div>
      </div>

      <!-- Section 5 (Zigzag: Text Left, Illustration Right) -->
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 32px; background: linear-gradient(135deg, #fff1f2 0%, #ffffff 100%); border: 1px solid #fecdd3; border-radius: 16px; padding: 24px 28px; box-shadow: 0 4px 16px rgba(225, 29, 72, 0.05); flex-wrap: wrap;">
        <div style="flex: 1; min-width: 280px;">
          <div style="display: inline-flex; align-items: center; gap: 6px; background: rgba(225, 29, 72, 0.1); border: 1px solid rgba(225, 29, 72, 0.25); padding: 4px 12px; border-radius: 9999px; color: #e11d48; font-size: 12.5px; font-weight: 700; margin-bottom: 10px;">
            🔀 别名隔离 · 垃圾邮件一键熔断
          </div>
          <h3 style="font-size: 17.5px; font-weight: 800; color: #0f172a; margin: 0 0 8px;">各平台独立别名分发，外部泄露一键切断</h3>
          <p style="font-size: 13.5px; color: #475569; line-height: 1.7; margin: 0 0 14px;">
            支持为 GitHub、Steam 或各类网站独立分配专属别名。一旦某个外部平台遭遇数据泄露或被垃圾营销骚扰，只需一键禁用该别名即可物理熔断，你的真实Hoofd邮箱永远安全隐身。
          </p>
          <div>
            <span style="background: #ffe4e6; color: #9f1239; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600; margin-right: 8px;">🛑 一键物理熔断</span>
            <span style="background: #ffe4e6; color: #9f1239; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600;">🛡️ 真实Hoofd号隐身</span>
          </div>
        </div>
        <div style="width: 300px; flex-shrink: 0; display: flex; align-items: center; justify-content: center;">
          <svg width="100%" height="150" viewBox="0 0 320 180" fill="none" xmlns="http://www.w3.org/2000/svg" style="max-width: 300px; display: block; margin: 0 auto;">
            <rect width="320" height="180" rx="12" fill="#F8FAFC" stroke="#E2E8F0" stroke-width="1.5"/>
            <rect x="0" y="0" width="320" height="36" rx="12" fill="#FFFFFF"/>
            <rect x="0" y="24" width="320" height="12" fill="#FFFFFF"/>
            <line x1="0" y1="36" x2="320" y2="36" stroke="#E2E8F0" stroke-width="1"/>
            <circle cx="16" cy="18" r="4" fill="#E11D48"/>
            <text x="28" y="22" fill="#0F172A" font-size="11" font-weight="700">Multi-alias routering en zekering</text>
            <rect x="236" y="8" width="68" height="20" rx="10" fill="#FFE4E6" stroke="#FECDD3" stroke-width="1"/>
            <text x="270" y="22" fill="#E11D48" font-size="10" font-weight="700" text-anchor="middle">🛡️ Bescherm hoofdaccount</text>
            <rect x="18" y="52" width="76" height="110" rx="8" fill="#0078D4" filter="drop-shadow(0 4px 10px rgba(0,120,212,0.25))"/>
            <circle cx="56" cy="85" r="14" fill="#FFFFFF" fill-opacity="0.2"/>
            <text x="56" y="90" fill="#FFFFFF" font-size="14" font-weight="800" text-anchor="middle">Hoofd</text>
            <text x="56" y="118" fill="#FFFFFF" font-size="11" font-weight="700" text-anchor="middle">Hoofd邮箱</text>
            <text x="56" y="134" fill="#BFDBFE" font-size="9" font-weight="600" text-anchor="middle">🔒 Veilig en verborgen</text>
            <path d="M94 72H130C140 72 140 64 150 64H170" stroke="#10B981" stroke-width="1.8"/>
            <path d="M94 107H170" stroke="#10B981" stroke-width="1.8"/>
            <path d="M94 142H130C140 142 140 150 150 150H170" stroke="#E11D48" stroke-width="1.8" stroke-dasharray="3 3"/>
            <rect x="170" y="48" width="132" height="32" rx="6" fill="#FFFFFF" stroke="#A7F3D0" stroke-width="1.2"/>
            <text x="180" y="68" fill="#0F172A" font-size="10" font-weight="600">github@alias</text>
            <rect x="254" y="54" width="42" height="20" rx="4" fill="#ECFDF5"/>
            <text x="275" y="68" fill="#059669" font-size="9" font-weight="700" text-anchor="middle">● Actief</text>
            <rect x="170" y="91" width="132" height="32" rx="6" fill="#FFFFFF" stroke="#A7F3D0" stroke-width="1.2"/>
            <text x="180" y="111" fill="#0F172A" font-size="10" font-weight="600">steam@alias</text>
            <rect x="254" y="97" width="42" height="20" rx="4" fill="#ECFDF5"/>
            <text x="275" y="111" fill="#059669" font-size="9" font-weight="700" text-anchor="middle">● Actief</text>
            <rect x="170" y="134" width="132" height="32" rx="6" fill="#FFF1F2" stroke="#FECDD3" stroke-width="1.2"/>
            <text x="180" y="154" fill="#9F1239" font-size="10" font-weight="600">spam@alias</text>
            <rect x="254" y="140" width="42" height="20" rx="4" fill="#FFE4E6"/>
            <text x="275" y="154" fill="#E11D48" font-size="9" font-weight="700" text-anchor="middle">✕ Uitgeschakeld</text>
          </svg>
        </div>
      </div>

    </div>

    <!-- Full-Width Interactive Call-To-Action (CTA) Buttons -->
    <div style="text-align: center; margin: 32px 0 24px;">
      <a href="/inbox" style="display: inline-block; background: linear-gradient(135deg, #0078D4 0%, #2563eb 100%); color: #ffffff; text-decoration: none; font-weight: 700; font-size: 15px; padding: 13px 32px; border-radius: 9999px; box-shadow: 0 4px 16px rgba(37, 99, 235, 0.35); margin: 0 10px 10px;">
        🚀 Open mijn inbox
      </a>
      <a href="/settings/profile" style="display: inline-block; background: #ffffff; color: #0078D4; text-decoration: none; font-weight: 600; font-size: 14.5px; padding: 12px 28px; border-radius: 9999px; border: 1.5px solid #bfdbfe; margin: 0 10px 10px;">
        👤 Profiel en instellingen configureren
      </a>
    </div>

    <!-- Snelstartgids in 3 stappen -->
    <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 16px; padding: 22px 26px; margin: 24px 0;">
      <div style="font-weight: 700; font-size: 15px; color: #1e293b; margin-bottom: 12px; display: flex; align-items: center; gap: 8px;">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" fill="#0078D4"/>
        </svg>
        <span>Snelstartgids in 3 stappen</span>
      </div>
      <div style="font-size: 13.5px; color: #475569; line-height: 1.9;">
        <div><strong>1. Ervaar sterren en uitstellen: </strong> Deze welkomstmail is automatisch in uw mappen [Uitgesteld] en [Met ster] geplaatst. Klik om te ontdekken.</div>
        <div><strong>2. Stel profiel en thema in: </strong> 前往「个人设置」上传属于你的专属头像、昵称，并切换喜欢的个性化Hoofd题。</div>
        <div><strong>3. Stel uw eerste e-mail op: </strong> 点击左上角「写邮件」，即刻体验流畅轻快的撰写与Wereldwijd极速投递。</div>
      </div>
    </div>

    <div style="margin-top: 24px; padding-top: 16px; border-top: 1px dashed #cbd5e1; font-size: 12.5px; color: #94a3b8; line-height: 1.65;">
      <div>📌 <strong>贴心提示：</strong> Dit is een officiële welkomstmail van het systeem. Er is een automatische bewaartermijn ingesteld; het bericht verloopt veilig automatisch.</div>
      <div style="margin-top: 10px; font-weight: 600; color: #64748b;">Het Epocanvas Mail-team · Voor uw productieve dagen</div>
    </div>
  </div>
</div>`
  }
};

export const DEFAULT_WELCOME_SUBJECT = WELCOME_TEMPLATES.zh.subject;
export const DEFAULT_WELCOME_CONTENT = WELCOME_TEMPLATES.zh.content;

export function getWelcomeTemplate(lang = 'zh') {
  const norm = (lang || '').toLowerCase();
  if (norm.startsWith('zh-hant') || norm.startsWith('zh-tw') || norm.startsWith('zh-hk')) {
    return WELCOME_TEMPLATES['zh-Hant'];
  }
  if (norm.startsWith('zh')) {
    return WELCOME_TEMPLATES['zh'];
  }
  if (norm.startsWith('fr')) {
    return WELCOME_TEMPLATES['fr'];
  }
  if (norm.startsWith('es')) {
    return WELCOME_TEMPLATES['es'];
  }
  if (norm.startsWith('nl')) {
    return WELCOME_TEMPLATES['nl'];
  }
  if (norm.startsWith('en')) {
    return WELCOME_TEMPLATES['en'];
  }
  return WELCOME_TEMPLATES['zh'];
}

