import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const auditLog = sqliteTable('audit_log', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	ticketId: text('ticket_id'),
	userId: integer('user_id'),
	email: text('email').notNull(),
	warningType: text('warning_type').notNull(), // 'audit' | 'risk' | 'ban' | 'appeal'
	eventType: text('event_type').notNull(),
	category: text('category').notNull(),       // 'security' | 'account' | 'appeal'
	actionText: text('action_text').notNull(),
	detailText: text('detail_text'),
	ip: text('ip'),
	geo: text('geo'),
	device: text('device'),
	deviceType: text('device_type').default('desktop'),
	fingerprint: text('fingerprint'),
	baseIp: text('base_ip'),
	baseGeo: text('base_geo'),
	baseDevice: text('base_device'),
	baseFingerprint: text('base_fingerprint'),
	isRegIp: integer('is_reg_ip').default(0),
	isMultiIp: integer('is_multi_ip').default(0),
	activeIpCount: integer('active_ip_count').default(1),
	reportedByOthers: integer('reported_by_others').default(0),
	riskLevel: text('risk_level').default('normal'),
	priority: text('priority').default('P2'),
	status: text('status').default('active'),
	recommendedAction: text('recommended_action'),
	matchScore: integer('match_score').default(0),
	subnetMatch: integer('subnet_match').default(0),
	appealReason: text('appeal_reason'),
	banReason: text('ban_reason'),
	banTime: text('ban_time'),
	isInternal: integer('is_internal').default(0),
	reportCategory: text('report_category'),
	reportReason: text('report_reason'),
	resolvedTime: text('resolved_time'),
	createTime: text('create_time').notNull().default(sql`CURRENT_TIMESTAMP`)
});

export default auditLog;
