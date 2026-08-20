// /app/api/emails/schedule/route.ts
import { NextResponse } from 'next/server'
import { validateScheduleEmail } from '@/lib/server/contracts'
import { createJobs } from '@/lib/server/emails'
import { getCurrentUser } from '@/lib/auth'
import { queue } from '@/lib/worker/email-worker'

export async function POST(request: Request) {
  try {
    // 1. Get authenticated user
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json(
        { ok: false, error: 'Unauthorized - Please login first' },
        { status: 401 }
      )
    }

    // 2. Parse and validate input
    const body = await request.json()
    const validated = validateScheduleEmail(body)

    // 3. Parse scheduled time
    const scheduledAt = new Date(validated.scheduledAt)
    if (isNaN(scheduledAt.getTime())) {
      return NextResponse.json(
        { ok: false, error: 'Invalid scheduled time' },
        { status: 400 }
      )
    }

    // 4. Create jobs in database
    const jobs = await createJobs(user.id, {
      recipients: validated.recipients,
      subject: validated.subject,
      body: validated.body,
      scheduledAt: scheduledAt,
      batchName: body.batchName || 'Email Campaign',
    })

    // 5. Add jobs to BullMQ queue
    const now = new Date()
    const enqueuedJobs = []

    for (const job of jobs) {
      const delay = Math.max(0, scheduledAt.getTime() - now.getTime())
      
      // Add to BullMQ queue with unique job ID for idempotency
      await queue.add(
        'deliver',
        { id: job.id },
        {
          jobId: job.id, // Use database ID as BullMQ job ID
          delay: delay,
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

    console.log(`✅ Scheduled ${jobs.length} emails for user ${user.id}`)

    return NextResponse.json({
      ok: true,
      scheduled: jobs.length,
      jobIds: enqueuedJobs,
      scheduledAt: scheduledAt.toISOString(),
      message: `Successfully scheduled ${jobs.length} email(s)`
    }, { status: 201 })

  } catch (error) {
    console.error('Schedule error:', error)
    return NextResponse.json(
      { 
        ok: false, 
        error: error instanceof Error ? error.message : 'Failed to schedule emails' 
      },
      { status: 400 }
    )
  }
}