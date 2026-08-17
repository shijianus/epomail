const fs = require('fs');
const content = fs.readFileSync('AGENTS.md', 'utf8');

const newLog = `### 深度修复：路由重定向至 Profile 引发 401 踢回登录的漏洞 (2026-08-16)
*   **问题排查 (Diagnosis)**: 用户反馈部署了修复后仍然会弹出 "token验证失败" 并被踢回登录页。经深度追踪代码逻辑，发现这是一个复合型致命 Bug：
    1. 前端路由歧义：在 \`AuthForm.tsx\` 登录成功后，前端执行 \`window.location.href = "/mail"\`。然而在 Vue Router (\`mail-vue\`) 的配置中，\`/mail\` 并不是根路由（根路由为 \`/\`），导致它被作为通配符 \`/:username\` 解析，错误地挂载了**独立账户详情页 (\`profile/index.vue\`)**，认为目标用户是 "mail"。
    2. API 安全越权拦截：当 \`profile/index.vue\` 挂载时，它会向后端发送 \`/api/public/profile/mail\` 的请求以获取公开信息。此时由于 axios 拦截器默认带上了刚登录获得的 JWT token（放在 Authorization 请求头里），而 \`mail-worker/src/security/security.js\` 在拦截以 \`/public\` 开头的请求时，强制要求其 Header 与管理端的 \`publicToken\` 严格比对。由于 JWT 不是 \`publicToken\`，后端立即抛出 401 (publicTokenFail / token验证失败)。
    3. 雪崩崩塌：前端 Axios 全局拦截器一收到 401 报错，立即执行 \`localStorage.removeItem('token')\` 并跳转回 \`/login\`，由此引发“刚连上就闪退”的灾难。
*   **编辑代码 (Edit)**:
    *   **前端路由修正**：在 \`temp_login_ui/src/app/components/epomail/AuthForm.tsx\` 中，将登入成功的跳转地址从 \`/mail\` 修正为真正的系统根目录 \`/\` (Vue Router 将其安全 Redirect 到 \`/inbox\`)。
    *   **后端鉴权松绑**：在 \`mail-worker/src/security/security.js\` 的 \`exclude\` 忽略名单中追加 \`/public/profile\` 路径，允许任何人（或带有 JWT 的访客）无需 \`publicToken\` 也能合法浏览其专属档案页，解决了以后通过浏览器看别人主页直接 401 踢回登录态的问题。
*   **部署上线 (Deploy)**:
    *   二次执行 \`npx wrangler deploy\` 完整自动化构建并发布，此次补丁已彻底铲除 401 循环闪退陷阱。

`;

const target = '<!-- VERSION LOG APPEND BELOW (newest first) -->\n\n';
if (content.includes(target)) {
  const updated = content.replace(target, target + newLog);
  fs.writeFileSync('AGENTS.md', updated);
  console.log('AGENTS.md updated');
} else {
  console.log('Target not found');
}
