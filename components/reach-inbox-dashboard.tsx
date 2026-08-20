// /components/reach-inbox-dashboard.tsx
'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Archive,
  ArrowLeft,
  CalendarDays,
  ChevronDown,
  Clock3,
  FileText,
  HelpCircle,
  Inbox,
  LayoutDashboard,
  LogOut,
  Mail,
  Menu,
  MoreHorizontal,
  Paperclip,
  Plus,
  Search,
  Send,
  Settings,
  Sparkles,
  Trash2,
  Users,
  X,
  Upload,
  FileText as FileIcon,
} from 'lucide-react'

type JobStatus = 'scheduled' | 'sending' | 'sent' | 'failed'

type Job = {
  id: string
  recipient: string
  subject: string
  batchId: string
  scheduledAt: string
  status: JobStatus
  sentAt?: string | null
}

type User = {
  id: string
  name: string
  email: string
  avatarUrl: string | null
}

const navItems = [
  { label: 'Overview', icon: LayoutDashboard },
  { label: 'Scheduled', icon: Clock3 },
  { label: 'Sent', icon: Send },
  { label: 'Batches', icon: FileText },
]

function StatusPill({ status }: { status: JobStatus }) {
  const styles = {
    scheduled: 'bg-primary/10 text-primary',
    sending: 'bg-amber-500/12 text-amber-700 dark:text-amber-300',
    sent: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300',
    failed: 'bg-destructive/12 text-destructive',
  }
  const displayStatus = status.charAt(0).toUpperCase() + status.slice(1)
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${styles[status] || styles.scheduled}`}>
      <span className="size-1.5 rounded-full bg-current" />
      {displayStatus}
    </span>
  )
}

function AppMark() {
  return (
    <div className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
      <Mail className="size-4" />
    </div>
  )
}

export default function ReachInboxDashboard({ user }: { user: User }) {
  const [activeNav, setActiveNav] = useState('Overview')
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  const [composerOpen, setComposerOpen] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [toast, setToast] = useState('')
  const [isScheduling, setIsScheduling] = useState(false)
  
  // Form state with scheduling controls
  const [form, setForm] = useState({
    recipients: '',
    subject: '',
    body: '',
    scheduledAt: '',
    delayBetween: '5', // seconds
    hourlyLimit: '100', // per sender
  })
  
  const [csvFile, setCsvFile] = useState<File | null>(null)
  const [csvRecipients, setCsvRecipients] = useState<string[]>([])
  const [showCsvPreview, setShowCsvPreview] = useState(false)

  // Fetch jobs from API
  useEffect(() => {
    fetchJobs()
  }, [])

  const fetchJobs = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/emails')
      if (!response.ok) throw new Error('Failed to fetch jobs')
      const data = await response.json()
      setJobs(data.jobs || [])
    } catch (error) {
      console.error('Error fetching jobs:', error)
      notify('Failed to load emails')
    } finally {
      setLoading(false)
    }
  }

  const filteredJobs = useMemo(() => {
    let scoped = jobs
    if (activeNav === 'Scheduled') {
      scoped = jobs.filter((job) => job.status === 'scheduled' || job.status === 'sending')
    } else if (activeNav === 'Sent') {
      scoped = jobs.filter((job) => job.status === 'sent')
    }
    
    return scoped.filter((job) => 
      `${job.recipient} ${job.subject}`.toLowerCase().includes(query.toLowerCase())
    )
  }, [activeNav, jobs, query])

  function notify(message: string) {
    setToast(message)
    window.setTimeout(() => setToast(''), 2600)
  }

  // Handle CSV upload
  const handleCsvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    
    setCsvFile(file)
    const reader = new FileReader()
    reader.onload = (event) => {
      const text = event.target?.result as string
      // Parse CSV - split by commas, newlines, or semicolons
      const emails = text
        .split(/[\n,;]+/)
        .map(email => email.trim().toLowerCase())
        .filter(email => email.length > 0 && email.includes('@'))
      
      setCsvRecipients(emails)
      setShowCsvPreview(true)
      notify(`Found ${emails.length} email addresses in file`)
    }
    reader.readAsText(file)
  }

  // Add CSV recipients to form
  const addCsvRecipients = () => {
    if (csvRecipients.length === 0) return
    
    const existing = form.recipients
      .split(',')
      .map(r => r.trim())
      .filter(Boolean)
    
    const allRecipients = [...existing, ...csvRecipients]
    const unique = [...new Set(allRecipients)]
    setForm({ ...form, recipients: unique.join(', ') })
    setShowCsvPreview(false)
    setCsvFile(null)
    setCsvRecipients([])
    notify(`Added ${csvRecipients.length} emails from CSV`)
  }

  async function scheduleEmail() {
    if (!form.recipients || !form.subject || !form.body) {
      notify(' Recipients, Subject, and Message are required.')
      return
    }

    const recipients = form.recipients
      .split(',')
      .map((r) => r.trim())
      .filter(Boolean)

    if (recipients.length === 0) {
      notify(' Please enter at least one valid email address')
      return
    }

    setIsScheduling(true)

    // Build scheduled time
    let scheduledAt: string
    if (form.scheduledAt) {
      scheduledAt = new Date(form.scheduledAt).toISOString()
    } else {
      // Default: 5 minutes from now
      scheduledAt = new Date(Date.now() + 300000).toISOString()
    }

    const payload = {
      recipients,
      subject: form.subject,
      body: form.body,
      scheduledAt,
      delayBetween: parseInt(form.delayBetween) || 5,
      hourlyLimit: parseInt(form.hourlyLimit) || 100,
      batchName: `Campaign - ${new Date().toLocaleDateString()}`
    }

    try {
      const response = await fetch('/api/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to schedule email')
      }

      const data = await response.json()
      setForm({ 
        recipients: '', 
        subject: '', 
        body: '',
        scheduledAt: '',
        delayBetween: '5',
        hourlyLimit: '100'
      })
      setComposerOpen(false)
      
      const delayMsg = data.delayBetween ? ` with ${data.delayBetween}s delay` : ''
      notify(` ${data.scheduled || 1} email${data.scheduled > 1 ? 's' : ''} scheduled${delayMsg}`)
      
      // Refresh jobs
      await fetchJobs()
    } catch (error) {
      console.error('Error scheduling email:', error)
      notify(' Failed to schedule email: ' + (error instanceof Error ? error.message : 'Unknown error'))
    } finally {
      setIsScheduling(false)
    }
  }

  const handleSignOut = async () => {
    try {
      await fetch('/api/auth/signout', { method: 'POST' })
      window.location.href = '/login'
    } catch (error) {
      console.error('Error signing out:', error)
      notify('Failed to sign out')
    }
  }

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }

  const scheduledCount = jobs.filter((j) => j.status === 'scheduled' || j.status === 'sending').length
  const sentCount = jobs.filter((j) => j.status === 'sent').length

  // Format date for display
  const formatDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr)
      const now = new Date()
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      const yesterday = new Date(today)
      yesterday.setDate(yesterday.getDate() - 1)

      if (date >= today) {
        return `Today, ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
      } else if (date >= yesterday) {
        return `Yesterday, ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
      } else {
        return date.toLocaleString([], { 
          month: 'short', 
          day: 'numeric', 
          hour: '2-digit', 
          minute: '2-digit' 
        })
      }
    } catch {
      return dateStr
    }
  }

  // Get current date/time for min attribute
  const now = new Date()
  const minDateTime = now.toISOString().slice(0, 16)

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-border bg-card px-4 py-5 transition-transform lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex items-center gap-3 px-2">
          <AppMark />
          <div>
            <p className="text-sm font-bold tracking-tight">ReachInbox</p>
            <p className="text-xs text-muted-foreground">Outbound workspace</p>
          </div>
          <button className="ml-auto rounded-md p-1 text-muted-foreground hover:bg-muted lg:hidden cursor-pointer" onClick={() => setSidebarOpen(false)} aria-label="Close menu">
            <X className="size-4" />
          </button>
        </div>
        
        <button onClick={() => setComposerOpen(true)} className="mt-8 flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:opacity-90 cursor-pointer">
          <Plus className="size-4" />
          Compose email
        </button>
        
        <nav className="mt-8 flex flex-col gap-1" aria-label="Main navigation">
          {navItems.map(({ label, icon: Icon }) => (
            <button 
              key={label} 
              onClick={() => { setActiveNav(label); setSidebarOpen(false) }} 
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition cursor-pointer ${
                activeNav === label 
                  ? 'bg-primary/10 text-primary' 
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              <Icon className="size-4" />
              {label}
              {label === 'Scheduled' && scheduledCount > 0 && (
                <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{scheduledCount}</span>
              )}
            </button>
          ))}
        </nav>
        
        {/* Bottom section - */}
        <div className="mt-auto flex flex-col gap-1 border-t border-border pt-4">
          <div className="mt-3 flex items-center gap-3 rounded-xl bg-blue-50 p-3 border border-blue-200">
            {user.avatarUrl ? (
              <img src={user.avatarUrl} alt={user.name} className="size-8 rounded-full" />
            ) : (
              <div className="flex size-8 items-center justify-center rounded-full bg-blue-600 text-white text-xs font-bold">
                {getInitials(user.name)}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-gray-800">{user.name}</p>
              <p className="truncate text-xs text-gray-600">{user.email}</p>
            </div>
            <button 
              onClick={handleSignOut}
              className="rounded-md p-1.5 text-gray-600 hover:bg-blue-200 hover:text-blue-700 transition-colors duration-200 cursor-pointer" 
              aria-label="Log out"
            >
              <LogOut className="size-4" />
            </button>
          </div>
        </div>
      </aside>
      
      {sidebarOpen && (
        <button aria-label="Close navigation" className="fixed inset-0 z-30 bg-foreground/20 lg:hidden cursor-pointer" onClick={() => setSidebarOpen(false)} />
      )}
      
      <main className="min-h-screen lg:pl-64">
        {/* Header - Fixed with BLACK text */}
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-border bg-white px-5 shadow-sm md:px-8">
          <div className="flex items-center gap-3">
            <button className="rounded-lg p-2 hover:bg-muted lg:hidden cursor-pointer" onClick={() => setSidebarOpen(true)} aria-label="Open menu">
              <Menu className="size-5 text-gray-700" />
            </button>
            <div>
              <p className="text-xs font-medium text-gray-500">
                {new Date().toLocaleDateString('en-US', { 
                  weekday: 'long', 
                  year: 'numeric', 
                  month: 'long', 
                  day: 'numeric' 
                })}
              </p>
              <h1 className="text-lg font-bold text-gray-900 tracking-tight">
                Good {new Date().getHours() < 12 ? 'morning' : 'afternoon'}, {user.name.split(' ')[0]}
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button className="hidden rounded-lg p-2 text-gray-500 hover:bg-muted sm:block cursor-pointer" aria-label="Search">
              <Search className="size-4" />
            </button>
            <button onClick={() => setComposerOpen(true)} className="flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground cursor-pointer">
              <Plus className="size-4" /> 
              <span className="hidden sm:inline">Compose</span>
            </button>
          </div>
        </header>
        
        <div className="mx-auto max-w-7xl px-5 py-7 md:px-8">
          <section className="grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-border bg-card p-5">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-muted-foreground">Emails scheduled</p>
                <CalendarDays className="size-4 text-muted-foreground" />
              </div>
              <p className="mt-4 text-3xl font-bold tracking-tight">{scheduledCount}</p>
              <p className="mt-1 text-xs text-muted-foreground">Awaiting delivery</p>
            </div>
            
            <div className="rounded-2xl border border-border bg-card p-5">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-muted-foreground">Sent this week</p>
                <Send className="size-4 text-muted-foreground" />
              </div>
              <p className="mt-4 text-3xl font-bold tracking-tight">{sentCount}</p>
              <p className="mt-1 text-xs text-emerald-600">Delivered successfully</p>
            </div>
            
            <div className="rounded-2xl border border-border bg-card p-5">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-muted-foreground">Delivery rate</p>
                <Sparkles className="size-4 text-muted-foreground" />
              </div>
              <p className="mt-4 text-3xl font-bold tracking-tight">
                {jobs.length > 0 ? Math.round((sentCount / jobs.length) * 100) : 0}%
              </p>
              <p className="mt-1 text-xs text-muted-foreground">Last 30 days</p>
            </div>
          </section>
          
          <section className="mt-8 flex flex-col gap-4">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-primary">Activity</p>
                <h2 className="mt-1 text-2xl font-bold tracking-tight">
                  {activeNav === 'Overview' ? 'Recent emails' : activeNav}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Keep an eye on every message in your outbound workflow.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <input 
                    value={query} 
                    onChange={(event) => setQuery(event.target.value)} 
                    placeholder="Search emails" 
                    className="h-9 w-48 rounded-lg border border-input bg-card pl-9 pr-3 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus:ring-2 focus:ring-ring" 
                  />
                </div>
              </div>
            </div>
            
            <div className="overflow-hidden rounded-2xl border border-border bg-card">
              <div className="hidden grid-cols-[1.4fr_1.2fr_1fr_1fr_auto] gap-4 border-b border-border bg-muted/45 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground md:grid">
                <span>Recipient</span>
                <span>Subject</span>
                <span>Schedule</span>
                <span>Status</span>
              </div>
              <div className="divide-y divide-border">
                {loading ? (
                  <div className="px-5 py-16 text-center text-sm text-muted-foreground">
                    Loading your email queue...
                  </div>
                ) : filteredJobs.length > 0 ? (
                  filteredJobs.map((job) => (
                    <div key={job.id} className="grid gap-3 px-5 py-4 transition hover:bg-muted/30 md:grid-cols-[1.4fr_1.2fr_1fr_1fr_auto] md:items-center md:gap-4">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{job.recipient}</p>
                        <p className="mt-1 text-xs text-muted-foreground md:hidden">{job.subject}</p>
                      </div>
                      <p className="hidden truncate text-sm text-muted-foreground md:block">{job.subject}</p>
                      <p className="text-xs text-muted-foreground md:text-sm">{formatDate(job.scheduledAt)}</p>
                      <div className="flex items-center justify-between md:justify-start">
                        <StatusPill status={job.status} />
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="flex flex-col items-center gap-2 px-5 py-16 text-center">
                    <Inbox className="size-8 text-muted-foreground" />
                    <p className="text-sm font-semibold">No emails found</p>
                    <p className="text-sm text-muted-foreground">
                      {activeNav === 'Overview' 
                        ? 'Compose your first email to get started.' 
                        : 'No emails in this category yet.'}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </section>
          
          <section className="mt-8 rounded-2xl border border-border bg-primary p-6 text-primary-foreground md:flex md:items-center md:justify-between">
            <div>
              <p className="text-sm font-semibold">Ready to reach the next person?</p>
              <p className="mt-1 text-sm text-primary-foreground/75">
                Write once, schedule confidently, and let your queue do the rest.
              </p>
            </div>
            <button onClick={() => setComposerOpen(true)} className="mt-4 flex items-center gap-2 rounded-lg bg-primary-foreground px-4 py-2.5 text-sm font-semibold text-primary hover:opacity-90 md:mt-0 cursor-pointer">
              <Plus className="size-4" />
              Compose email
            </button>
          </section>
        </div>
      </main>
      
      {/* Composer Modal - Updated with Scheduling Controls */}
      {composerOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/30 p-0 sm:items-center sm:p-6">
          <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl border border-border bg-card shadow-2xl sm:rounded-2xl">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <div>
                <h2 className="font-semibold">Compose Email</h2>
                <p className="text-xs text-muted-foreground">
                  Create a message and configure scheduling settings.
                </p>
              </div>
              <button onClick={() => setComposerOpen(false)} className="rounded-lg p-2 text-muted-foreground hover:bg-muted cursor-pointer" aria-label="Close composer">
                <X className="size-4" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-5">
              <div className="flex flex-col gap-4">
                {/* Recipients - Required */}
                <label className="flex flex-col gap-2 text-sm font-medium">
                  Recipients <span className="text-destructive">*</span>
                  <input 
                    value={form.recipients} 
                    onChange={(event) => setForm({ ...form, recipients: event.target.value })} 
                    placeholder="name@company.com, another@company.com" 
                    className="rounded-lg border border-input bg-background px-3 py-2.5 text-sm font-normal outline-none focus:ring-2 focus:ring-ring" 
                  />
                  <span className="text-xs font-normal text-muted-foreground">
                    Separate multiple recipients with commas.
                  </span>
                </label>

                {/* CSV Upload */}
                <div className="flex items-center gap-3">
                  <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-input px-3 py-2 text-sm font-medium hover:bg-muted">
                    <Upload className="size-4" />
                    Upload CSV
                    <input 
                      type="file" 
                      accept=".csv,.txt" 
                      className="hidden" 
                      onChange={handleCsvUpload}
                    />
                  </label>
                  {csvFile && (
                    <span className="text-xs text-muted-foreground">
                      {csvFile.name} ({csvRecipients.length} emails)
                    </span>
                  )}
                  {showCsvPreview && csvRecipients.length > 0 && (
                    <button 
                      onClick={addCsvRecipients}
                      className="rounded-lg bg-primary px-3 py-1 text-xs text-primary-foreground hover:opacity-90 cursor-pointer"
                    >
                      Add {csvRecipients.length} emails
                    </button>
                  )}
                </div>

                {/* Subject - Required */}
                <label className="flex flex-col gap-2 text-sm font-medium">
                  Subject <span className="text-destructive">*</span>
                  <input 
                    value={form.subject} 
                    onChange={(event) => setForm({ ...form, subject: event.target.value })} 
                    placeholder="A thoughtful subject line" 
                    className="rounded-lg border border-input bg-background px-3 py-2.5 text-sm font-normal outline-none focus:ring-2 focus:ring-ring" 
                  />
                </label>

                {/* Body - Required */}
                <label className="flex flex-col gap-2 text-sm font-medium">
                  Message <span className="text-destructive">*</span>
                  <textarea 
                    value={form.body} 
                    onChange={(event) => setForm({ ...form, body: event.target.value })} 
                    placeholder="Write a concise, personal note..." 
                    rows={4} 
                    className="resize-none rounded-lg border border-input bg-background px-3 py-2.5 text-sm font-normal outline-none focus:ring-2 focus:ring-ring" 
                  />
                </label>

                {/* Scheduling Controls */}
                <div className="rounded-lg border border-border bg-muted/30 p-4">
                  <p className="text-sm font-semibold mb-3"> Scheduling Settings</p>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {/* Start Time */}
                    <label className="flex flex-col gap-2 text-sm font-medium">
                      Start Time
                      <input 
                        type="datetime-local" 
                        value={form.scheduledAt} 
                        min={minDateTime}
                        onChange={(event) => setForm({ ...form, scheduledAt: event.target.value })} 
                        className="rounded-lg border border-input bg-background px-3 py-2.5 text-sm font-normal outline-none focus:ring-2 focus:ring-ring" 
                      />
                      <span className="text-xs font-normal text-muted-foreground">
                         Leave empty to schedule in 5 minutes
                      </span>
                    </label>

                    {/* Delay Between Emails */}
                    <label className="flex flex-col gap-2 text-sm font-medium">
                      Delay Between Emails
                      <div className="flex items-center gap-2">
                        <input 
                          type="number" 
                          value={form.delayBetween} 
                          min="1"
                          max="3600"
                          onChange={(event) => setForm({ ...form, delayBetween: event.target.value })} 
                          className="flex-1 rounded-lg border border-input bg-background px-3 py-2.5 text-sm font-normal outline-none focus:ring-2 focus:ring-ring" 
                        />
                        <span className="text-sm text-muted-foreground">seconds</span>
                      </div>
                      <span className="text-xs font-normal text-muted-foreground">
                         Minimum 1 second between each email
                      </span>
                    </label>

                    {/* Hourly Limit */}
                    <label className="flex flex-col gap-2 text-sm font-medium sm:col-span-2">
                      Hourly Limit (Per Sender)
                      <div className="flex items-center gap-2">
                        <input 
                          type="number" 
                          value={form.hourlyLimit} 
                          min="10"
                          max="1000"
                          step="10"
                          onChange={(event) => setForm({ ...form, hourlyLimit: event.target.value })} 
                          className="flex-1 rounded-lg border border-input bg-background px-3 py-2.5 text-sm font-normal outline-none focus:ring-2 focus:ring-ring" 
                        />
                        <span className="text-sm text-muted-foreground">emails per hour</span>
                      </div>
                      <span className="text-xs font-normal text-muted-foreground">
                         Each user gets their own limit. Recommended: 100-200
                      </span>
                    </label>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="flex items-center justify-between border-t border-border bg-muted/30 px-5 py-4">
              <button onClick={() => setComposerOpen(false)} className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground cursor-pointer">
                <ArrowLeft className="size-4" />
                Back
              </button>
              <button 
                onClick={scheduleEmail} 
                disabled={isScheduling}
                className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                <CalendarDays className="size-4" />
                {isScheduling ? 'Scheduling...' : 'Schedule Email'}
              </button>
            </div>
          </div>
        </div>
      )}
      
      {toast && (
        <div role="status" className="fixed bottom-5 left-1/2 z-[60] -translate-x-1/2 rounded-lg bg-foreground px-4 py-3 text-sm font-medium text-background shadow-lg">
          {toast}
        </div>
      )}
    </div>
  )
}