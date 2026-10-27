import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

/**
 * Companion row for settings that no longer fit in the 100-column D1 table.
 * settingService merges this row into the base setting object so callers keep
 * reading the same field names.
 */
export const settingExt = sqliteTable('setting_ext', {
	oauthLoginEnabled: integer('oauth_login_enabled').default(0).notNull(),
	oauthProviders: text('oauth_providers').default('{}').notNull(),
	auditLogEnabled: integer('audit_log_enabled').default(1).notNull(),
	auditMaxIpPerAccount: integer('audit_max_ip_per_account').default(3).notNull(),
	auditMaxDevicePerAccount: integer('audit_max_device_per_account').default(3).notNull(),
	auditAutoCleanOldest: integer('audit_auto_clean_oldest').default(1).notNull(),
	auditPrioritizeNonCriticalClean: integer('audit_prioritize_non_critical_clean').default(1).notNull(),
	auditCriticalQuota: integer('audit_critical_quota').default(3).notNull()
});

export default settingExt;
