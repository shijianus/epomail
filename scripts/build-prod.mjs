import { execSync } from 'node:child_process';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');
const tempLoginUiDir = join(rootDir, 'temp_login_ui');
const mailVueDir = join(rootDir, 'mail-vue');

function getPnpmCmd() {
  try {
    execSync('corepack --version', { stdio: 'ignore' });
    return 'corepack pnpm@10.34.5';
  } catch {
    return 'pnpm';
  }
}

const pnpmCmd = getPnpmCmd();
const execOpts = {
  stdio: 'inherit',
  env: { ...process.env, CI: 'true' }
};

console.log(`[build-prod] 仓库根目录定位: ${rootDir}`);
console.log(`[build-prod] 1/2 构建 temp_login_ui...`);
execSync(`${pnpmCmd} --prefix "${tempLoginUiDir}" install --frozen-lockfile && ${pnpmCmd} --prefix "${tempLoginUiDir}" run build`, execOpts);

console.log(`[build-prod] 2/2 构建 mail-vue...`);
execSync(`${pnpmCmd} --prefix "${mailVueDir}" install --frozen-lockfile && ${pnpmCmd} --prefix "${mailVueDir}" run build`, execOpts);
console.log(`[build-prod] 生产构建全部完成。`);
