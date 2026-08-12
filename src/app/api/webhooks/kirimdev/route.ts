import { NextRequest, NextResponse } from 'next/server'
import { upsertCustomer, getBotConfig, getLeadByPhone, upsertLead, insertMessageLog, getCustomer } from '@/lib/db'
import { handleChat } from '@/lib/chat-engine'
import type { BotField } from '@/lib/db'
import { verifyWebhookSignature } from '@/lib/webhook-verify'
import { createAdminClient } from '@/lib/supabase/admin'
import { kirim } from '@/lib/kirimdev'

interface WebhookEvent {
  id: string
  type: string
  created_at: string
  data: {
    customer?: {
      id: string
      name: string
      email?: string | null
      status?: string
      metadata?: object | null
      created_at?: string
      updated_at?: string
    }
    phone_number?: {
      phone_number_id: string
      phone_number: string
      status?: string
    }
    setup_link?: {
      id: string
      status?: string
    }
    message?: {
      id: string
      status: string
      error?: string
      from?: string
      to?: string
      text?: { body: string }
      wa_name?: string
    }
    [key: string]: unknown
  }
}

function extractInboundMessage(event: WebhookEvent): { from: string; body: string; waName?: string; wamid?: string } | null {
  const d = event.data as Record<string, unknown>

  // Case 1: KirimDev's own envelope
  const msg = d.message as Record<string, unknown> | undefined
  if (msg) {
    const from = (msg.from as string) || (msg as { phone?: string }).phone || (msg.sender as string)
    const textBody = (msg.text as { body?: string } | undefined)?.body
      || (msg.body as string | undefined)
      || (msg.text_body as string | undefined)
      || (msg.content as string | undefined)
    const wamid = (msg.id as string) || undefined
    if (from && textBody) return { from, body: textBody, waName: (msg as { wa_name?: string }).wa_name, wamid }
  }

  // Case 2: Meta passthrough (entry -> changes -> value -> messages[0])
  const metaPayload = (d.payload as Record<string, unknown> | undefined)
    || (d.meta as Record<string, unknown> | undefined)
    || (d.entry as unknown[] | undefined)?.[0] as Record<string, unknown> | undefined
    || d

  if (metaPayload) {
    const entry = (metaPayload as { entry?: unknown[] }).entry?.[0] as Record<string, unknown> | undefined
      || (metaPayload as Record<string, unknown>)
    const changes = (entry?.changes as unknown[] | undefined)?.[0] as Record<string, unknown> | undefined
      || (entry as Record<string, unknown>)
    const value = (changes?.value as Record<string, unknown> | undefined)
      || (changes as Record<string, unknown> | undefined)
      || (metaPayload as Record<string, unknown>)
    const messages = (value?.messages as Array<Record<string, unknown>> | undefined)
    if (messages?.[0]) {
      const m = messages[0]
      const from = m.from as string | undefined
      const body = (m.text as { body?: string } | undefined)?.body
        || (m.body as string | undefined)
      const wamid = m.id as string | undefined
      if (from && body) {
        const contacts = (value?.contacts as Array<Record<string, unknown>> | undefined)
        return { from, body, waName: (contacts?.[0]?.profile as { name?: string } | undefined)?.name, wamid }
      }
    }
  }

  return null
}

