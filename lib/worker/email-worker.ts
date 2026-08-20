// /lib/worker/email-worker.ts
import 'dotenv/config'
import { Worker, Queue } from 'bullmq'
import nodemailer from 'nodemailer'
import { eq, and, lte } from 'drizzle-orm'
import { db } from '../db'
import { emailJobs } from '../db/schema'
import Redis from 'ioredis'

// Redis connection for custom rate limiting
const redis = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379')

const connection = {
  url: process.env.REDIS_URL || 'redis://127.0.0.1:6379',
  maxRetriesPerRequest: 3,
  retryDelayOnFail: 1000,
}

// Email queue
export const queue = new Queue('email-delivery', {
  connection,
  defaultJobOptions: {
    attempts: 4,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: 100,
    removeOnFail: 200,
  },
})

// SMTP transporter
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD,
  },
  tls: {
    rejectUnauthorized: false,
  },
})

transporter.verify((error, success) => {
  if (error) {
    console.error('SMTP connection failed:', error)
  } else {
    console.log('SMTP server is ready to send emails')
  }
})

/**
 * PER-SENDER RATE LIMITER
 * Each sender (user) gets their own limit from UI
 */
async function checkPerSenderRateLimit(senderId: string, hourlyLimit: number = 100): Promise<{ allowed: boolean, remaining: number, resetIn: number }> {
  try {
    const now = new Date()
    const hourKey = `${senderId}:${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}-${now.getHours()}`
    
    const currentCount = await redis.get(hourKey)
    const count = currentCount ? parseInt(currentCount, 10) : 0
    
    const remaining = Math.max(0, hourlyLimit - count)
    
    if (count >= hourlyLimit) {
      console.log(`Rate limit exceeded for sender ${senderId}: ${count}/${hourlyLimit} used`)
      return { 
        allowed: false, 
        remaining: 0,
        resetIn: 3600 - (now.getMinutes() * 60 + now.getSeconds())
      }
    }
    
    const newCount = await redis.incr(hourKey)
    
    if (newCount === 1) {
      await redis.expire(hourKey, 3600)
    }
    
    const newRemaining = Math.max(0, hourlyLimit - newCount)
    console.log(`Sender ${senderId}: ${newCount}/${hourlyLimit} used, ${newRemaining} remaining`)
    
    return { 
      allowed: true, 
      remaining: newRemaining,
      resetIn: 3600 - (now.getMinutes() * 60 + now.getSeconds())
    }
    
  } catch (error) {
    console.error('Rate limiter error:', error)
    return { allowed: true, remaining: hourlyLimit, resetIn: 0 }
  }
}

// Create worker with PER-SENDER rate limiting
export const worker = new Worker(
  'email-delivery',
  async (job) => {
    const { id: jobId, userId, hourlyLimit = 100 } = job.data
    
    console.log(`Processing job ${jobId} for user ${userId}`)

    const [record] = await db
      .select()
      .from(emailJobs)
      .where(eq(emailJobs.id, jobId))
      .limit(1)

    if (!record) {
      console.log(`Job ${jobId} not found in database`)
      return
    }

    if (record.status === 'sent' || record.status === 'cancelled') {
      console.log(`Job ${jobId} already ${record.status}`)
      return
    }

    // Check if it's time to send
    const scheduledTime = new Date(record.scheduledAt)
    const now = new Date()
    
    if (scheduledTime > now) {
      // Not due yet - simply return without error
      // The job will be retried by BullMQ's retry mechanism
      console.log(`Job ${jobId} scheduled at ${scheduledTime.toISOString()}, not due yet (${Math.round((scheduledTime.getTime() - now.getTime()) / 1000)}s remaining)`)
      // Don't throw error, just return - BullMQ will retry
      return
    }

    // PER-SENDER RATE LIMIT CHECK 
    const rateCheck = await checkPerSenderRateLimit(record.userId, hourlyLimit)
    
    if (!rateCheck.allowed) {
      console.log(`Rate limit reached for ${record.userId}, rescheduling job ${jobId}`)
      console.log(`Resets in ${Math.floor(rateCheck.resetIn / 60)} minutes`)
      
      // Reschedule to next hour using BullMQ's built-in retry
      const nowTime = new Date()
      const nextHour = new Date(nowTime)
      nextHour.setHours(nowTime.getHours() + 1)
      nextHour.setMinutes(0)
      nextHour.setSeconds(0)
      nextHour.setMilliseconds(0)
      
      const delayMs = nextHour.getTime() - nowTime.getTime() + 5000
      
      // Move to delayed state
      await job.moveToDelayed(Date.now() + delayMs)
      return
    }

    // Update status to sending
    await db
      .update(emailJobs)
      .set({
        status: 'sending',
        attempts: record.attempts + 1,
      })
      .where(eq(emailJobs.id, record.id))

    try {
      const info = await transporter.sendMail({
        from: process.env.SMTP_FROM || 'ReachInbox <no-reply@example.com>',
        to: record.recipient,
        subject: record.subject,
        text: record.body,
        html: record.body.replace(/\n/g, '<br>'),
      })

      console.log(`Email sent to ${record.recipient} (${info.messageId})`)

      await db
        .update(emailJobs)
        .set({
          status: 'sent',
          sentAt: new Date(),
          lastError: null,
        })
        .where(eq(emailJobs.id, record.id))

    } catch (error) {
      console.error(`Failed to send email ${jobId}:`, error)

      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      
      const attempts = record.attempts + 1
      const maxAttempts = 4
      
      await db
        .update(emailJobs)
        .set({
          status: attempts >= maxAttempts ? 'failed' : 'scheduled',
          attempts: attempts,
          lastError: errorMessage,
        })
        .where(eq(emailJobs.id, record.id))

      if (attempts < maxAttempts) {
        throw error
      }
    }
  },
  {
    connection,
    concurrency: Number(process.env.WORKER_CONCURRENCY || 5),
    // NO BULLMQ LIMITER - we use custom Redis counter per sender
    removeOnComplete: { age: 86400 },
    removeOnFail: { age: 86400 },
  }
)

