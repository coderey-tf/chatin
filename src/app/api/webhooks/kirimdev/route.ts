import { NextRequest, NextResponse } from 'next/server'
import { getDb, upsertCustomer, getBotConfig, getLeadByPhone, upsertLead, insertMessageLog } from '@/lib/db'
import { handleChat } from '@/lib/chat-engine'
import type { BotField } from '@/lib/db'
import { verifyWebhookSignature } from '@/lib/webhook-verify'

// Webhook events
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
      // For inbound (Meta passthrough):
      from?: string           // e.g. "628123456789"
      text?: { body: string } // the message content
      wa_name?: string        // display name from WA
    }
    // KirimDev forward: Meta passthrough body may have different shape
    // check both possibilities
    [key: string]: unknown
  }
}

// ─── Helpers ───

/**
 * Try to extract inbound message info from potentially nested payloads.
 * KirimDev may forward Meta Cloud API's message.received payload in data.
 */
function extractInboundMessage(event: WebhookEvent): { from: string; body: string; waName?: string } | null {
  const d = event.data as Record<string, unknown>

  // Case 1: KirimDev's own envelope: data.message.from / data.message.text
  const msg = d.message as Record<string, unknown> | undefined
  if (msg) {
    const from = (msg.from as string) || (msg as { phone?: string }).phone
    const textBody = (msg.text as { body?: string } | undefined)?.body
      || (msg.body as string | undefined)
      || (msg.text_body as string | undefined)
    if (from && textBody) return { from, body: textBody, waName: (msg as { wa_name?: string }).wa_name }
  }

  // Case 2: Meta passthrough (may be in d.entry or d.changes or d.payload)
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
      if (from && body) {
        const contacts = (value?.contacts as Array<Record<string, unknown>> | undefined)
        return { from, body, waName: (contacts?.[0]?.profile as { name?: string } | undefined)?.name }
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

    // Verify HMAC signature if KIRIMDEV_WEBHOOK_SECRET is set
    const secret = process.env.KIRIMDEV_WEBHOOK_SECRET
    if (secret) {
      const signature = request.headers.get('x-kirim-signature-256') || request.headers.get('x-kirim-signature')
      if (signature) {
        const valid = verifyWebhookSignature(rawBody, signature, secret)
        if (!valid) {
          console.error('[webhook] Invalid signature for event:', event.id)
          return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
        }
      }
    }

    const db = getDb()

    // Save event to DB for audit
    try {
      db.prepare(`
        INSERT INTO webhook_events (id, type, payload, processed, created_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(id) DO NOTHING
      `).run(event.id, event.type, rawBody, 1, event.created_at)
    } catch {
      // Table might not exist yet, ignore
    }

    // Handle different event types
    switch (event.type) {
      case 'customer.onboarded': {
        if (event.data.customer) {
          const c = event.data.customer
          upsertCustomer({
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
          upsertCustomer({
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
          upsertCustomer({
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
          db.prepare(`
            UPDATE setup_links SET status = 'consumed', consumed_at = ?
            WHERE id = ?
          `).run(new Date().toISOString(), event.data.setup_link.id)
          console.log(`[webhook] Setup link consumed: ${event.data.setup_link.id}`)
        }
        break
      }

      case 'customer.setup_link.created':
        break

      // Message status updates (sent, delivered, read, failed)
      case 'message.sent':
      case 'message.delivered':
      case 'message.read':
      case 'message.failed': {
        if (event.data.message) {
          const msg = event.data.message
          const newStatus = msg.status || event.type.split('.')[1]

          const existing = db.prepare('SELECT * FROM message_logs WHERE id = ?').get(msg.id) as { id: string } | undefined
          if (existing) {
            db.prepare(`UPDATE message_logs SET status = ?, error = ? WHERE id = ?`).run(newStatus, msg.error || null, msg.id)
            console.log(`[webhook] Message ${msg.id} → ${newStatus}`)
          } else {
            insertMessageLogFromWebhook(db, { id: msg.id, status: newStatus, error: msg.error })
          }
        }
        break
      }

      // ── INBOUND MESSAGE (the important one) ──
      // Try to handle any message.received / inbound event
      case 'message.received':
      case 'message.inbound':
      case 'webhook.message.received':
      case 'whatsapp.message.received':
      case 'incoming.message':
        await handleInbound(event)
        break

      default: {
        // Fallback: if payload looks like an inbound message, try to extract it
        const inbound = extractInboundMessage(event)
        if (inbound) {
          // Find customer by phone_number_id or fall back to generic
          const phoneId = event.data.phone_number?.phone_number_id
            || (event.data as Record<string, unknown>).phone_number_id as string | undefined

          if (phoneId) {
            const cust = db.prepare('SELECT * FROM customers WHERE phone_number_id = ?').get(phoneId) as { id: string } | undefined
            if (cust) {
              await processInboundMessage(cust.id, inbound)
            }
          }
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

// ─── Inbound message handler ───

async function handleInbound(event: WebhookEvent) {
  const inbound = extractInboundMessage(event)
  if (!inbound) return

  // Find customer
  const db = getDb()
  const phoneId = event.data.phone_number?.phone_number_id
    || (event.data as Record<string, unknown>).phone_number_id as string | undefined

  let customerId: string | undefined
  if (phoneId) {
    const cust = db.prepare('SELECT * FROM customers WHERE phone_number_id = ?').get(phoneId) as { id: string } | undefined
    if (cust) customerId = cust.id
  }

  // Fallback: use first available customer with bot enabled (dev/demo mode)
  if (!customerId) {
    const cust = db.prepare('SELECT * FROM customers WHERE status = ? LIMIT 1').get('active') as { id: string } | undefined
    if (cust) customerId = cust.id
  }

  if (customerId) {
    await processInboundMessage(customerId, inbound)
  }
}

async function processInboundMessage(
  customerId: string,
  inbound: { from: string; body: string; waName?: string },
) {
  const db = getDb()

  // Check bot config
  const botCfg = getBotConfig(customerId)
  if (!botCfg || !botCfg.enabled) return

  // Parse bot config
  let fields: BotField[] = []
  let templates: Record<string, string> = {}
  let pricelistLinks: Record<string, string> = {}
  try { fields = JSON.parse(botCfg.fields_json || '[]') } catch { }
  try { templates = JSON.parse(botCfg.templates_json || '{}') } catch { }
  try { pricelistLinks = JSON.parse(botCfg.pricelist_links_json || '{}') } catch { }

  const customerIdStr = customerId

  // Fix: need to fetch customer name inside
  const custRow = db.prepare('SELECT * FROM customers WHERE id = ?').get(customerIdStr) as { name: string } | undefined
  const businessName = custRow?.name || 'Bisnis Kami'

  // Check existing lead
  const existingLead = getLeadByPhone(customerId, inbound.from)

  // For inbound webhook, we don't have chat history stored in this DB.
  // So we accumulate from the incoming message + existing DB data.
  const result = handleChat(inbound.body, [], existingLead || null, {
    fields,
    templates,
    pricelist_links: pricelistLinks,
    business_name: businessName,
  })

  // Save lead if complete
  if (result.leadSaved && result.leadData.is_complete) {
    const data: Record<string, string> = {}
    for (const [k, v] of Object.entries(result.leadData.field_values)) {
      if (typeof v === 'string' && v) data[k] = v
    }
    upsertLead({
      customer_id: customerId,
      contact_phone: inbound.from,
      contact_name: data['name'] || data['contact_name'],
      package: data['_package'],
      status: result.handoverToAdmin ? 'Contacted' : 'Inquiry',
      data,
      source: 'whatsapp_bot',
    })
  }

  // Auto-reply if needed
  if (result.autoReply && result.reply) {
    const phoneNumberId = db.prepare('SELECT phone_number_id FROM customers WHERE id = ?').get(customerId) as { phone_number_id: string } | undefined
    if (phoneNumberId?.phone_number_id) {
      await sendWhatsAppReply(phoneNumberId.phone_number_id, inbound.from, result.reply, customerId)
    }
  }

  // Log inbound message
  insertMessageLog({
    id: `in_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    customer_id: customerId,
    to_number: inbound.from,
    type: 'incoming',
    status: 'received',
    content: inbound.body,
  })
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
      insertMessageLog({
        id: data.data?.id || `msg_${Date.now()}`,
        customer_id: customerId,
        phone_number_id: phoneNumberId,
        to_number: to,
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

function insertMessageLogFromWebhook(
  db: ReturnType<typeof getDb>,
  data: { id: string; status: string; error?: string }
) {
  try {
    db.prepare(`
      INSERT INTO message_logs (id, status, error, created_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET status = excluded.status, error = excluded.error
    `).run(data.id, data.status, data.error || null, new Date().toISOString())
  } catch { }
}

// GET for verification endpoint
export async function GET() {
  return NextResponse.json({ status: 'webhook alive', version: '1.2.0' })
}
