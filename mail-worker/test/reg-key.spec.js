import { env } from 'cloudflare:test';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import regKeyService from '../src/service/reg-key-service.js';

const CREATE_REG_KEY = `
CREATE TABLE IF NOT EXISTS reg_key (
	rege_key_id INTEGER PRIMARY KEY AUTOINCREMENT,
	code TEXT NOT NULL DEFAULT '',
	count INTEGER NOT NULL DEFAULT 0,
	role_id INTEGER NOT NULL DEFAULT 0,
	user_id INTEGER NOT NULL DEFAULT 0,
	expire_time TEXT,
	create_time TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
)`;

describe('Invite code atomic redemption', () => {
	beforeAll(async () => {
		await env.db.prepare(CREATE_REG_KEY).run();
	});

	afterAll(async () => {
		await env.db.prepare('DELETE FROM reg_key').run();
		await env.db.prepare('DROP TABLE IF EXISTS reg_key').run();
	});

	it('allows exactly one concurrent redemption from a single-use code', async () => {
		await env.db.prepare('DELETE FROM reg_key').run();
		await env.db.prepare('INSERT INTO reg_key (code, count, role_id) VALUES (?, ?, ?)')
			.bind('ONE-USE-CODE', 1, 1).run();

		const results = await Promise.all([
			regKeyService.consumeOne({ env }, 'ONE-USE-CODE'),
			regKeyService.consumeOne({ env }, 'ONE-USE-CODE')
		]);
		expect(results.filter(Boolean)).toHaveLength(1);

		const row = await env.db.prepare('SELECT count FROM reg_key WHERE code = ?')
			.bind('ONE-USE-CODE').first();
		expect(row.count).toBe(0);
	});

	it('restores a reservation when registration aborts', async () => {
		await env.db.prepare('DELETE FROM reg_key').run();
		await env.db.prepare('INSERT INTO reg_key (code, count, role_id) VALUES (?, ?, ?)')
			.bind('RESTORE-CODE', 1, 1).run();

		expect(await regKeyService.consumeOne({ env }, 'RESTORE-CODE')).toBe(true);
		await regKeyService.restoreOne({ env }, 'RESTORE-CODE');
		const row = await env.db.prepare('SELECT count FROM reg_key WHERE code = ?')
			.bind('RESTORE-CODE').first();
		expect(row.count).toBe(1);
	});
});
