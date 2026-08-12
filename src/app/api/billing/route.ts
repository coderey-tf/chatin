import { NextRequest, NextResponse } from 'next/server'
import { getSubscription, upsertSubscription, listInvoices, createInvoice, getCustomer } from '@/lib/db'

// GET /api/billing?customer_id=cus_xxx — get subscription & invoices
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const customerId = searchParams.get('customer_id')

    if (!customerId) {
      return NextResponse.json({ error: 'customer_id is required' }, { status: 400 })
    }

    const customer = await getCustomer(customerId)
    if (!customer) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
    }

    let sub = await getSubscription(customerId)
    
    // Auto-create default trial subscription if none exists
    if (!sub) {
      await upsertSubscription({
        customer_id: customerId,
        plan_tier: 'trial',
        status: 'trialing',
        current_period_start: customer.created_at || new Date().toISOString(),
        current_period_end: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        max_waba_accounts: 1,
        max_leads_per_month: 500,
      })
      sub = await getSubscription(customerId)
    }

    const invoices = await listInvoices(customerId)

    return NextResponse.json({
      data: {
        subscription: sub,
        invoices,
        customer,
      },
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch billing info' },
      { status: 500 }
    )
  }
}

// POST /api/billing — create checkout invoice or update plan
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { customer_id: customerId, plan_tier: planTier, action } = body

    if (!customerId || !planTier) {
      return NextResponse.json({ error: 'customer_id and plan_tier required' }, { status: 400 })
    }

    const PLAN_PRICES: Record<string, number> = {
      starter: 75000,
      pro: 149000,
      enterprise: 249000,
    }

    const price = PLAN_PRICES[planTier] || 75000
    const sub = await getSubscription(customerId)

    // Action: Direct change / admin override (dev/demo mode)
    if (action === 'admin_activate') {
      const now = new Date()
      const end = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
      await upsertSubscription({
        customer_id: customerId,
        plan_tier: planTier,
        status: 'active',
        current_period_start: now.toISOString(),
        current_period_end: end.toISOString(),
      })
      return NextResponse.json({ success: true, message: `Plan upgraded to ${planTier}` })
    }

    // Default: Create Pending Invoice (Agnostic for payment gateway)
    const invoice = await createInvoice({
      customer_id: customerId,
      subscription_id: sub?.id,
      plan_tier: planTier,
      amount: price,
      payment_method: 'qris',
      payment_url: undefined, // Will be filled when payment gateway SDK is connected
    })

    return NextResponse.json({
      data: invoice,
      message: 'Invoice created successfully. Connect your preferred payment gateway API key to process payments.',
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create checkout' },
      { status: 500 }
    )
  }
}
