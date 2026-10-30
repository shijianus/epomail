import { execSync } from 'node:child_process';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');
const tempLoginUiDir = join(rootDir, 'temp_login_ui');
const mailVueDir = join(rootDir, 'mail-vue');

// Windows resolves executables through PATHEXT, so the shim must be named
// explicitly; POSIX keeps the plain binary.
const pnpmBin = process.env.EPOMAIL_PNPM || (process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm');

// Paths travel through `cwd`, never through the command line, so the only
// thing interpolated below is a fixed flag list. Rejecting whitespace keeps
// that guarantee true if someone adds an argument later.
function run(cwd, args) {
	for (const arg of args) {
		if (/\s/.test(arg)) throw new Error(`[build-prod] 不支持含空白的参数: ${arg}`);
	}
	const bin = pnpmBin.includes(' ') ? `"${pnpmBin}"` : pnpmBin;
	const command = [bin, ...args].join(' ');
	execSync(command, { cwd, stdio: 'inherit' });
}

// `--frozen-lockfile` is deliberate: a production build must consume the
// reviewed dependency graph. Without it a stray install here would silently
// rewrite the lockfile and ship unvetted versions.
const installArgs = ['install', '--frozen-lockfile'];

console.log(`[build-prod] 仓库根目录定位: ${rootDir}`);
console.log(`[build-prod] 包管理器: ${pnpmBin}`);

console.log('[build-prod] 1/2 构建 temp_login_ui...');
run(tempLoginUiDir, installArgs);
run(tempLoginUiDir, ['run', 'build']);

console.log('[build-prod] 2/2 构建 mail-vue...');
run(mailVueDir, installArgs);
run(mailVueDir, ['run', 'build']);

console.log('[build-prod] 生产构建全部完成。');
