import { sqliteTable, integer, text } from 'drizzle-orm/sqlite-core';

export const legalAcceptance = sqliteTable('legal_acceptance', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	userId: integer('user_id').notNull(),
	termsVersion: text('terms_version').notNull(),
	acceptedAt: text('accepted_at').notNull(),
	locale: text('locale').notNull(),
	sourceUrl: text('source_url').notNull()
});

export default legalAcceptance;
