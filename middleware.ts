import { NextRequest, NextResponse } from 'next/server'

const AUTH_TOKEN = process.env.CHATIN_AUTH_TOKEN

// Public routes that don't require auth
const PUBLIC_PATHS = ['/api/webhooks', '/api/auth', '/api/chat', '/onboarded', '/onboard-failed', '/favicon.ico', '/_next']

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some(p => pathname === p || pathname.startsWith(p + '/'))
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Root landing page is public
  if (pathname === '/') return NextResponse.next()

  // Skip auth for public routes
  if (isPublic(pathname)) {
    return NextResponse.next()
  }

  // Skip if no token configured (dev mode without env)
  if (!AUTH_TOKEN) {
    return NextResponse.next()
  }

  // Check Authorization header (for API)
  const authHeader = request.headers.get('authorization')
  if (authHeader === `Bearer ${AUTH_TOKEN}`) {
    return NextResponse.next()
  }

  // Check cookie for browser sessions
  const cookieToken = request.cookies.get('chatin_token')?.value
  if (cookieToken === AUTH_TOKEN) {
    return NextResponse.next()
  }

  // For /dashboard/* routes, redirect to login page
  if (pathname.startsWith('/dashboard') || pathname.startsWith('/login')) {
    if (pathname === '/login') return NextResponse.next()
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/login'
    loginUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // For API routes, return 401
  return NextResponse.json(
    { error: 'Unauthorized. Send Bearer token or login first.' },
    { status: 401 }
  )
}

export const config = {
  matcher: ['/dashboard/:path*', '/api/:path*', '/login'],
}
