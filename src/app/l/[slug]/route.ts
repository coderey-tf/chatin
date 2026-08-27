import { NextRequest, NextResponse } from 'next/server'
import { resolveShortlink } from '@/lib/db'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params
    if (!slug) {
      return NextResponse.redirect(new URL('/', request.url), 307)
    }

    const destinationUrl = await resolveShortlink(slug)

    if (destinationUrl) {
      const validUrl = /^https?:\/\//i.test(destinationUrl)
        ? destinationUrl
        : `https://${destinationUrl}`

      return NextResponse.redirect(validUrl, 307)
    }

    // Fallback if shortlink not found
    return NextResponse.redirect(new URL('/', request.url), 307)
  } catch (error) {
    console.error('[shortlink redirect error]', error)
    return NextResponse.redirect(new URL('/', request.url), 307)
  }
}
