import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'

const PUBLIC_PATHS = [
  '/api/webhooks',
  '/api/chat',
  '/onboarded',
  '/onboard-failed',
  '/onboarding',
  '/login',
  '/register',
  '/auth/callback',
  '/favicon.ico',
  '/_next',
]

function isPublic(pathname: string): boolean {
  if (pathname === '/') return true
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'))
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  let response = NextResponse.next({ request })

  if (isPublic(pathname)) {
    return response
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://horuzytvjcysjstdglsm.supabase.co'
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhvcnV6eXR2amN5c2pzdGRnbHNtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUzMDAwMTQsImV4cCI6MjEwMDg3NjAxNH0.YACr1NlzxIHgxpmttGp7VeBzcLYvFtJbw-rWQf_1KNI'

  const supabase = createServerClient(
    url,
    key,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options?: CookieOptions }>) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value)
            response.cookies.set(name, value, options)
          })
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user && (pathname.startsWith('/dashboard') || pathname.startsWith('/api/'))) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized. Please login.' }, { status: 401 })
    }
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/login'
    loginUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(loginUrl)
  }

  return response
}

export const config = {
  matcher: ['/dashboard/:path*', '/api/:path*', '/login', '/register'],
}
