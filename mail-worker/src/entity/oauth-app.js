import { sqliteTable, integer, text } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const oauthApp = sqliteTable('oauth_app', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	clientId: text('client_id').notNull().unique(),
	clientSecret: text('client_secret').notNull(),
	name: text('name').notNull(),
	homepageUrl: text('homepage_url').default('').notNull(),
	description: text('description').default('').notNull(),
	redirectUris: text('redirect_uris').default('[]').notNull(),
	logoUrl: text('logo_url').default('').notNull(),
	scopes: text('scopes').default('openid profile email').notNull(),
	status: integer('status').default(1).notNull(),
	createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
	updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`).notNull()
});

export const oauthGrant = sqliteTable('oauth_grant', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	userId: integer('user_id').notNull(),
	clientId: text('client_id').notNull(),
	scopes: text('scopes').default('openid profile email').notNull(),
	createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
	updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`).notNull()
});
