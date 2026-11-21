import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const notificationOutbox = sqliteTable('notification_outbox', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	taskId: text('task_id').notNull().unique(),
	caseId: integer('case_id'),
	ticketId: text('ticket_id'),
	userId: integer('user_id'),
	recipient: text('recipient').notNull(),
	channel: text('channel').notNull().default('internal'), // 'internal' | 'resend' | 'external'
	templateCode: text('template_code').notNull(),
	subject: text('subject').notNull(),
	content: text('content').notNull(),
	textContent: text('text_content'),
	reasonCode: text('reason_code'),
	status: text('status').notNull().default('pending'), // pending | processing | sent | delivered | unknown | failed | dead_letter | complained | cancelled
	providerMessageId: text('provider_message_id'),
	providerAttemptedAt: text('provider_attempted_at'), // immutable FIRST provider attempt; bounds key reuse
	claimantId: text('claimant_id'),
	leaseExpiresAt: text('lease_expires_at'),
	leaseVersion: integer('lease_version').notNull().default(0),
	retryCount: integer('retry_count').notNull().default(0),
	maxRetries: integer('max_retries').notNull().default(5),
	lastError: text('last_error'),
	nextRetryAt: text('next_retry_at'),
	deliveredAt: text('delivered_at'),
	readAt: text('read_at'),
	createTime: text('create_time').notNull().default(sql`CURRENT_TIMESTAMP`),
	updateTime: text('update_time').notNull().default(sql`CURRENT_TIMESTAMP`)
});

export default notificationOutbox;
