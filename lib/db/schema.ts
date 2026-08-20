import { mysqlTable, varchar, text, datetime, int, index, uniqueIndex } from 'drizzle-orm/mysql-core'

export const users = mysqlTable('users', {
  id: varchar('id', { length: 64 }).primaryKey(),
  email: varchar('email', { length: 255 }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  avatarUrl: text('avatar_url'),
  createdAt: datetime('created_at').notNull(),
}, (table) => ({ emailIdx: uniqueIndex('users_email_idx').on(table.email) }))

export const sessions = mysqlTable('sessions', {
  id: varchar('id', { length: 64 }).primaryKey(),
  userId: varchar('user_id', { length: 64 }).notNull(),
  expiresAt: datetime('expires_at').notNull(),
}, (table) => ({ userIdx: index('sessions_user_idx').on(table.userId) }))

export const batches = mysqlTable('batches', {
  id: varchar('id', { length: 64 }).primaryKey(),
  userId: varchar('user_id', { length: 64 }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  createdAt: datetime('created_at').notNull(),
}, (table) => ({ userIdx: index('batches_user_idx').on(table.userId) }))

export const emailJobs = mysqlTable('email_jobs', {
  id: varchar('id', { length: 64 }).primaryKey(),
  userId: varchar('user_id', { length: 64 }).notNull(),
  batchId: varchar('batch_id', { length: 64 }).notNull(),
  recipient: varchar('recipient', { length: 320 }).notNull(),
  subject: varchar('subject', { length: 998 }).notNull(),
  body: text('body').notNull(),
  scheduledAt: datetime('scheduled_at').notNull(),
  status: varchar('status', { length: 24 }).notNull().default('scheduled'),
  attempts: int('attempts').notNull().default(0),
  lastError: text('last_error'),
  sentAt: datetime('sent_at'),
  createdAt: datetime('created_at').notNull(),
}, (table) => ({ userStatusIdx: index('jobs_user_status_idx').on(table.userId, table.status), dueIdx: index('jobs_due_idx').on(table.status, table.scheduledAt), idempotencyIdx: uniqueIndex('jobs_idempotency_idx').on(table.userId, table.recipient, table.scheduledAt) }))

export type EmailJob = typeof emailJobs.$inferSelect
export type NewEmailJob = typeof emailJobs.$inferInsert
