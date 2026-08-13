import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { kirim, TEAM_ID } from '@/lib/kirimdev'
import { upsertCustomer, listCustomers as listLocalCustomers } from '@/lib/db'
import type { CustomerStatus } from '@kirimdev/sdk'

// GET /api/customers - List customers belonging to logged in user
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const status = searchParams.get('status') as CustomerStatus | null

    const customers = await listLocalCustomers(status || undefined, user.id)
    return NextResponse.json({ data: customers, source: 'local' })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to list customers' },
      { status: 500 }
    )
  }
}

// POST /api/customers - Create new customer (Enforce Single Tenant Limit per user)
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Single-Tenant check: max 1 customer per user account
    const existingCustomers = await listLocalCustomers(undefined, user.id)
    if (existingCustomers.length >= 1) {
      return NextResponse.json(
        { error: 'Akun Anda sudah terhubung dengan 1 Tenant WhatsApp (Single-Tenant Mode). Tidak dapat menambah tenant baru.' },
        { status: 400 }
      )
    }

    const body = await request.json()
    const { name, email, metadata } = body

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }

    let customerId: string | undefined
    try {
      const customer = await kirim.customers.create({
        name: name.trim(),
        email: email?.trim() || undefined,
        metadata: metadata || undefined,
        ...(TEAM_ID ? { team_id: TEAM_ID } : {}),
      })
      customerId = customer.id
    } catch {
      // Fallback if SDK fails
    }

    if (!customerId) {
      customerId = `cus_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
    }

    const newCustomer = await upsertCustomer({
      id: customerId,
      name: name.trim(),
      email: email?.trim() || undefined,
      status: 'pending',
      user_id: user.id,
    })

    return NextResponse.json({ data: newCustomer })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create customer' },
      { status: 500 }
    )
  }
}
