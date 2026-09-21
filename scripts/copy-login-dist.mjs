/**
 * 将 temp_login_ui 的构建产物拷入 mail-worker/dist/login。
 * 取代 `rm -rf && cp -r` 的 shell 写法：跨平台（Windows cmd 无 rm/cp），
 * 且先清空目标目录，避免 cp 进入已存在目录造成 dist/login/dist 嵌套与旧资源残留。
 */
import { cpSync, rmSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'temp_login_ui', 'dist');
const dest = join(root, 'mail-worker', 'dist', 'login');

if (!existsSync(join(src, 'index.html'))) {
  console.error(`[copy-login-dist] 源产物缺失: ${src}（请先构建 temp_login_ui）`);
  process.exit(1);
}

rmSync(dest, { recursive: true, force: true });
cpSync(src, dest, { recursive: true });
console.log(`[copy-login-dist] ${src} -> ${dest}`);
