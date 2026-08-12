import { NextRequest, NextResponse } from 'next/server'
import { kirim } from '@/lib/kirimdev'
import { getCustomer, upsertCustomer } from '@/lib/db'

// GET /api/customers/[id] - Get customer detail
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // Fetch from KirimDev API or fallback
    let customerName = 'Customer'
    let customerEmail: string | null = null
    let customerStatus = 'active'
    let customerMetadata: object | null = null
    let customerCreatedAt = new Date().toISOString()
    let customerUpdatedAt = new Date().toISOString()

    try {
      const customer = await kirim.customers.retrieve(id)
      customerName = customer.name
      customerEmail = customer.email || null
      customerStatus = customer.status || 'active'
      customerMetadata = customer.metadata || null
      if (customer.created_at) customerCreatedAt = customer.created_at
      if (customer.updated_at) customerUpdatedAt = customer.updated_at
    } catch {
      // Ignore KirimDev retrieve error, fallback to local DB
    }

    // Sync to local DB
    const local = await getCustomer(id)
    await upsertCustomer({
      id: id,
      name: local?.name || customerName,
      email: local?.email || customerEmail,
      status: local?.status || customerStatus,
      metadata: local?.metadata ? (typeof local.metadata === 'string' ? JSON.parse(local.metadata) : local.metadata) : customerMetadata,
      phone_number: local?.phone_number || null,
      phone_number_id: local?.phone_number_id || null,
      created_at: local?.created_at || customerCreatedAt,
      updated_at: new Date().toISOString(),
    })

    return NextResponse.json({
      data: {
        id,
        name: local?.name || customerName,
        email: local?.email || customerEmail,
        status: local?.status || customerStatus,
        metadata: local?.metadata || customerMetadata,
        phone_number_id: local?.phone_number_id || null,
        phone_number: local?.phone_number || null,
        wa_account_status: local?.wa_account_status || 'connected',
        onboarded_at: local?.onboarded_at || null,
        created_at: local?.created_at || customerCreatedAt,
        updated_at: customerUpdatedAt,
      }
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get customer' },
      { status: 500 }
    )
  }
}

// PATCH /api/customers/[id] - Update customer details (e.g. phone_number)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { name, phone_number, phone_number_id } = body

    const existing = await getCustomer(id)
    if (!existing) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
    }

    await upsertCustomer({
      id,
      name: name || existing.name,
      email: existing.email,
      status: existing.status,
      phone_number: phone_number !== undefined ? phone_number : existing.phone_number,
      phone_number_id: phone_number_id !== undefined ? phone_number_id : existing.phone_number_id,
      updated_at: new Date().toISOString(),
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update customer' },
      { status: 500 }
    )
  }
}

// DELETE /api/customers/[id] - Archive customer
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    try {
      await kirim.customers.archive(id)
    } catch {
      // Ignore if KirimDev customer not found
    }

    // Update local DB
    const local = await getCustomer(id)
    if (local) {
      await upsertCustomer({
        id: local.id,
        name: local.name,
        email: local.email,
        status: 'archived',
        created_at: local.created_at,
        updated_at: new Date().toISOString(),
      })
    }

    return NextResponse.json({ data: { id, archived: true } })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to archive customer' },
      { status: 500 }
    )
  }
}
