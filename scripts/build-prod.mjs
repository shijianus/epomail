import { execSync } from 'node:child_process';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');
const tempLoginUiDir = join(rootDir, 'temp_login_ui');
const mailVueDir = join(rootDir, 'mail-vue');

console.log(`[build-prod] 仓库根目录定位: ${rootDir}`);
console.log(`[build-prod] 1/2 构建 temp_login_ui...`);
execSync(`pnpm --prefix "${tempLoginUiDir}" install && pnpm --prefix "${tempLoginUiDir}" run build`, { stdio: 'inherit' });

console.log(`[build-prod] 2/2 构建 mail-vue...`);
execSync(`pnpm --prefix "${mailVueDir}" install && pnpm --prefix "${mailVueDir}" run build`, { stdio: 'inherit' });
console.log(`[build-prod] 生产构建全部完成。`);
