export async function resolve(specifier, context, nextResolve) {
	try {
		return await nextResolve(specifier, context);
	} catch (e) {
		if (!specifier.endsWith('.js') && !specifier.endsWith('.mjs') && !specifier.endsWith('.json')) {
			try {
				return await nextResolve(specifier + '.js', context);
			} catch (e2) {}
			try {
				return await nextResolve(specifier + '/index.js', context);
			} catch (e3) {}
		}
		throw e;
	}
}
