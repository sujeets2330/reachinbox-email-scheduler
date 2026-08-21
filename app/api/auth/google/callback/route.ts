// // /app/api/auth/google/callback/route.ts
// import { NextResponse } from 'next/server'
// import { consumeOAuthState, createSession } from '@/lib/auth'

// export async function GET(request: Request) {
//   try {
//     const url = new URL(request.url)
//     const code = url.searchParams.get('code')
//     const state = url.searchParams.get('state')

//     // Validate state parameter
//     if (!code || !state) {
//       console.error('Missing code or state parameter')
//       return NextResponse.redirect(
//         new URL('/login?error=missing_params', url.origin)
//       )
//     }

//     // Verify OAuth state
//     const isValidState = await consumeOAuthState(state)
//     if (!isValidState) {
//       console.error('Invalid OAuth state')
//       return NextResponse.redirect(
//         new URL('/login?error=invalid_state', url.origin)
//       )
//     }

//     // Exchange code for tokens
//     const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${url.origin}/api/auth/google/callback`
//     const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
//       method: 'POST',
//       headers: {
//         'Content-Type': 'application/x-www-form-urlencoded',
//       },
//       body: new URLSearchParams({
//         code,
//         client_id: process.env.GOOGLE_CLIENT_ID || '',
//         client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
//         redirect_uri: redirectUri,
//         grant_type: 'authorization_code'
//       })
//     })

//     if (!tokenResponse.ok) {
//       const errorText = await tokenResponse.text()
//       console.error('Token exchange failed:', errorText)
//       return NextResponse.redirect(
//         new URL('/login?error=token_failed', url.origin)
//       )
//     }

//     const tokens = await tokenResponse.json() as { access_token?: string }
//     if (!tokens.access_token) {
//       console.error('No access token received')
//       return NextResponse.redirect(
//         new URL('/login?error=no_token', url.origin)
//       )
//     }

//     // Get user profile
//     const profileResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
//       headers: {
//         Authorization: `Bearer ${tokens.access_token}`
//       }
//     })

//     if (!profileResponse.ok) {
//       console.error('Failed to fetch user profile')
//       return NextResponse.redirect(
//         new URL('/login?error=profile_failed', url.origin)
//       )
//     }

//     const profile = await profileResponse.json() as {
//       sub: string
//       email: string
//       name?: string
//       picture?: string
//     }

//     // Create session
//     await createSession({
//       id: `google_${profile.sub}`,
//       email: profile.email,
//       name: profile.name || profile.email.split('@')[0],
//       avatarUrl: profile.picture || null
//     })

//     // Redirect to dashboard
//     return NextResponse.redirect(new URL('/', url.origin))

//   } catch (error) {
//     console.error('Google callback error:', error)
//     const url = new URL(request.url)
//     return NextResponse.redirect(
//       new URL('/login?error=callback_failed', url.origin)
//     )
//   }
// }
// /app/api/auth/google/callback/route.ts
import { NextResponse } from 'next/server'
import { consumeOAuthState, createSession } from '@/lib/auth'

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const code = url.searchParams.get('code')
    const state = url.searchParams.get('state')

    // FIX: Use the public app URL for all redirects
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

    // Validate state parameter
    if (!code || !state) {
      console.error('Missing code or state parameter')
      return NextResponse.redirect(new URL('/login?error=missing_params', appUrl))
    }

    // Verify OAuth state
    const isValidState = await consumeOAuthState(state)
    if (!isValidState) {
      console.error('Invalid OAuth state')
      return NextResponse.redirect(new URL('/login?error=invalid_state', appUrl))
    }

    // Exchange code for tokens
    const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${appUrl}/api/auth/google/callback`
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID || '',
        client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
        redirect_uri: redirectUri,
        grant_type: 'authorization_code'
      })
    })

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text()
      console.error('Token exchange failed:', errorText)
      return NextResponse.redirect(new URL('/login?error=token_failed', appUrl))
    }

    const tokens = await tokenResponse.json() as { access_token?: string }
    if (!tokens.access_token) {
      console.error('No access token received')
      return NextResponse.redirect(new URL('/login?error=no_token', appUrl))
    }

    // Get user profile
    const profileResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: {
        Authorization: `Bearer ${tokens.access_token}`
      }
    })

    if (!profileResponse.ok) {
      console.error('Failed to fetch user profile')
      return NextResponse.redirect(new URL('/login?error=profile_failed', appUrl))
    }

    const profile = await profileResponse.json() as {
      sub: string
      email: string
      name?: string
      picture?: string
    }

    // Create session
    await createSession({
      id: `google_${profile.sub}`,
      email: profile.email,
      name: profile.name || profile.email.split('@')[0],
      avatarUrl: profile.picture || null
    })

    // FIX: Redirect to dashboard using NEXT_PUBLIC_APP_URL
    return NextResponse.redirect(new URL('/', appUrl))

  } catch (error) {
    console.error('Google callback error:', error)
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    return NextResponse.redirect(new URL('/login?error=callback_failed', appUrl))
  }
}