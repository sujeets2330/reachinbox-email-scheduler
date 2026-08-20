// /app/api/auth/signout/route.ts
import { NextResponse } from 'next/server'
import { signOut } from '@/lib/auth'

export async function POST() {
  try {
    await signOut()
    return NextResponse.json({ ok: true, message: 'Signed out successfully' })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to sign out' },
      { status: 500 }
    )
  }
}