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

    // Fetch from KirimDev API
    const customer = await kirim.customers.retrieve(id)

    // Sync to local DB
    await upsertCustomer({
      id: customer.id,
      name: customer.name,
      email: customer.email || null,
      status: customer.status || 'pending',
      metadata: customer.metadata,
      created_at: customer.created_at,
      updated_at: customer.updated_at,
    })

    // Get local data (may have phone_number_id from webhook)
    const local = await getCustomer(id)

    return NextResponse.json({
      data: {
        ...customer,
        phone_number_id: local?.phone_number_id || null,
        phone_number: local?.phone_number || null,
        wa_account_status: local?.wa_account_status || null,
        onboarded_at: local?.onboarded_at || null,
      }
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get customer' },
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

    await kirim.customers.archive(id)

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
