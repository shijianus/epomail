import BizError from '../error/biz-error.js';
import { getUserDb } from './db-accessor.js';

export async function ensureAiBudgetSchema(c) {
	await getUserDb(c).prepare(`
		CREATE TABLE IF NOT EXISTS ai_request_budget (
			user_id INTEGER NOT NULL,
			kind TEXT NOT NULL,
			window_id INTEGER NOT NULL,
			request_count INTEGER NOT NULL DEFAULT 0,
			expires_at INTEGER NOT NULL,
			PRIMARY KEY (user_id, kind, window_id)
		)
	`).run();
}

export async function reserveAiRequest(c, userId, { minuteLimit = 60, dayLimit = 0 } = {}) {
	if (!Number.isSafeInteger(userId) || userId <= 0) {
		throw new BizError('Authentication is required', 401, 'auth_required');
	}
	const db = getUserDb(c);
	if (!db?.prepare) throw new BizError('AI request budget is unavailable', 503, 'ai_budget_unavailable');
	const now = Math.floor(Date.now() / 1000);
	const limits = [['minute', 60, Number(minuteLimit)], ['day', 86400, Number(dayLimit)]];
	for (const [kind, seconds, limit] of limits) {
		if (!Number.isSafeInteger(limit) || limit < 0) {
			throw new BizError('AI request budget is invalid', 503, 'ai_budget_unavailable');
		}
		if (limit === 0) continue;
		const windowId = Math.floor(now / seconds);
		const accepted = await db.prepare(`
			INSERT INTO ai_request_budget (user_id, kind, window_id, request_count, expires_at)
			VALUES (?, ?, ?, 1, ?)
			ON CONFLICT(user_id, kind, window_id) DO UPDATE
			SET request_count = request_count + 1
			WHERE request_count < ?
			RETURNING request_count
		`).bind(userId, kind, windowId, (windowId + 1) * seconds, limit).first();
		if (!accepted) {
			throw new BizError('AI request budget exceeded', 429, 'ai_budget_exceeded');
		}
	}
}

export async function purgeAiBudgets(c) {
	return getUserDb(c).prepare(`
		DELETE FROM ai_request_budget WHERE rowid IN (
			SELECT rowid FROM ai_request_budget WHERE expires_at < ? LIMIT 500
		)
	`).bind(Math.floor(Date.now() / 1000)).run();
}
