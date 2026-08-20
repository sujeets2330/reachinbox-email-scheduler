export type EmailJobStatus = 'scheduled' | 'sending' | 'sent' | 'failed'

export type ScheduleEmailInput = {
  recipients: string[]
  subject: string
  body: string
  scheduledAt: string
}

export function validateScheduleEmail(input: Partial<ScheduleEmailInput>) {
  const recipients = Array.isArray(input.recipients) ? input.recipients.filter((value) => typeof value === 'string' && value.includes('@')) : []
  if (recipients.length === 0) throw new Error('At least one valid recipient is required.')
  if (!input.subject?.trim()) throw new Error('Subject is required.')
  if (!input.body?.trim()) throw new Error('Body is required.')
  if (!input.scheduledAt || Number.isNaN(Date.parse(input.scheduledAt))) throw new Error('A valid scheduledAt value is required.')
  return { recipients, subject: input.subject.trim(), body: input.body.trim(), scheduledAt: input.scheduledAt }
}

export function makeIdempotencyKey(input: ScheduleEmailInput) {
  return [input.recipients.join(','), input.subject, input.scheduledAt].join('|').toLowerCase()
}
