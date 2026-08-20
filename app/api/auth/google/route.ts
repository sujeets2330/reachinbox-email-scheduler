// /app/api/auth/google/route.ts
import { NextResponse } from 'next/server'
import { createOAuthState, googleAuthUrl } from '@/lib/auth'

export async function GET() {
  try {
    const state = await createOAuthState()
    const authUrl = googleAuthUrl(state)
    return NextResponse.redirect(authUrl)
  } catch (error) {
    console.error('Google auth error:', error)
    return NextResponse.redirect(
      new URL('/login?error=auth_failed', process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000')
    )
  }
}