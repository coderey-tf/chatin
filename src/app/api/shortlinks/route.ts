import { NextRequest, NextResponse } from 'next/server'
import { createShortlink } from '@/lib/db'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { customer_id, destination_url, custom_slug } = body

    if (!destination_url || typeof destination_url !== 'string' || !destination_url.trim()) {
      return NextResponse.json(
        { error: 'URL tujuan wajib diisi.' },
        { status: 400 }
      )
    }

    const cleanUrl = destination_url.trim()
    const validUrl = /^https?:\/\//i.test(cleanUrl) ? cleanUrl : `https://${cleanUrl}`

    const result = await createShortlink({
      customer_id,
      destination_url: validUrl,
      custom_slug: custom_slug ? String(custom_slug).trim() : undefined,
    })

    return NextResponse.json({
      ok: true,
      data: result,
    })
  } catch (error) {
    console.error('[POST /api/shortlinks error]', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Gagal membuat shortlink' },
      { status: 500 }
    )
  }
}
