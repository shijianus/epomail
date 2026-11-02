import { fetchMock } from 'cloudflare:test';
import { beforeAll, beforeEach } from 'vitest';

function blockUnmockedNetwork() {
	fetchMock.activate();
	fetchMock.disableNetConnect();
}

beforeAll(blockUnmockedNetwork);
beforeEach(blockUnmockedNetwork);
