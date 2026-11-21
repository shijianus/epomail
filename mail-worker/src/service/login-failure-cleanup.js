import KvConst from '../const/kv-const.js';
import BizError from '../error/biz-error.js';
import { getUserDb, getMailDb } from '../utils/db-accessor.js';
import { deleteKvKeys, deleteKvMatching } from '../utils/kv-revocation.js';

// SQLite lower() only folds ASCII. Compare non-ASCII names with the same
// JavaScript normalization as login, and page through matches in bounded reads.
async function collectRetained(db, table, column, guard, bindings, subjects, canonical, retained) {
	let cursor = 0;
	while (true) {
		const { results } = await db.prepare(`SELECT rowid AS id, ${column} AS name FROM ${table}
			WHERE rowid>? AND ${guard} AND (lower(trim(${column})) IN (SELECT value FROM json_each(?))
				OR ${column} GLOB '*[^ -~]*') ORDER BY rowid LIMIT 128`).bind(cursor, ...bindings, subjects).all();
		for (const row of results) {
			const name = row.name.trim().toLowerCase();
			if (canonical.has(name)) retained.add(name);
		}
		if (results.length < 128) return;
		cursor = results.at(-1).id;
	}
}

// Keep the owning D1 rows until this succeeds. A retry rediscovers aliases and
// checks their current owners before touching any shared login identifier.
export async function clearDeletedLoginFailures(c, users, accounts, mailbox = null) {
	const names = new Set();
	for (const value of [...users.map(row => row.email), ...accounts.flatMap(row => [row.email, row.name])]) {
		const trimmed = value?.trim();
		if (trimmed) {
			names.add(trimmed);
			names.add(trimmed.toLowerCase());
		}
	}
	if (!names.size) return;
	const ids = JSON.stringify(users.map(row => row.userId));
	const canonical = new Set([...names].map(value => value.toLowerCase()));
	const subjects = JSON.stringify([...canonical]);
	const identity = getUserDb(c);
	const mail = getMailDb(c);
	const keepUsers = 'user_id NOT IN (SELECT value FROM json_each(?))';
	const keepMailboxes = mailbox ? 'NOT (account_id=? AND user_id=?)' : keepUsers;
	const keep = mailbox ? [mailbox.accountId, mailbox.userId] : [ids];
	try {
		if (mailbox) {
			const current = await mail.prepare('SELECT email,name,user_id FROM account WHERE account_id=?').bind(mailbox.accountId).first();
			if (current?.user_id !== mailbox.userId || current.email !== mailbox.email || current.name !== mailbox.name) {
				throw new BizError('Mailbox changed before login cleanup', 409, 'mail_purge_conflict');
			}
		}
		const retained = new Set();
		await Promise.all([
			collectRetained(identity, 'user', 'email', keepUsers, [ids], subjects, canonical, retained),
			collectRetained(mail, 'account', 'email', keepMailboxes, keep, subjects, canonical, retained),
			collectRetained(mail, 'account', 'name', keepMailboxes, keep, subjects, canonical, retained)
		]);
		const removed = [...names].filter(name => !retained.has(name.toLowerCase()));
		if (!removed.length) return;

		await deleteKvKeys(c.env.kv, removed.map(name => KvConst.LOGIN_FAIL + name));
		for (const name of removed) {
			const prefix = KvConst.LOGIN_FAIL + name + '|ip:';
			await deleteKvMatching(c.env.kv, prefix, key => !key.name.slice(prefix.length).includes('|ip:'));
		}
		// Old databases can predate durable counters. Other rate-limit scopes and
		// identifiers with the same leading characters belong to different subjects.
		if (await identity.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='rate_limit_counter'").first()) {
			await identity.prepare(`DELETE FROM rate_limit_counter WHERE scope='login-fail' AND EXISTS (
				SELECT 1 FROM json_each(?) AS id WHERE subject='email:'||id.value OR (
					instr(subject,'email:'||id.value||'|ip:')=1 AND instr(substr(subject,length(id.value)+11),'|ip:')=0
				))`).bind(JSON.stringify(removed)).run();
		}
	} catch (error) {
		if (error instanceof BizError) throw error;
		throw new BizError('Login failure cleanup is incomplete; retry deletion', 503, 'login_failure_cleanup_pending');
	}
}
