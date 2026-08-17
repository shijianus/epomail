const fs = require('fs');
const content = fs.readFileSync('AGENTS.md', 'utf8');

const newLog = `### 修复 React 登录UI丢失Token导致无限踢回登录页的问题 (2026-08-16)
*   **问题排查 (Diagnosis)**: 用户反馈在全新的 React 登录界面 (\`temp_login_ui\`) 中，输入正确密码后闪一下就退出回登录页。经查，新的登录逻辑成功拿到 API 响应后未能将 \`token\` 存入 \`localStorage\`，导致路由跳转至 \`/mail\` 后被 Vue Router (\`mail-vue\`) 守护拦截，判定为未授权并强制踢回 \`/login\`。此外由于本地 Dev Server 的强缓存机制，造成了热更新的假象。
*   **编辑代码 (Edit)**:
    *   在 \`temp_login_ui/src/app/components/epomail/AuthForm.tsx\` 中增加了 \`localStorage.setItem('token', data.data.token)\`，确保在跳转至 \`/mail\` 之前将凭证稳定注入浏览器缓存中。
*   **验证与截图 (Verify & Screenshot)**:
    *   使用独立的 Playwright 测试脚本 (\`test-login-real.mjs\`)，精准拦截并模拟了带有 CORS 跨域透传的后端响应。利用 \`page.evaluate\` 实时监控了浏览器 \`localStorage\` 状态的变更，强断言证明了在 UI 展示 Connected 后的毫秒级间隙 \`token\` 已牢固存入，验证了路由闭环的稳定性。
*   **部署上线 (Deploy)**:
    *   执行 \`npx wrangler deploy\` 完整自动化构建并发布到 Cloudflare 线上！

`;

const target = '<!-- VERSION LOG APPEND BELOW (newest first) -->\n\n';
if (content.includes(target)) {
  const updated = content.replace(target, target + newLog);
  fs.writeFileSync('AGENTS.md', updated);
  console.log('AGENTS.md updated');
} else {
  console.log('Target not found');
}
