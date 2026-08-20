// /app/api/emails/[id]/route.ts
import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { updateJob, getJobsByIds } from '@/lib/server/emails'
import { queue } from '@/lib/worker/email-worker'

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized - Please login first' },
        { status: 401 }
      )
    }

    const { id } = await context.params
    const body = await request.json().catch(() => ({}))
    
    const status = body.status === 'cancelled' || body.status === 'retry' ? body.status : null
    if (!status) {
      return NextResponse.json(
        { error: 'Unsupported status. Allowed: cancelled, retry' },
        { status: 400 }
      )
    }

    // Update status in database
    const newStatus = status === 'retry' ? 'scheduled' : status
    await updateJob(user.id, id, newStatus)

    // If retry, re-add to queue
    if (status === 'retry') {
      const [job] = await getJobsByIds([id])
      if (job && job.status === 'scheduled') {
        await queue.add(
          'deliver',
          { id: job.id },
          {
            jobId: job.id,
            delay: 5000, // Retry after 5 seconds
            attempts: 4,
            backoff: {
              type: 'exponential',
              delay: 5000,
            },
          }
        )
        console.log(`🔄 Retry job ${id} added to queue`)
      }
    }

    return NextResponse.json({ 
      ok: true, 
      status: newStatus,
      message: `Job ${status === 'cancelled' ? 'cancelled' : 'retry scheduled'} successfully`
    })

  } catch (error) {
    console.error('Update job error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update job' },
      { status: 500 }
    )
  }
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized - Please login first' },
        { status: 401 }
      )
    }

    const { id } = await context.params
    const [job] = await getJobsByIds([id])

    if (!job) {
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      )
    }

    // Security check - ensure user owns this job
    if (job.userId !== user.id) {
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
      )
    }

    return NextResponse.json({ 
      ok: true, 
      job 
    })

  } catch (error) {
    console.error('Get job error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch job' },
      { status: 500 }
    )
  }
}