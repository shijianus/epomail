import { getMailDb } from './db-accessor.js';

// The CHECK is a transaction assertion: a stale lease/candidate must roll back
// the whole D1 batch instead of silently matching zero rows after other writes.
export function mailTransactionGuard(c, condition, parameters = []) {
	const db = getMailDb(c);
	const token = crypto.randomUUID();
	return {
		before: db.prepare(`INSERT INTO mail_transaction_guard (token, valid)
			VALUES (?, CASE WHEN (${condition}) THEN 1 ELSE 0 END)`).bind(token, ...parameters),
		after: db.prepare('DELETE FROM mail_transaction_guard WHERE token = ?').bind(token)
	};
}
