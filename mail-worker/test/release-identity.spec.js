import { expect, it } from 'vitest';
import worker from '../src/index.js';

const request = new Request('https://release.test/api/version');
const candidate = { tag: 'a'.repeat(40), id: 'fixture-version-id' };

it('reports the serving version and full release SHA without exposing other bindings', async () => {
	const response = await worker.fetch(request, { CF_VERSION_METADATA: { ...candidate, timestamp: 'fixture' } }, {});
	expect(response.status).toBe(200);
	expect(response.headers.get('Cache-Control')).toBe('no-store');
	expect(await response.json()).toEqual({ sha: candidate.tag, versionId: candidate.id });
});

it.each([undefined, { ...candidate, tag: 'untagged-release' }, { tag: candidate.tag }])(
	'fails closed when release identity is incomplete (%j)', async version => {
		const response = await worker.fetch(request, { CF_VERSION_METADATA: version }, {});
		expect(response.status).toBe(503);
		expect(await response.json()).toEqual({ errorCode: 'release_identity_unavailable' });
	}
);
