import { NextRequest, NextResponse } from 'next/server'
import { kirim } from '@/lib/kirimdev'
import { getCustomer, insertMessageLog, getDb } from '@/lib/db'

// GET /api/messages - List message logs
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const customerId = searchParams.get('customer_id')
    const limit = parseInt(searchParams.get('limit') || '50')
    const db = getDb()

    let query = 'SELECT ml.*, c.name as customer_name FROM message_logs ml LEFT JOIN customers c ON ml.customer_id = c.id'
    const params: (string | number)[] = []

    if (customerId) {
      query += ' WHERE ml.customer_id = ?'
      params.push(customerId)
    }

    query += ' ORDER BY ml.created_at DESC LIMIT ?'
    params.push(limit)

    const messages = db.prepare(query).all(...params)

    // Get stats
    const stats = db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) as sent,
        SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) as delivered,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
      FROM message_logs
    `).get() as { total: number; sent: number; delivered: number; pending: number; failed: number } | undefined

    return NextResponse.json({
      data: messages,
      stats: stats || { total: 0, sent: 0, delivered: 0, pending: 0, failed: 0 },
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

    // Get customer's phone_number_id from local DB
    const customer = getCustomer(customer_id)
    if (!customer) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
    }

    if (customer.status !== 'active') {
      return NextResponse.json({ error: 'Customer is not active' }, { status: 400 })
    }

    if (!customer.phone_number_id) {
      return NextResponse.json({ error: 'Customer has no connected WhatsApp number' }, { status: 400 })
    }

    // Build message payload
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

    // Send via KirimDev
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

    // Log message
    insertMessageLog({
      id: data.data?.id || `msg_${Date.now()}`,
      customer_id,
      phone_number_id: customer.phone_number_id,
      to_number: to,
      type: type || 'text',
      status: data.data?.status || 'pending',
      content: JSON.stringify(text || template),
    })

    return NextResponse.json({ data })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to send message' },
      { status: 500 }
    )
  }
}

// Also support sending with SDK directly
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { customer_id, to, text } = body

    if (!customer_id || !to || !text) {
      return NextResponse.json({ error: 'customer_id, to, and text required' }, { status: 400 })
    }

    const customer = getCustomer(customer_id)
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

    insertMessageLog({
      id: result.id,
      customer_id,
      phone_number_id: customer.phone_number_id,
      to_number: to,
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
