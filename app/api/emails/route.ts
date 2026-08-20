// /app/api/emails/route.ts
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getCurrentUser } from '@/lib/auth'
import { createJobs, listJobs, listSentJobs } from '@/lib/server/emails'
import { queue } from '@/lib/worker/email-worker'

const scheduleSchema = z.object({
  recipients: z.array(z.string().email()).min(1).max(1000),
  subject: z.string().trim().min(1).max(998),
  body: z.string().min(1).max(100000),
  scheduledAt: z.string().datetime().optional(),
  batchName: z.string().trim().max(255).optional(),
  delayBetween: z.number().min(1).max(3600).optional().default(5),
  hourlyLimit: z.number().min(10).max(1000).optional().default(100),
})

// GET: List all jobs for current user
export async function GET(request: Request) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized - Please login first' },
        { status: 401 }
      )
    }

    const url = new URL(request.url)
    const type = url.searchParams.get('type') || 'scheduled'
    
    let jobs
    if (type === 'sent') {
      jobs = await listSentJobs(user.id)
    } else {
      jobs = await listJobs(user.id)
    }

    return NextResponse.json({ 
      ok: true, 
      jobs,
      count: jobs.length,
      type
    })
  } catch (error) {
    console.error('List jobs error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch jobs' },
      { status: 500 }
    )
  }
}

// POST: Schedule new emails
export async function POST(request: Request) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized - Please login first' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const parsed = scheduleSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { 
          error: 'Invalid request', 
          details: parsed.error.flatten() 
        },
        { status: 400 }
      )
    }

    // Parse scheduled time
    const scheduledAt = parsed.data.scheduledAt 
      ? new Date(parsed.data.scheduledAt) 
      : new Date(Date.now() + 300000) // Default: 5 minutes from now

    if (isNaN(scheduledAt.getTime())) {
      return NextResponse.json(
        { error: 'Invalid scheduledAt date format' },
        { status: 400 }
      )
    }

    // Check if scheduled time is in the past (allow 1 minute grace)
    const now = new Date()
    if (scheduledAt < new Date(now.getTime() - 60000)) {
      return NextResponse.json(
        { error: 'scheduledAt must be in the future' },
        { status: 400 }
      )
    }

    // Create jobs in database
    const jobs = await createJobs(user.id, {
      recipients: parsed.data.recipients,
      subject: parsed.data.subject,
      body: parsed.data.body,
      scheduledAt: scheduledAt,
      batchName: parsed.data.batchName || 'Email Campaign'
    })

    // Add jobs to BullMQ queue with delay between emails
    const delayBetween = parsed.data.delayBetween || 5 // seconds
    const enqueuedJobs = []
    
    for (let i = 0; i < jobs.length; i++) {
      const job = jobs[i]
      // Each job gets delay: base delay + (i * delayBetween * 1000)
      const baseDelay = Math.max(0, scheduledAt.getTime() - now.getTime())
      const extraDelay = i * delayBetween * 1000
      const totalDelay = baseDelay + extraDelay
      
      await queue.add(
        'deliver',
        { 
          id: job.id,
          userId: user.id,
          delayBetween: delayBetween,
          hourlyLimit: parsed.data.hourlyLimit || 100
        },
        {
          jobId: job.id,
          delay: totalDelay,
          attempts: 4,
          backoff: {
            type: 'exponential',
            delay: 5000,
          },
          removeOnComplete: true,
          removeOnFail: false,
        }
      )
      enqueuedJobs.push(job.id)
    }

    console.log(`✅ Scheduled ${jobs.length} emails for user ${user.email} with ${delayBetween}s delay`)

    return NextResponse.json({
      ok: true,
      jobs: jobs,
      scheduled: jobs.length,
      scheduledAt: scheduledAt.toISOString(),
      delayBetween: delayBetween,
      hourlyLimit: parsed.data.hourlyLimit || 100,
      message: `Successfully scheduled ${jobs.length} email(s)`
    }, { status: 201 })

  } catch (error) {
    console.error('Schedule error:', error)
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Failed to schedule emails' 
      },
      { status: 400 }
    )
  }
}
