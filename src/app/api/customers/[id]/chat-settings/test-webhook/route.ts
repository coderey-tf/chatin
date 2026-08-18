import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// POST /api/customers/[id]/chat-settings/test-webhook — test custom webhook connection (Admin only)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user || user.email !== 'coderey.wiki@gmail.com') {
      return NextResponse.json({ ok: false, error: 'Unauthorized — Superadmin access required' }, { status: 403 })
    }

    const { id } = await params
    const body = await request.json()
    const { url, secret, phone, text } = body

    if (!url) {
      return NextResponse.json({ ok: false, error: 'Webhook URL is required' }, { status: 400 })
    }

    const testPhone = (phone && typeof phone === 'string' && phone.trim()) ? phone.trim() : '6285156266871'
    const testText = (text && typeof text === 'string' && text.trim()) ? text.trim() : '50rb makan siang'

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Chatin-Secret': secret || '',
      },
      body: JSON.stringify({
        phone: testPhone,
        text: testText,
        type: 'text',
        contact_name: 'Chatin Test',
        customer_id: id,
        message_id: `test_${Date.now()}`,
        timestamp: new Date().toISOString(),
      }),
      signal: controller.signal,
    })

    clearTimeout(timeout)

    const data = await res.json().catch(() => null)
    return NextResponse.json({
      ok: res.ok,
      status: res.status,
      reply: data?.reply || null,
    })
  } catch (err) {
    const message = err instanceof Error
      ? (err.name === 'AbortError' ? 'Connection timeout (10s)' : err.message)
      : 'Connection failed'
    return NextResponse.json({ ok: false, error: message }, { status: 502 })
  }
}