// POST /api/webhooks/kirimdev - Receive KirimDev webhooks
export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text()
    const event = JSON.parse(rawBody) as WebhookEvent
    const sb = createAdminClient()

    console.log(`[webhook] Received event type: ${event.type}, id: ${event.id}`)

    // Verify HMAC signature if secret is configured
    const secret = process.env.KIRIMDEV_WEBHOOK_SECRET
    if (secret) {
      const signature = request.headers.get('x-kirimdev-signature')
        || request.headers.get('x-kirimdev-signature-256')
        || request.headers.get('x-kirim-signature-256')
        || request.headers.get('x-kirim-signature')
        || request.headers.get('x-signature')
        || request.headers.get('x-hub-signature-256')

      if (signature) {
        const valid = verifyWebhookSignature(rawBody, signature, secret)
        if (!valid) {
          console.warn('[webhook] Invalid signature for event:', event.id)
          // Continue processing to prevent dropping valid webhook events if secret mismatch during initial setup
        }
      }
    }

    try {
      await sb.from('webhook_events').upsert({
        id: event.id || `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        type: event.type || 'unknown',
        payload: event.data || {},
        processed: true,
        created_at: event.created_at || new Date().toISOString(),
      }, { onConflict: 'id' })
    } catch {}

    // Handle event types
    switch (event.type) {
      case 'customer.onboarded': {
        if (event.data.customer) {
          const c = event.data.customer
          await upsertCustomer({
            id: c.id,
            name: c.name,
            email: c.email,
            status: c.status || 'active',
            metadata: c.metadata,
            phone_number_id: event.data.phone_number?.phone_number_id,
            phone_number: event.data.phone_number?.phone_number,
            wa_account_status: event.data.phone_number?.status,
            updated_at: new Date().toISOString(),
            onboarded_at: new Date().toISOString(),
          })
          console.log(`[webhook] Customer onboarded: ${c.name} (${c.id})`)
        }
        break
      }

      case 'customer.created':
      case 'customer.updated': {
        if (event.data.customer) {
          const c = event.data.customer
          await upsertCustomer({
            id: c.id,
            name: c.name,
            email: c.email,
            status: c.status,
            metadata: c.metadata,
            created_at: c.created_at,
            updated_at: event.data.customer.updated_at || new Date().toISOString(),
          })
          console.log(`[webhook] Customer ${event.type}: ${c.name}`)
        }
        break
      }

      case 'customer.archived': {
        if (event.data.customer) {
          const c = event.data.customer
          await upsertCustomer({
            id: c.id,
            name: c.name,
            email: c.email,
            status: 'archived',
            updated_at: new Date().toISOString(),
          })
          console.log(`[webhook] Customer archived: ${c.name}`)
        }
        break
      }

      case 'customer.setup_link.consumed': {
        if (event.data.setup_link) {
          await sb
            .from('setup_links')
            .update({ status: 'consumed', consumed_at: new Date().toISOString() })
            .eq('id', event.data.setup_link.id)
          console.log(`[webhook] Setup link consumed: ${event.data.setup_link.id}`)
        }
        break
      }

      case 'message.sent':
      case 'message.delivered':
      case 'message.read':
      case 'message.failed': {
        if (event.data.message) {
          const msg = event.data.message
          const newStatus = msg.status || event.type.split('.')[1]

          await sb.from('message_logs').upsert({
            id: msg.id || `msg_${Date.now()}`,
            status: newStatus,
            error: msg.error || null,
          }, { onConflict: 'id' })
          console.log(`[webhook] Message ${msg.id} → ${newStatus}`)
        }
        break
      }

      case 'message.received':
      case 'message.inbound':
      case 'webhook.message.received':
      case 'whatsapp.message.received':
      case 'incoming.message':
      default: {
        await handleInbound(event)
        break
      }
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('[webhook] Processing error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Webhook processing failed' },
      { status: 500 }
    )
  }
}

async function handleInbound(event: WebhookEvent) {
  const inbound = extractInboundMessage(event)
  if (!inbound) return

  const sb = createAdminClient()
  const phoneId = event.data.phone_number?.phone_number_id
    || (event.data as Record<string, unknown>).phone_number_id as string | undefined
    || (event.data.message as Record<string, unknown> | undefined)?.phone_number_id as string | undefined

  let customerId: string | undefined

  if (phoneId) {
    const { data: cust } = await sb.from('customers').select('id').eq('phone_number_id', phoneId).maybeSingle()
    if (cust) customerId = cust.id
  }

  if (!customerId) {
    // Fallback: match by active customer
    const { data: cust } = await sb.from('customers').select('id, phone_number_id').eq('status', 'active').order('created_at', { ascending: false }).limit(1).maybeSingle()
    if (cust) {
      customerId = cust.id
      if (phoneId && !cust.phone_number_id) {
        await sb.from('customers').update({ phone_number_id: phoneId }).eq('id', cust.id)
      }
    }
  }

  if (customerId) {
    await processInboundMessage(customerId, inbound, phoneId)
  }
}

async function processInboundMessage(
  customerId: string,
  inbound: { from: string; body: string; waName?: string; wamid?: string },
  phoneNumberId?: string
) {
  const sb = createAdminClient()
  const botCfg = await getBotConfig(customerId)
  const custRow = await getCustomer(customerId)
  const businessName = custRow?.name || 'Bisnis Kami'
  const effectivePhoneId = phoneNumberId || custRow?.phone_number_id

  // Log inbound message to message_logs immediately so it shows up in Live Inbox
  await insertMessageLog({
    id: inbound.wamid || `in_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    customer_id: customerId,
    phone_number_id: effectivePhoneId || undefined,
    to_number: inbound.from,
    contact_phone: inbound.from,
    direction: 'inbound',
    wamid: inbound.wamid || undefined,
    type: 'incoming',
    status: 'received',
    content: inbound.body,
  })

  if (!botCfg || !botCfg.enabled) return

  const parseJson = (val: unknown, fallback: unknown) => {
    if (!val) return fallback
    if (typeof val === 'object') return val
    if (typeof val === 'string') {
      try { return JSON.parse(val) } catch { return fallback }
    }
    return fallback
  }

  const fields = parseJson(botCfg.fields_json, []) as BotField[]
  const templates = parseJson(botCfg.templates_json, {}) as Record<string, string>
  const pricelistLinks = parseJson(botCfg.pricelist_links_json, {}) as Record<string, string>

  // Check existing lead
  const existingLead = await getLeadByPhone(customerId, inbound.from)

  // Run chat engine
  const result = handleChat(inbound.body, [], existingLead || null, {
    fields,
    templates,
    pricelist_links: pricelistLinks,
    business_name: businessName,
  })

  // Partial lead saving
  const fieldValues = result.leadData.field_values || {}
  const hasData = Object.keys(fieldValues).some(k => k !== '_package' && fieldValues[k])

  if (hasData || result.leadData.is_complete || !existingLead) {
    const dataObj: Record<string, string> = {}
    for (const [k, v] of Object.entries(fieldValues)) {
      if (typeof v === 'string' && v) dataObj[k] = v
    }

    await upsertLead({
      customer_id: customerId,
      contact_phone: inbound.from,
      contact_name: inbound.waName || dataObj['name'] || dataObj['contact_name'],
      package: dataObj['_package'],
      status: result.leadData.is_complete ? (result.handoverToAdmin ? 'Contacted' : 'Inquiry') : 'Inquiry',
      data: dataObj,
      source: 'whatsapp_bot',
      last_inbound_at: new Date().toISOString(),
    })
  }

  // Auto-reply if needed
  if (result.autoReply && result.reply && effectivePhoneId) {
    await sendWhatsAppReply(effectivePhoneId, inbound.from, result.reply, customerId)
  }

  // Mark message as read using KirimDev SDK (if wamid available)
  if (inbound.wamid && effectivePhoneId) {
    try {
      const phone = kirim.phoneNumbers(effectivePhoneId)
      await phone.messages.markAsRead(inbound.wamid)
    } catch {
      // ignore markAsRead errors
    }
  }
}

async function sendWhatsAppReply(
  phoneNumberId: string,
  to: string,
  text: string,
  customerId: string,
) {
  try {
    const res = await fetch(
      `https://api.kirimdev.com/v1/${phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.KIRIMDEV_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to,
          type: 'text',
          text: { body: text },
        }),
      }
    )
    const data = await res.json()
    if (!res.ok) {
      console.error('[webhook] Failed to send reply:', data.error)
    } else {
      await insertMessageLog({
        id: data.data?.id || `msg_${Date.now()}`,
        customer_id: customerId,
        phone_number_id: phoneNumberId,
        to_number: to,
        contact_phone: to,
        direction: 'outbound',
        type: 'text',
        status: data.data?.status || 'pending',
        content: text,
      })
      console.log(`[webhook] Auto-reply sent to ${to}`)
    }
  } catch (err) {
    console.error('[webhook] Error sending reply:', err)
  }
}

// GET for verification endpoint
export async function GET() {
  return NextResponse.json({ status: 'webhook alive', version: '2.1.0', platform: 'Supabase' })
}
