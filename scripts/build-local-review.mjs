import { spawn } from 'node:child_process';
import { mkdtemp, rm, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { localEnvironment } from '../tests/helpers/local-stack.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const childIndex = process.argv.indexOf('--build-project');

if (childIndex >= 0) {
  const project = process.argv[childIndex + 1];
  const output = process.argv[childIndex + 2];
  if (!['mail-vue', 'temp_login_ui'].includes(project) || !path.isAbsolute(output || '')) {
    throw new Error('Expected a known frontend project and an absolute output directory');
  }
  const projectDir = path.join(root, project);
  const require = createRequire(path.join(projectDir, 'package.json'));
  const { build, loadConfigFromFile } = await import(pathToFileURL(require.resolve('vite')).href);
  const configPath = path.join(projectDir, project === 'mail-vue' ? 'vite.config.js' : 'vite.config.ts');
  // Vue's config calls loadEnv with cwd. The parent gives this child an empty
  // directory, and Vite's own envDir is isolated independently below.
  const resolved = await loadConfigFromFile({ command: 'build', mode: 'release' }, configPath);
  if (!resolved) throw new Error(`Unable to load ${project} build configuration`);
  await build({
    ...resolved.config,
    configFile: false,
    root: projectDir,
    envDir: process.cwd(),
    mode: 'release',
    build: { ...resolved.config.build, outDir: output, emptyOutDir: true }
  });
} else {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'epomail-localization-build-'));
  const envDir = path.join(directory, 'empty-env');
  await mkdir(envDir);
  const assets = path.join(directory, 'assets');
  const env = {
    ...localEnvironment(envDir),
    VITE_BASE_URL: '/api',
    VITE_STATIC_URL: '/',
    VITE_PWA_NAME: 'EpoCanvas Mail',
    VITE_APP_TITLE: 'EpoCanvas Mail'
  };
  async function run(project, output) {
    const child = spawn(process.execPath, [fileURLToPath(import.meta.url), '--build-project', project, output], {
      cwd: envDir, env, stdio: 'inherit', shell: false, windowsHide: true
    });
    await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', (code, signal) => code === 0 ? resolve() : reject(new Error(`${project} build failed (${code ?? signal})`)));
    });
  }
  try {
    await run('mail-vue', assets);
    await run('temp_login_ui', path.join(assets, 'login'));
    console.log(`LOCALIZATION_ASSETS=${assets}`);
    console.log(`LOCALIZATION_BUILD_DIRECTORY=${directory}`);
  } catch (error) {
    await rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    throw error;
  }
}
