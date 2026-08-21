// /lib/auth.ts
import 'server-only'
import crypto from 'node:crypto'
import { cookies } from 'next/headers'
import { and, eq, gt } from 'drizzle-orm'
import { db } from './db'
import { sessions, users } from './db/schema'

const COOKIE = 'reachinbox_session'
const STATE_COOKIE = 'reachinbox_oauth_state'

// Get auth secret
const getAuthSecret = () => {
  const secret = process.env.AUTH_SECRET
  if (!secret || secret === 'development-only-change-me') {
    console.warn(' Using development AUTH_SECRET. Set a secure secret in production!')
  }
  return secret || 'development-only-change-me'
}

// Sign a value with HMAC
const sign = (value: string) => {
  return crypto.createHmac('sha256', getAuthSecret()).update(value).digest('hex')
}

// Safe comparison to prevent timing attacks
const safeEqual = (a: string, b: string) => {
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b))
}

// Create a new session for a user
export async function createSession(user: {
  id: string
  email: string
  name: string
  avatarUrl?: string | null
}) {
  const sessionId = crypto.randomUUID()
  
  // Upsert user
  await db.insert(users)
    .values({
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl ?? null,
      createdAt: new Date()
    })
    .onDuplicateKeyUpdate({
      set: {
        name: user.name,
        avatarUrl: user.avatarUrl ?? null
      }
    })

  // Create session (30 days expiry)
  const expiresAt = new Date(Date.now() + 30 * 86400000) // 30 days
  await db.insert(sessions)
    .values({
      id: sessionId,
      userId: user.id,
      expiresAt: expiresAt
    })

  // Set cookie
  const value = `${sessionId}.${sign(sessionId)}`
  const cookieStore = await cookies()
  cookieStore.set(COOKIE, value, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 30 * 86400 // 30 days
  })

  return sessionId
}

// Get current authenticated user
export async function getCurrentUser() {
  try {
    const cookieStore = await cookies()
    const raw = cookieStore.get(COOKIE)?.value
    
    if (!raw) return null

    const [id, signature] = raw.split('.')
    if (!id || !signature) return null

    // Verify signature
    const expectedSignature = sign(id)
    if (!safeEqual(signature, expectedSignature)) return null

    // Get session and user from database
    const result = await db
      .select({
        user: users
      })
      .from(sessions)
      .innerJoin(users, eq(sessions.userId, users.id))
      .where(
        and(
          eq(sessions.id, id),
          gt(sessions.expiresAt, new Date())
        )
      )
      .limit(1)

    return result[0]?.user ?? null
  } catch (error) {
    console.error('Error getting current user:', error)
    return null
  }
}

// Require authenticated user or throw
export async function requireUser() {
  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')
  return user
}

// Sign out - delete session
export async function signOut() {
  try {
    const cookieStore = await cookies()
    const raw = cookieStore.get(COOKIE)?.value
    
    if (raw) {
      const [id] = raw.split('.')
      if (id) {
        await db.delete(sessions).where(eq(sessions.id, id))
      }
    }
    
    cookieStore.delete(COOKIE)
  } catch (error) {
    console.error('Error signing out:', error)
  }
}

// Generate Google OAuth URL
export function googleAuthUrl(state: string) {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID || '',
    redirect_uri: process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/api/auth/google/callback',
    response_type: 'code',
    scope: 'openid email profile',
    state,
    access_type: 'offline',
    prompt: 'select_account'
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`
}

// Create OAuth state and store in cookie
export async function createOAuthState() {
  const state = crypto.randomBytes(32).toString('hex')
  const cookieStore = await cookies()
  cookieStore.set(STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 600 // 10 minutes
  })
  return state
}

// Consume and verify OAuth state
export async function consumeOAuthState(state: string) {
  try {
    const cookieStore = await cookies()
    const valid = cookieStore.get(STATE_COOKIE)?.value === state
    cookieStore.delete(STATE_COOKIE)
    return valid
  } catch (error) {
    console.error('Error consuming OAuth state:', error)
    return false
  }
}

export { COOKIE }
