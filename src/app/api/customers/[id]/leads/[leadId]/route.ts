import { NextRequest, NextResponse } from 'next/server'
import { updateLead, deleteLead } from '@/lib/db'

// PATCH /api/customers/[id]/leads/[leadId] — update lead status or data
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; leadId: string }> }
) {
  try {
    const { id: customerId, leadId } = await params
    const body = await request.json()

    await updateLead(leadId, customerId, {
      status: body.status,
      contact_name: body.contact_name,
      package: body.package,
      data_json: body.data,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update lead' },
      { status: 500 }
    )
  }
}

// DELETE /api/customers/[id]/leads/[leadId] — delete lead
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; leadId: string }> }
) {
  try {
    const { id: customerId, leadId } = await params
    await deleteLead(leadId, customerId)
    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete lead' },
      { status: 500 }
    )
  }
}
