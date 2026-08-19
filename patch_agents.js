const fs = require('fs');
const content = fs.readFileSync('AGENTS.md', 'utf-8');
const newLog = `
### 新增：个人主页点击“发送邮件联系我”自动回退并打开Compose (2026-08-18)
*   **问题排查 (Diagnosis)**: 用户反馈在个人档案画板中直接打开邮件编辑器不符合业务逻辑，期望的流转应当是：先退回主系统的收件箱 \`/inbox\`，然后在主系统页面下唤起 Compose 并自动填充好目标邮箱。
*   **编辑代码 (Edit)**: 
    *   **指令重构**: 修改 \`mail-vue/src/views/profile/index.vue\`。当点击按钮时，直接利用 Vue Router 进行跳转并附带路由参数：\`router.push({ path: '/inbox', query: { composeTo: targetEmail } })\`。
    *   **主框架接管**: 在主架构页面 \`mail-vue/src/layout/index.vue\` 的 \`onMounted\` 及 \`watch(route)\` 中新增了 \`checkComposeQuery\`。嗅探到目标指令后，会通过 \`setTimeout(400)\` 在页面转场完成后平滑调用系统级底座 \`writerRef.value.openWithRecipient()\`，同时无感擦除 URL 上的 \`composeTo\` 参数。
*   **部署上线 (Deploy)**: Vite 已编译成功并执行 \`npm run deploy\` 部署至 Cloudflare Workers，最新版已生效。
`;

const lines = content.split('\n');
const insertIndex = lines.findIndex(line => line.includes('<!-- VERSION LOG APPEND BELOW (newest first) -->'));
if (insertIndex !== -1) {
    lines.splice(insertIndex + 1, 0, newLog);
    fs.writeFileSync('AGENTS.md', lines.join('\n'));
    console.log('AGENTS.md updated successfully.');
} else {
    console.log('Could not find insert point.');
}
