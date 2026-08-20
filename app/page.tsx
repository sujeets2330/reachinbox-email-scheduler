// /app/page.tsx
import { redirect } from 'next/navigation'
import ReachInboxDashboard from '@/components/reach-inbox-dashboard'
import { getCurrentUser } from '@/lib/auth'

export default async function Page() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  return <ReachInboxDashboard user={user} />
}