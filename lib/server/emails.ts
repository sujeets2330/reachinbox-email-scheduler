// /server/emails.ts
import 'server-only'
import crypto from 'node:crypto'
import { and, desc, eq, inArray, lte } from 'drizzle-orm'  
import { db } from '../db'  
import { batches, emailJobs, type EmailJob, type NewEmailJob } from '../db/schema'  

export type ScheduleInput = {
  recipients: string[]
  subject: string
  body: string
  scheduledAt: Date
  batchName?: string
}

export async function listJobs(userId: string): Promise<EmailJob[]> {
  return db
    .select()
    .from(emailJobs)
    .where(eq(emailJobs.userId, userId))
    .orderBy(desc(emailJobs.createdAt))
    .limit(200)
}

export async function listSentJobs(userId: string): Promise<EmailJob[]> {
  return db
    .select()
    .from(emailJobs)
    .where(and(
      eq(emailJobs.userId, userId),
      eq(emailJobs.status, 'sent')
    ))
    .orderBy(desc(emailJobs.sentAt || emailJobs.createdAt))
    .limit(200)
}

export async function createJobs(userId: string, input: ScheduleInput) {
  const batchId = crypto.randomUUID()
  const now = new Date()
  
  await db.insert(batches).values({
    id: batchId,
    userId,
    name: input.batchName || 'New outreach',
    createdAt: now
  })

  const uniqueRecipients = [...new Set(
    input.recipients
      .map(r => r.trim().toLowerCase())
      .filter(Boolean)
  )]

  if (uniqueRecipients.length === 0) {
    throw new Error('No valid recipients provided')
  }

  const jobs: NewEmailJob[] = uniqueRecipients.map((recipient) => ({
    id: crypto.randomUUID(),
    userId,
    batchId,
    recipient,
    subject: input.subject.trim(),
    body: input.body,
    scheduledAt: input.scheduledAt,
    status: 'scheduled',
    attempts: 0,
    createdAt: now,
    lastError: null,
    sentAt: null
  }))

  if (jobs.length > 0) {
    await db.insert(emailJobs).values(jobs)
  }

  return jobs
}

export async function updateJob(userId: string, id: string, status: string) {
  await db
    .update(emailJobs)
    .set({ status })
    .where(and(
      eq(emailJobs.id, id),
      eq(emailJobs.userId, userId)
    ))
}

export async function getJobsByIds(ids: string[]): Promise<EmailJob[]> {
  if (ids.length === 0) return []
  return db
    .select()
    .from(emailJobs)
    .where(inArray(emailJobs.id, ids))
}

export async function getPendingJobs(): Promise<EmailJob[]> {
  const now = new Date()
  return db
    .select()
    .from(emailJobs)
    .where(
      and(
        eq(emailJobs.status, 'scheduled'),
        lte(emailJobs.scheduledAt, now) 
      )
    )
    .orderBy(emailJobs.scheduledAt)
    .limit(1000)
}