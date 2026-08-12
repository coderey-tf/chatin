import { NextRequest, NextResponse } from 'next/server'
import { listLeads, upsertLead, parseLead } from '@/lib/db'

// GET /api/customers/[id]/leads — list all leads (with parsed data)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const rows = listLeads(id)
    const leads = rows.map(parseLead)
    return NextResponse.json({ data: leads, count: leads.length })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed' }, { status: 500 })
  }
}

// POST /api/customers/[id]/leads — create/update lead (flexible fields)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()

    if (!body.contact_phone) {
      return NextResponse.json({ error: 'contact_phone is required' }, { status: 400 })
    }

    const allowedDataKeys = ['name', 'contact_name', 'event_date', 'event_type', 'venue_type', 'location', 'package', 'notes', 'item_type', 'rental_date', 'service', 'visit_date', 'item_wanted', 'inquiry', 'date', 'budget', '_package']
    const data: Record<string, string> = {}

    // explicit data field
    if (body.data && typeof body.data === 'object') {
      for (const [k, v] of Object.entries(body.data)) {
        if (typeof v === 'string' && v) data[k] = v
      }
    }
    // also pick top-level known fields
    for (const key of allowedDataKeys) {
      if (body[key] && typeof body[key] === 'string') data[key] = body[key]
    }

    const leadId = upsertLead({
      customer_id: id,
      contact_phone: body.contact_phone,
      contact_name: body.contact_name || body.name,
      package: body.package || body._package,
      status: body.status,
      data,
      source: body.source,
    })

    return NextResponse.json({ data: { id: leadId } })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed' }, { status: 500 })
  }
}
