import { sqliteTable, text, integer} from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
const user = sqliteTable('user', {
	userId: integer('user_id').primaryKey({ autoIncrement: true }),
	email: text('email').notNull(),
	type: integer('type').default(1).notNull(),
	password: text('password').notNull(),
	salt: text('salt').notNull(),
	status: integer('status').default(0).notNull(),
	createTime: text('create_time').default(sql`CURRENT_TIMESTAMP`),
	activeTime: text('active_time'),
	createIp: text('create_ip'),
	activeIp: text('active_ip'),
	os: text('os'),
	browser: text('browser'),
	device: text('device'),
	sort: text('sort').default(0),
	sendCount: text('send_count').default(0),
	regKeyId: integer('reg_key_id').default(0).notNull(),
	isDel: integer('is_del').default(0).notNull(),
	customLabels: text('custom_labels').default('{"allLabels":[{"name":"社群","icon":"ic:outline-people-alt","color":"#3b82f6","listVis":true,"stats":{"total":0,"current":0,"unread":0},"rules":[{"condition":{"type":"sender_address_includes","value":"gmail.com, outlook.com, qq.com, 163.com, yahoo.com, hotmail.com, foxmail.com, sina.com"}}]},{"name":"订阅","icon":"ic:outline-subscriptions","color":"#10b981","listVis":true,"stats":{"total":0,"current":0,"unread":0},"rules":[{"condition":{"type":"system_setting","value":""}}]},{"name":"推销","icon":"ic:outline-local-offer","color":"#f59e0b","listVis":true,"stats":{"total":0,"current":0,"unread":0},"rules":[{"condition":{"type":"system_setting","value":""}}]},{"name":"工作","icon":"ic:outline-work-outline","color":"#8b5cf6","listVis":true,"stats":{"total":0,"current":0,"unread":0},"rules":[]}]}').notNull(),
	totpEnabled: integer('totp_enabled').default(0).notNull(),
	totpSecret: text('totp_secret').default('').notNull(),
	totpKeyVersion: integer('totp_key_version').default(1).notNull(),
	totpBackupCodes: text('totp_backup_codes').default('[]').notNull(),
	totpCreatedAt: text('totp_created_at').default('').notNull(),
	securityKeys: text('security_keys').default('[]').notNull()
});
export default user
