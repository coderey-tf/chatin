import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { token } = body

  const expectedToken = process.env.CHATIN_AUTH_TOKEN

  if (!expectedToken) {
    return NextResponse.json({ error: 'Auth not configured' }, { status: 500 })
  }

  if (token !== expectedToken) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
  }

  // Set cookie (7 days)
  const response = NextResponse.json({ success: true })
  response.cookies.set('chatin_token', token, {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    path: '/',
    maxAge: 7 * 24 * 60 * 60, // 7 days
  })

  return response
}
