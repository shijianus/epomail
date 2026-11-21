import { env } from 'cloudflare:test';
import { getTableColumns } from 'drizzle-orm';
import { beforeAll, expect, it } from 'vitest';
import user from '../src/entity/user.js';
import role from '../src/entity/role.js';
import { claimOutboundTask } from '../src/service/mail-outbound-service.js';

const userDb = env.NOTICE_USER_DB;
const mailDb = env.NOTICE_MAIL_DB;
const c = { env: { USER_DB: userDb, MAIL_DB: mailDb } };

beforeAll(async () => {
	for (const [name, entity] of [['user', user], ['role', role]]) {
		const columns = Object.values(getTableColumns(entity)).map(col => `"${col.name}" ${col.getSQLType()}`);
		await userDb.prepare(`CREATE TABLE ${name} (${columns.join(',')})`).run();
	}
	await userDb.prepare('CREATE TABLE audit_log (email TEXT, warning_type TEXT, status TEXT)').run();
	await mailDb.prepare('CREATE TABLE account (account_id INTEGER,user_id INTEGER,email TEXT,status INTEGER,is_del INTEGER)').run();
	await mailDb.prepare('CREATE TABLE email (email_id INTEGER,account_id INTEGER,user_id INTEGER,send_email TEXT,outbound_task_id TEXT)').run();
	await mailDb.prepare(`CREATE TABLE mail_outbound_task (task_id TEXT PRIMARY KEY,user_id INTEGER,account_id INTEGER,
		email_id INTEGER,state TEXT,lease_token TEXT,lease_until INTEGER,updated_at TEXT)`).run();
});

it.each([true, false])('uses only the owning physical D1 and the prepared address at dispatch (self=%s)', async selfDelivery => {
	const userId = selfDelivery ? 11 : 12;
	const address = `alias-${userId}@example.test`;
	const id = crypto.randomUUID();
	const token = crypto.randomUUID();
	const sender = { userId, senderAddress: address, selfDelivery };
	await userDb.prepare('INSERT INTO user(user_id,email,status,is_del,type) VALUES (?,?,0,0,1)').bind(userId, address).run();
	await userDb.prepare("INSERT INTO audit_log VALUES (?,'ban','banned')").bind(address).run();
	await mailDb.prepare('INSERT INTO account VALUES (?,?,?,0,0)').bind(userId,userId,address).run();
	await mailDb.prepare('INSERT INTO email VALUES (?,?,?,?,?)').bind(userId,userId,userId,address,id).run();
	await mailDb.prepare("INSERT INTO mail_outbound_task VALUES (?,?,?,?,'PREPARED',?,unixepoch()+300,NULL)")
		.bind(id,userId,userId,userId,token).run();
	try {
		await expect(claimOutboundTask(c,id,token,sender)).rejects.toMatchObject({ code: 403, errorCode: 'account_unavailable' });
		await userDb.prepare("UPDATE audit_log SET status='resolved' WHERE email=?").bind(address).run();
		await mailDb.prepare('UPDATE email SET send_email=? WHERE outbound_task_id=?').bind('previous@example.test', id).run();
		await expect(claimOutboundTask(c,id,token,sender)).rejects.toMatchObject({ code: 403 });
		await mailDb.prepare('UPDATE email SET send_email=? WHERE outbound_task_id=?').bind(address, id).run();
		const dispatch = await claimOutboundTask(c,id,token,sender);
		expect(dispatch.task).toMatchObject({ state: 'SENDING', user_id: userId, account_id: userId });
		if (selfDelivery) expect(dispatch.dispatchIdentity.user.userId).toBe(userId);
	} finally {
		await userDb.batch([userDb.prepare('DELETE FROM audit_log WHERE email=?').bind(address),
			userDb.prepare('DELETE FROM user WHERE user_id=?').bind(userId)]);
		await mailDb.batch([mailDb.prepare('DELETE FROM mail_outbound_task WHERE task_id=?').bind(id),
			mailDb.prepare('DELETE FROM email WHERE outbound_task_id=?').bind(id), mailDb.prepare('DELETE FROM account WHERE user_id=?').bind(userId)]);
	}
});
