import BizError from '../error/biz-error.js';

/**
 * Parse a JSON request body without allowing parser failures to escape as
 * unhandled exceptions. The API accepts object payloads only, which keeps
 * route destructuring and service validation deterministic for malformed,
 * empty, scalar, and array bodies.
 */
export async function readJsonObject(c) {
	let body;
	try {
		body = await c.req.json();
	} catch (_) {
		throw new BizError('Invalid JSON request body', 400, 'INVALID_JSON');
	}

	if (body === null || typeof body !== 'object' || Array.isArray(body)) {
		throw new BizError('JSON request body must be an object', 400, 'INVALID_JSON');
	}

	return body;
}

export default readJsonObject;
