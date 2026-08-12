import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const redirect = requestUrl.searchParams.get('redirect') || '/dashboard'

  // Support reverse proxy headers (e.g. Nginx / VPS / Cloudflare)
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || requestUrl.host
  const protocol = request.headers.get('x-forwarded-proto') || (requestUrl.protocol.endsWith(':') ? requestUrl.protocol.slice(0, -1) : requestUrl.protocol)
  const origin = `${protocol}://${host}`

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      const targetUrl = redirect.startsWith('http') ? redirect : `${origin}${redirect.startsWith('/') ? redirect : `/${redirect}`}`
      return NextResponse.redirect(targetUrl)
    }
  }

  return NextResponse.redirect(`${origin}/login?error=Could%20not%20authenticate`)
}
