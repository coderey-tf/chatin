import { NextRequest, NextResponse } from 'next/server'
import { getDb, upsertCustomer } from '@/lib/db'
import { verifyWebhookSignature } from '@/lib/webhook-verify'

// Webhook events we care about
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
    }
  }
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

          // Try to find and update the message log
          const existing = db.prepare('SELECT * FROM message_logs WHERE id = ?').get(msg.id) as { id: string } | undefined
          if (existing) {
            db.prepare(`
              UPDATE message_logs SET status = ?, error = ? WHERE id = ?
            `).run(newStatus, msg.error || null, msg.id)
            console.log(`[webhook] Message ${msg.id} → ${newStatus}`)
          } else {
            // Insert new message log entry from webhook
            insertMessageLogFromWebhook(db, {
              id: msg.id,
              status: newStatus,
              error: msg.error,
            })
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
  } catch {
    // Ignore DB errors for webhook message logs
  }
}

// GET for verification endpoint (KirimDev may do GET to verify URL)
export async function GET() {
  return NextResponse.json({ status: 'webhook alive', version: '1.1.0' })
}
