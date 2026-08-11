import { NextRequest, NextResponse } from 'next/server'
import { kirim, TEAM_ID } from '@/lib/kirimdev'
import { upsertCustomer, listCustomers as listLocalCustomers } from '@/lib/db'
import type { CustomerStatus } from '@kirimdev/sdk'

// GET /api/customers - List all customers
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const status = searchParams.get('status') as CustomerStatus | null

    // Try to get from KirimDev API first, fallback to local DB
    try {
      const params: { status?: CustomerStatus } = {}
      if (status) params.status = status

      const response = await kirim.customers.list(params)

      // Sync to local DB
      const customers = Array.isArray(response) ? response : ((response as { data?: unknown[] }).data || [])
      for (const c of customers as Array<{
        id: string
        name: string
        email?: string
        status?: CustomerStatus
        metadata?: object
        created_at?: string
        updated_at?: string
      }>) {
        upsertCustomer({
          id: c.id,
          name: c.name,
          email: c.email,
          status: c.status,
          metadata: c.metadata,
          created_at: c.created_at,
          updated_at: c.updated_at,
        })
      }

      return NextResponse.json({ data: customers })
    } catch {
      // Fallback to local DB
      const customers = listLocalCustomers(status || undefined)
      return NextResponse.json({ data: customers, source: 'local' })
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to list customers' },
      { status: 500 }
    )
  }
}

// POST /api/customers - Create new customer
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, email, metadata } = body

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }

    const customer = await kirim.customers.create({
      name: name.trim(),
      email: email?.trim() || undefined,
      metadata: metadata || undefined,
      ...(TEAM_ID ? { team_id: TEAM_ID } : {}),
    })

    // Save to local DB
    upsertCustomer({
      id: customer.id,
      name: customer.name,
      email: customer.email || null,
      status: customer.status || 'pending',
      metadata: customer.metadata,
      created_at: customer.created_at,
      updated_at: customer.updated_at,
    })

    return NextResponse.json({ data: customer }, { status: 201 })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create customer' },
      { status: 500 }
    )
  }
}
