import { NextRequest, NextResponse } from 'next/server'
import { upsertCustomer, getBotConfig, getLeadByPhone, upsertLead, insertMessageLog, getCustomer } from '@/lib/db'
import { handleChat } from '@/lib/chat-engine'
import type { BotField } from '@/lib/db'
import { verifyWebhookSignature } from '@/lib/webhook-verify'
import { createAdminClient } from '@/lib/supabase/admin'
import { kirim } from '@/lib/kirimdev'

interface StandardWebhookEvent {
  id: string
  type: string
  created_at: string
  data: Record<string, unknown>
}

function parseWebhookPayload(rawBody: string): StandardWebhookEvent {
  let parsed: Record<string, unknown> = {}
  try {
    const json = JSON.parse(rawBody)
    if (Array.isArray(json) && json.length > 0) {
      parsed = json[0] as Record<string, unknown>
    } else if (typeof json === 'object' && json !== null) {
      parsed = json as Record<string, unknown>
    }
  } catch {}

  const id = (parsed.id as string)
    || (parsed.event_id as string)
    || (parsed.message_id as string)
    || `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`

  const type = (parsed.type as string)
    || (parsed.event as string)
    || (parsed.event_type as string)
    || (parsed.name as string)
    || (parsed.topic as string)
    || (parsed.action as string)
    || (parsed.message ? 'message.received' : 'unknown')

  const data = (typeof parsed.data === 'object' && parsed.data !== null) ? (parsed.data as Record<string, unknown>)
    : (typeof parsed.payload === 'object' && parsed.payload !== null) ? (parsed.payload as Record<string, unknown>)
    : (typeof parsed.body === 'object' && parsed.body !== null) ? (parsed.body as Record<string, unknown>)
    : parsed

  return {
    id,
    type,
    created_at: (parsed.created_at as string) || new Date().toISOString(),
    data,
  }
}

function extractInboundMessage(event: StandardWebhookEvent): { from: string; body: string; waName?: string; wamid?: string } | null {
  const d = event.data

  // Case 1: KirimDev message envelope (data.message or root message)
  const msg = (d.message as Record<string, unknown> | undefined) || (d as Record<string, unknown>)
  if (msg) {
    const from = (msg.from as string)
      || (msg.phone as string)
      || (msg.sender as string)
      || (msg.contact_phone as string)
      || (msg.to as string)

    const textBody = (msg.text as { body?: string } | undefined)?.body
      || (msg.body as string | undefined)
      || (msg.text_body as string | undefined)
      || (msg.content as string | undefined)
      || (msg.message as string | undefined)

    const wamid = (msg.id as string) || (msg.wamid as string) || undefined
    const waName = (msg.wa_name as string) || (msg.name as string) || (msg.sender_name as string) || undefined

    if (from && textBody && typeof textBody === 'string') {
      return { from, body: textBody, waName, wamid }
    }
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
    const event = parseWebhookPayload(rawBody)
    const sb = createAdminClient()

    console.log(`[webhook] Parsed event type: "${event.type}", id: "${event.id}"`)

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
          console.warn('[webhook] Signature warning for event:', event.id)
        }
      }
    }

    try {
      await sb.from('webhook_events').upsert({
        id: event.id,
        type: event.type,
        payload: event.data,
        processed: true,
        created_at: event.created_at,
      }, { onConflict: 'id' })
    } catch {}

    // Process inbound message for any event (or message-related type)
    const inbound = extractInboundMessage(event)
    if (inbound) {
      await handleInboundMessagePayload(event, inbound)
    }

    // Handle customer / setup events
    switch (event.type) {
      case 'customer.onboarded': {
        const c = (event.data.customer as Record<string, unknown> | undefined) || event.data
        if (c && c.id) {
          const phoneNumberObj = (event.data.phone_number as Record<string, unknown> | undefined)
          await upsertCustomer({
            id: c.id as string,
            name: (c.name as string) || 'Customer',
            email: (c.email as string) || null,
            status: (c.status as string) || 'active',
            phone_number_id: (phoneNumberObj?.phone_number_id as string) || undefined,
            phone_number: (phoneNumberObj?.phone_number as string) || undefined,
            wa_account_status: (phoneNumberObj?.status as string) || 'connected',
            updated_at: new Date().toISOString(),
            onboarded_at: new Date().toISOString(),
          })
          console.log(`[webhook] Customer onboarded: ${c.name} (${c.id})`)
        }
        break
      }

      case 'customer.created':
      case 'customer.updated': {
        const c = (event.data.customer as Record<string, unknown> | undefined) || event.data
        if (c && c.id) {
          await upsertCustomer({
            id: c.id as string,
            name: (c.name as string) || 'Customer',
            email: (c.email as string) || null,
            status: (c.status as string) || 'active',
            updated_at: new Date().toISOString(),
          })
        }
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

async function handleInboundMessagePayload(
  event: StandardWebhookEvent,
  inbound: { from: string; body: string; waName?: string; wamid?: string }
) {
  const sb = createAdminClient()
  const phoneId = (event.data.phone_number as Record<string, unknown> | undefined)?.phone_number_id as string | undefined
    || (event.data.message as Record<string, unknown> | undefined)?.phone_number_id as string | undefined

  let customerId: string | undefined

  if (phoneId) {
    const { data: cust } = await sb.from('customers').select('id').eq('phone_number_id', phoneId).maybeSingle()
    if (cust) customerId = cust.id
  }

  if (!customerId) {
    // Fallback 1: match active customer in Supabase
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
  const botCfg = await getBotConfig(customerId)
  const custRow = await getCustomer(customerId)
  const businessName = custRow?.name || 'Bisnis Kami'
  const effectivePhoneId = phoneNumberId || custRow?.phone_number_id

  // 1. Log inbound message immediately to message_logs
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

  console.log(`[webhook] Inbound message logged for contact ${inbound.from}: "${inbound.body}"`)

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

  // 2. Check existing lead
  const existingLead = await getLeadByPhone(customerId, inbound.from)

  // 3. Run chat engine
  const result = handleChat(inbound.body, [], existingLead || null, {
    fields,
    templates,
    pricelist_links: pricelistLinks,
    business_name: businessName,
  })

  // 4. Save/update lead
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

  // 5. Auto-reply if enabled
  if (result.autoReply && result.reply && effectivePhoneId) {
    await sendWhatsAppReply(effectivePhoneId, inbound.from, result.reply, customerId)
  }

  // 6. Mark message as read via KirimDev SDK
  if (inbound.wamid && effectivePhoneId) {
    try {
      const phone = kirim.phoneNumbers(effectivePhoneId)
      await phone.messages.markAsRead(inbound.wamid)
    } catch {}
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
  return NextResponse.json({ status: 'webhook alive', version: '2.2.0', platform: 'Supabase' })
}
