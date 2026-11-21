import { getMailDb } from '../utils/db-accessor.js';
import verifyUtils from '../utils/verify-utils.js';

export function personalForwardingAvailable(env) {
	return String(env?.PERSONAL_FORWARDING_ENABLED).toLowerCase() === 'true';
}

// Keep consent in D1. A delayed KV read after opt-out must never authorize an old task.
export async function setForwardPolicy(c, userId, value) {
	const json = JSON.stringify(value);
	await getMailDb(c).prepare(`INSERT INTO mail_forward_policy(user_id,revision,preferences) VALUES(?,?,?)
		ON CONFLICT(user_id) DO UPDATE SET revision=excluded.revision,preferences=excluded.preferences
		WHERE mail_forward_policy.preferences<>excluded.preferences`).bind(userId, crypto.randomUUID(), json).run();
}

export async function readForwardPolicy(c, userId, legacyProfile) {
	const row = await getMailDb(c).prepare('SELECT revision,preferences FROM mail_forward_policy WHERE user_id=?').bind(userId).first();
	if (row) return { revision: row.revision, preferences: JSON.parse(row.preferences) };
	const profile = legacyProfile ?? await c.env.kv.get('USER_PROFILE_' + userId, { type: 'json' });
	return { revision: 'legacy', preferences: profile?.personalForwarding };
}

function targetsFor(prefs, recipient, sender, domains) {
	if (prefs?.enabled !== true || prefs.keepCopy === false || !['all', 'alias'].includes(prefs.mode || 'all')) return [];
	const local = recipient.split('@')[0];
	if (prefs.mode === 'alias' && !String(prefs.aliasPrefixes || '').toLowerCase()
		.split(',').some(value => value.trim() && local.startsWith(value.trim()))) return [];
	const localDomains = new Set((domains || []).map(value => String(value).replace(/^@/, '').toLowerCase()));
	return [...new Set(String(prefs.targets || '').toLowerCase().split(',').map(v => v.trim()))]
		.filter(target => verifyUtils.isEmail(target) && target.length <= 254 && target !== recipient && target !== sender && !localDomains.has(target.split('@').pop())).slice(0, 5);
}

export async function forwardPlan(c, settings, mail) {
	if (!personalForwardingAvailable(c.env) || Number(settings.userEmailForward ?? 1) !== 1
		|| Number(settings.allMailMode) === 2 || Number(mail.isDel) === 1 || !mail.userId || !mail.accountId) return null;
	const { preferences, revision } = await readForwardPolicy(c, mail.userId);
	const targets = targetsFor(preferences, String(mail.toEmail || '').toLowerCase(), String(mail.sendEmail || '').toLowerCase(), settings.domainList);
	return { targets, revision, addPrefix: !!preferences?.addPrefix };
}

// The containing D1 batch inserts the mail and its intents together. A receipt is safe to
// acknowledge once committed even if the worker stops before the next scheduled run.
export function forwardIntentStatements(c, plan, claimKey) {
	return (plan?.targets || []).map(target => getMailDb(c).prepare(`INSERT INTO mail_forward_task
		(task_id,user_id,account_id,email_id,target,add_prefix,policy_revision,state)
		SELECT ?,user_id,account_id,email_id,?,?,?,'PENDING' FROM email WHERE receive_claim_key=? AND is_del=0
		ON CONFLICT(user_id,email_id,target) DO NOTHING`)
		.bind(crypto.randomUUID(), target, Number(plan.addPrefix), plan.revision, claimKey));
}
