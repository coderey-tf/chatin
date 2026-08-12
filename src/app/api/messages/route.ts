import { NextRequest, NextResponse } from 'next/server'
import { kirim } from '@/lib/kirimdev'
import { getCustomer, insertMessageLog } from '@/lib/db'
import { createAdminClient } from '@/lib/supabase/admin'

// GET /api/messages - List message logs
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const customerId = searchParams.get('customer_id')
    const limit = parseInt(searchParams.get('limit') || '50')
    const sb = createAdminClient()

    let query = sb
      .from('message_logs')
      .select('*, customers(name)')
      .order('created_at', { ascending: false })
      .limit(limit)

    if (customerId) {
      query = query.eq('customer_id', customerId)
    }

    const { data: messagesData, error: msgError } = await query
    if (msgError) throw new Error(msgError.message)

    const messages = (messagesData || []).map((m) => ({
      ...m,
      customer_name: (m.customers as { name: string } | null)?.name || null,
    }))

    // Get stats
    const [{ count: total }, { count: sent }, { count: delivered }, { count: pending }, { count: failed }] = await Promise.all([
      sb.from('message_logs').select('*', { count: 'exact', head: true }),
      sb.from('message_logs').select('*', { count: 'exact', head: true }).eq('status', 'sent'),
      sb.from('message_logs').select('*', { count: 'exact', head: true }).eq('status', 'delivered'),
      sb.from('message_logs').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      sb.from('message_logs').select('*', { count: 'exact', head: true }).eq('status', 'failed'),
    ])

    return NextResponse.json({
      data: messages,
      stats: {
        total: total || 0,
        sent: sent || 0,
        delivered: delivered || 0,
        pending: pending || 0,
        failed: failed || 0,
      },
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to list messages' },
      { status: 500 }
    )
  }
}

// POST /api/messages - Send message on behalf of tenant
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { customer_id, to, type, text, template } = body

    if (!customer_id) {
      return NextResponse.json({ error: 'customer_id is required' }, { status: 400 })
    }
    if (!to) {
      return NextResponse.json({ error: 'to is required' }, { status: 400 })
    }

    const customer = await getCustomer(customer_id)
    if (!customer) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
    }

    if (customer.status !== 'active') {
      return NextResponse.json({ error: 'Customer is not active' }, { status: 400 })
    }

    if (!customer.phone_number_id) {
      return NextResponse.json({ error: 'Customer has no connected WhatsApp number' }, { status: 400 })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payload: any = {
      messaging_product: 'whatsapp',
      to,
      type: type || 'text',
    }

    if (type === 'template' && template) {
      payload.template = template
    } else {
      payload.text = text || { body: 'Test message from dashboard' }
    }

    const res = await fetch(
      `https://api.kirimdev.com/v1/${customer.phone_number_id}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.KIRIMDEV_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      }
    )

    const data = await res.json()

    if (!res.ok) {
      return NextResponse.json({ error: data.error || 'Failed to send message' }, { status: res.status })
    }

    await insertMessageLog({
      id: data.data?.id || `msg_${Date.now()}`,
      customer_id,
      phone_number_id: customer.phone_number_id,
      to_number: to,
      contact_phone: to,
      direction: 'outbound',
      type: type || 'text',
      status: data.data?.status || 'pending',
      content: typeof text === 'string' ? text : JSON.stringify(text || template),
    })

    return NextResponse.json({ data })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to send message' },
      { status: 500 }
    )
  }
}

// PUT /api/messages - Send using SDK directly
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { customer_id, to, text } = body

    if (!customer_id || !to || !text) {
      return NextResponse.json({ error: 'customer_id, to, and text required' }, { status: 400 })
    }

    const customer = await getCustomer(customer_id)
    if (!customer?.phone_number_id) {
      return NextResponse.json({ error: 'Customer not found or no WA connected' }, { status: 404 })
    }

    const phone = kirim.phoneNumbers(customer.phone_number_id)
    const result = await phone.messages.send({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: text },
    })

    await insertMessageLog({
      id: result.id,
      customer_id,
      phone_number_id: customer.phone_number_id,
      to_number: to,
      contact_phone: to,
      direction: 'outbound',
      type: 'text',
      status: result.status || 'pending',
      content: text,
    })

    return NextResponse.json({ data: result })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to send message' },
      { status: 500 }
    )
  }
}
