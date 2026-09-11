import { sqliteTable, text, integer} from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { getDefaultUserLabelsString } from '../const/default-labels';

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
	customLabels: text('custom_labels').default(getDefaultUserLabelsString()).notNull(),
	totpEnabled: integer('totp_enabled').default(0).notNull(),
	totpSecret: text('totp_secret').default('').notNull(),
	totpKeyVersion: integer('totp_key_version').default(1).notNull(),
	totpBackupCodes: text('totp_backup_codes').default('[]').notNull(),
	totpCreatedAt: text('totp_created_at').default('').notNull(),
	securityKeys: text('security_keys').default('[]').notNull(),
	storageQuotaMb: integer('storage_quota_mb').default(0).notNull(),
	byoStorageEnabled: integer('byo_storage_enabled').default(0).notNull(),
	byoStorageConfig: text('byo_storage_config').default('{}').notNull()
});
export default user