// Worker event handlers
worker.on('completed', (job) => {
  console.log(`Job ${job.id} completed successfully`)
})

worker.on('failed', async (job, error) => {
  if (!job) return
  
  console.error(`Job ${job.id} failed:`, error.message)
  
  try {
    const [record] = await db
      .select()
      .from(emailJobs)
      .where(eq(emailJobs.id, job.data.id))
      .limit(1)
    
    if (record && record.status !== 'sent') {
      await db
        .update(emailJobs)
        .set({
          status: job.attemptsMade >= 4 ? 'failed' : 'scheduled',
          lastError: error.message,
        })
        .where(eq(emailJobs.id, record.id))
    }
  } catch (dbError) {
    console.error('Failed to update job status in database:', dbError)
  }
})

worker.on('error', (error) => {
  console.error('Worker error:', error)
})

// Scheduler - Poll database for due jobs
let schedulerInterval: NodeJS.Timeout | null = null

export async function startScheduler() {
  if (schedulerInterval) {
    console.log('Scheduler already running')
    return
  }

  console.log('Starting scheduler...')
  
  schedulerInterval = setInterval(async () => {
    try {
      const now = new Date()
      
      const dueJobs = await db
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

      if (dueJobs.length > 0) {
        console.log(`Found ${dueJobs.length} due jobs to schedule`)

        for (const job of dueJobs) {
          const delay = Math.max(0, job.scheduledAt.getTime() - now.getTime())
          
          // Check if job already exists in queue
          const existingJob = await queue.getJob(job.id)
          if (!existingJob) {
            await queue.add(
              'deliver',
              { 
                id: job.id,
                userId: job.userId,
                hourlyLimit: 100
              },
              {
                jobId: job.id,
                delay: delay || 1000, // Minimum 1 second delay
                attempts: 4,
                backoff: {
                  type: 'exponential',
                  delay: 5000,
                },
                removeOnComplete: true,
                removeOnFail: false,
              }
            )
            console.log(`Added job ${job.id} to queue with ${delay}ms delay`)
          }
        }
      }
    } catch (error) {
      console.error('Scheduler error:', error)
    }
  }, 10000) // Check every 10 seconds
}

export async function stopScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval)
    schedulerInterval = null
    console.log('Scheduler stopped')
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Received SIGTERM, shutting down gracefully...')
  await stopScheduler()
  await worker.close()
  await queue.close()
  await redis.quit()
  process.exit(0)
})

process.on('SIGINT', async () => {
  console.log('Received SIGINT, shutting down gracefully...')
  await stopScheduler()
  await worker.close()
  await queue.close()
  await redis.quit()
  process.exit(0)
})

startScheduler().catch(console.error)

console.log(` ReachInbox worker is running with PER-SENDER rate limiting`)
console.log(' Each sender gets their own quota set from UI')