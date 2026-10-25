import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// The worker sources use extensionless imports (valid for the bundler):
//   import orm from '../entity/orm'
//   import utc from 'dayjs/plugin/utc'
// Node's ESM resolver requires extensions. This loader only retries with a
// `.js` suffix when the original specifier cannot be resolved. It never
// rewrites a specifier that already resolves.
export async function resolve(specifier, context, nextResolve) {
	try {
		return await nextResolve(specifier, context);
	} catch (err) {
		if (/\.[cm]?js$/i.test(specifier)) throw err;
		const base = specifier.startsWith('.')
			? new URL(`${specifier}.js`, context.parentURL)
			: null;
		if (base) {
			if (existsSync(fileURLToPath(base))) {
				return nextResolve(base.href, context);
			}
			throw err;
		}
		try {
			return await nextResolve(`${specifier}.js`, context);
		} catch {
			throw err;
		}
	}
}
