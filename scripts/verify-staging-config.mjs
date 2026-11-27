// Offline check of the actual deployment configuration and its production resource boundary.
import { createRequire } from 'node:module';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { domainToASCII, fileURLToPath } from 'node:url';
import { DEFAULT_CONFIG, hasBoundedSandboxOutbound, isProductionHost, PRODUCTION_SUFFIXES } from './lib/oauth-staging.mjs';

const requireWorker = createRequire(new URL('../mail-worker/package.json', import.meta.url));
const resourceTypes = [
	{ table: 'd1_databases', keys: ['database_id', 'preview_database_id'], required: ['USER_DB', 'MAIL_DB', 'db'],
		format: /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i },
	{ table: 'kv_namespaces', keys: ['id', 'preview_id'], required: ['kv'], format: /^[a-f0-9]{32}$/i },
	{ table: 'r2_buckets', keys: ['bucket_name', 'preview_bucket_name'], required: [], format: /^[a-z0-9][a-z0-9-]*[a-z0-9]$/ }
];
const isPlaceholder = value => typeof value === 'string' && /^PLACEHOLDER_[A-Z0-9_]+$/.test(value);
const normalizeHost = value => value.trim().toLowerCase().replace(/\.$/, '');

function mailHost(value) {
	if (typeof value !== 'string') return '';
	const rawHost = value.trim().replace(/^@/, '');
	const host = normalizeHost(rawHost);
	if (isPlaceholder(rawHost)) return host;
	if (!host || /[\s/@:#%?\\]/.test(host)) return '';
	const ascii = domainToASCII(host);
	const labels = ascii.split('.');
	return ascii.length <= 253 && labels.length >= 2 && labels.every(label =>
		/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)) ? ascii : '';
}

function mailHosts(raw) {
	let entries = raw;
	if (typeof entries === 'string') {
		try { entries = JSON.parse(raw); } catch { entries = raw.split(','); }
	}
	if (!Array.isArray(entries)) return [];
	const hosts = entries.map(mailHost);
	return hosts.every(Boolean) ? hosts : [];
}

function routeHosts(env) {
	const routes = [env.route, ...(Array.isArray(env.routes) ? env.routes : [])].filter(Boolean);
	return routes.map(route => {
		const pattern = typeof route === 'string' ? route : route.pattern;
		return typeof pattern === 'string' ? normalizeHost(pattern.replace(/^https?:\/\//i, '').split('/')[0]) : '';
	});
}

export function verifyStagingConfig(configPath, { allowSandboxOutbound = false } = {}) {
	// Use the parser that deploys this file. It resolves literal strings, inline tables and
	// multiline arrays, and rejects invalid TOML (including duplicate keys).
	const { experimental_readRawConfig } = requireWorker('wrangler');
	const { rawConfig: config } = experimental_readRawConfig({ config: path.resolve(configPath) });
	const staging = config.env?.staging;
	const production = config.env?.production || config;
	if (!staging) throw new Error('缺少 env.staging');
	const errors = new Set();
	const placeholder = /PLACEHOLDER_[A-Z0-9_]+/.test(JSON.stringify(staging));

	if (typeof production.name !== 'string' || !production.name.trim() || typeof staging.name !== 'string'
		|| !staging.name.trim() || staging.name === production.name) {
		errors.add('Staging Worker 名称缺失或与生产重复');
	}
	for (const { table, keys, required, format } of resourceTypes) {
		const productionIds = new Set();
		if (table === 'r2_buckets' && production[table]?.length && !staging[table]?.length) errors.add('Staging 缺少独立的 R2 存储桶');
		for (const [env, resources] of [['production', production[table]], ['staging', staging[table]]]) {
			const bindings = new Set();
			if (resources !== undefined && !Array.isArray(resources)) errors.add(`${env}.${table} 绑定格式无效`);
			for (const row of Array.isArray(resources) ? resources : []) {
				if (typeof row?.binding !== 'string' || !row.binding || bindings.has(row.binding)) errors.add(`${env}.${table} 绑定名缺失或重复`);
				bindings.add(row?.binding);
				for (const key of keys) {
					const id = row?.[key];
					if (id === undefined && key !== keys[0]) continue;
					if (env === 'staging' && isPlaceholder(id)) continue;
					if (typeof id !== 'string' || !format.test(id)) {
						errors.add(`${env}.${table}.${key} 缺失或格式无效`);
					} else if (env === 'production') {
						productionIds.add(id.toLowerCase());
					} else if (productionIds.has(id.toLowerCase())) {
						errors.add(`staging.${table} 指向生产资源`);
					}
				}
			}
			for (const binding of required) {
				if (!bindings.has(binding)) errors.add(`${env}.${table} 缺少 ${binding} 绑定`);
			}
		}
	}

	const vars = staging.vars ?? {};
	if (vars.ENVIRONMENT !== 'staging') errors.add('Staging ENVIRONMENT 必须显式为 staging');
	if (vars.ALLOW_URL_INIT !== 'false' && vars.ALLOW_URL_INIT !== false) errors.add('Staging 必须禁用 ALLOW_URL_INIT');
	if (vars.EMAIL_OUTBOUND_ENABLED !== 'false' && vars.EMAIL_OUTBOUND_ENABLED !== false && !(allowSandboxOutbound && hasBoundedSandboxOutbound(vars))) {
		errors.add('Staging 必须关闭外发，或显式选择启用严格收件人白名单的沙箱模式');
	}

	const prodDomains = mailHosts(production.vars?.domain);
	if (!prodDomains.length) errors.add('缺少用于隔离比对的生产邮件域名');
	const prodHost = host => isProductionHost(host) || prodDomains.some(domain => host === domain || host.endsWith(`.${domain}`));
	const stagingDomains = mailHosts(vars.domain);
	if (!stagingDomains.length || stagingDomains.some(prodHost)) {
		errors.add('Staging 邮件域名缺失或指向生产域名');
	}
	const adminDomain = typeof vars.admin === 'string' && /^[^@\s<>]+@([^@\s<>]+)$/.exec(vars.admin)?.[1];
	const adminHost = adminDomain && mailHost(adminDomain);
	if ((!adminHost && !isPlaceholder(vars.admin)) || (adminHost && prodHost(adminHost))) {
		errors.add('Staging 管理员邮箱缺失或指向生产域名');
	}

	// Wrangler inherits route and routes from the top-level deployment individually.
	const prodRoutes = routeHosts({ route: production.route ?? config.route, routes: production.routes ?? config.routes });
	const stagingRoutes = routeHosts({ route: staging.route ?? config.route, routes: staging.routes ?? config.routes });
	const prodHosts = [...PRODUCTION_SUFFIXES, ...prodDomains, ...prodRoutes];
	const matches = (pattern, host) => pattern.startsWith('*') ? host.endsWith(pattern.slice(1)) : pattern === host;
	if (stagingRoutes.some(route => !route || prodHost(route.replace(/^\*\.?/, ''))
		|| prodHosts.some(host => matches(route, host) || matches(host, route)))) {
		errors.add('Staging 路由引用或继承生产主机');
	}

	return { errors: [...errors], placeholder };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
	try {
		const { values } = parseArgs({ options: {
			config: { type: 'string', default: DEFAULT_CONFIG },
			'allow-placeholders': { type: 'boolean' },
			'sandbox-outbound': { type: 'boolean' }
		} });
		const result = verifyStagingConfig(values.config, { allowSandboxOutbound: values['sandbox-outbound'] });
		if (result.errors.length) {
			for (const error of result.errors) console.error(`[FAILED] ${error}`);
			process.exitCode = 1;
		} else if (result.placeholder) {
			console.log('[LOCKED] Staging 配置含占位符，部署前须分配独立资源。');
			process.exitCode = values['allow-placeholders'] ? 0 : 2;
		} else {
			console.log('[PASSED] Staging 静态资源隔离与策略检查通过。云端资源和公测状态须以实际验收为准。');
		}
	} catch {
		// Wrangler diagnostics can include literal config source. Keep public CI output redacted.
		console.error('[FAILED] 无法解析 Staging 配置。请检查命令参数、Worker 依赖及 Wrangler 配置文件。');
		process.exitCode = 1;
	}
}
