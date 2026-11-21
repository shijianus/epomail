import { env, fetchMock } from 'cloudflare:test';
import { ensureSessionRevocationSchema } from '../src/utils/session-revocation.js';
import { beforeAll, beforeEach } from 'vitest';

function blockUnmockedNetwork() {
	fetchMock.activate();
	fetchMock.disableNetConnect();
}

beforeAll(blockUnmockedNetwork);
// Minimal-schema suites must satisfy the session JWT authority prerequisite.
beforeAll(() => ensureSessionRevocationSchema({ env }));
beforeEach(blockUnmockedNetwork);
