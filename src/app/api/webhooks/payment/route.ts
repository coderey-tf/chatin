import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { upsertSubscription } from '@/lib/db'

/**
 * Agnostic Payment Webhook Receiver
 * Handles incoming payment success webhooks from Midtrans, Xendit, Mayar, or manual simulation.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const sb = createAdminClient()

    // Extract common fields across gateways
    const invoiceId = body.invoice_id || body.order_id || body.external_id || body.id
    const customerId = body.customer_id || body.metadata?.customer_id
    const paymentStatus = body.status || body.transaction_status || body.event

    const isPaid = paymentStatus === 'paid' || paymentStatus === 'settlement' || paymentStatus === 'success' || paymentStatus === 'invoice.paid'

    if (!isPaid) {
      return NextResponse.json({ received: true, status: 'ignored_non_paid_event' })
    }

    let targetCustomerId = customerId
    let planTier = body.plan_tier || body.metadata?.plan_tier || 'starter'

    // If invoice_id provided, look up invoice record
    if (invoiceId) {
      const { data: inv } = await sb.from('invoices').select('*').eq('id', invoiceId).maybeSingle()
      if (inv) {
        targetCustomerId = inv.customer_id
        planTier = inv.plan_tier
        await sb.from('invoices').update({
          status: 'paid',
          paid_at: new Date().toISOString(),
          payment_method: body.payment_method || body.payment_type || inv.payment_method,
        }).eq('id', invoiceId)
      }
    }

    if (!targetCustomerId) {
      return NextResponse.json({ error: 'Customer ID not found in payload or invoice' }, { status: 400 })
    }

    // Extend subscription by +30 days from now
    const now = new Date()
    const currentEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)

    await upsertSubscription({
      customer_id: targetCustomerId,
      plan_tier: planTier,
      status: 'active',
      current_period_start: now.toISOString(),
      current_period_end: currentEnd.toISOString(),
    })

    console.log(`[Payment Webhook] Subscription extended +30d for customer ${targetCustomerId} (${planTier})`)

    return NextResponse.json({ success: true, message: 'Subscription renewed successfully' })
  } catch (error) {
    console.error('[Payment Webhook] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Payment webhook processing failed' },
      { status: 500 }
    )
  }
}
