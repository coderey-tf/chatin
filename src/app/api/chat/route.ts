import { NextRequest, NextResponse } from 'next/server'
import { getCustomer, getBotConfig, getLeadByPhone, upsertLead, insertMessageLog } from '@/lib/db'
import { handleChat, type ChatEngineResult } from '@/lib/chat-engine'
import type { BotField } from '@/lib/db'

/**
 * POST /api/chat — Generic chat engine endpoint
 *
 * Same interface as Sebelas Decor's /api/chat but driven by BotConfig.
 *
 * Body:
 *   message (string, required): incoming message text
 *   history (array, optional): [{role, content}, ...]
 *   phone (string, optional): customer phone number
 *   customer_id (string, optional): chatin customer ID (auto-detected if missing)
 *   source (string, optional): "whatsapp_bot" | "web" | "manual"
 *   business_name (string, optional): override business name in greeting
 *
 * Response:
 *   reply (string): text to send back (empty if autoReply=false)
 *   leadSaved (bool): whether a lead was created/updated
 *   leadData (object): collected lead fields
 *   autoReply (bool): whether the bot should auto-reply
 *   handoverToAdmin (bool): whether to handover to human
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    if (!body || !body.message) {
      return NextResponse.json({
        error: "Format tidak valid. Kirim JSON dengan key 'message'.",
        example: { message: "Halo, mau tanya dong" }
      }, { status: 400 })
    }

    const userMessage = (body.message as string).trim()
    const history = (body.history || []) as Array<{ role: string; content: string }>
    const phone = body.phone as string | undefined
    const customerId = body.customer_id as string | undefined
    const source = (body.source || 'whatsapp_bot') as string
    const businessName = body.business_name as string | undefined

    // ── Determine customer_id ──
    // If not provided, try to find from phone or use a default
    let cid = customerId
    if (!cid && phone) {
      // Find any customer with a bot_config that matches this phone... or use first available
      // For now, use a simple approach: if only 1 customer exists, use that
      const { listCustomers } = await import('@/lib/db')
      const allCustomers = listCustomers('active')
      if (allCustomers.length === 1) {
        cid = allCustomers[0].id
      }
    }

    if (!cid) {
      return NextResponse.json({
        error: 'customer_id is required or no active customer found.',
        hint: 'Pass customer_id in the request body.',
      }, { status: 400 })
    }

    // ── Load bot config ──
    const botCfg = getBotConfig(cid)
    if (!botCfg || !botCfg.enabled) {
      return NextResponse.json({
        reply: '',
        autoReply: false,
        handoverToAdmin: true,
        leadSaved: false,
        leadData: {},
        reason: 'Bot not configured or disabled for this customer.',
      })
    }

    // Parse config
    let fields: BotField[] = []
    let templates: Record<string, string> = {}
    let pricelist_links: Record<string, string> = {}
    let cfg: Record<string, unknown> = {}
    try { fields = JSON.parse(botCfg.fields_json || '[]') } catch { }
    try { templates = JSON.parse(botCfg.templates_json || '{}') } catch { }
    try { pricelist_links = JSON.parse(botCfg.pricelist_links_json || '{}') } catch { }
    try { if (botCfg.config_json) cfg = JSON.parse(botCfg.config_json) } catch { }

    const customer = getCustomer(cid)
    const effectiveBusinessName = businessName || customer?.name || 'Bisnis Kami'

    // ── Check existing lead ──
    const existingLead = phone ? getLeadByPhone(cid, phone) : undefined

    // ── Run chat engine ──
    const result: ChatEngineResult = handleChat(userMessage, history, existingLead || null, {
      fields,
      templates,
      pricelist_links,
      business_name: effectiveBusinessName,
    })

    // ── Save lead if engine says so ──
    if (result.leadSaved && result.leadData.is_complete && phone) {
      const data: Record<string, string> = {}
      for (const [k, v] of Object.entries(result.leadData.field_values)) {
        if (typeof v === 'string' && v) data[k] = v
      }
      upsertLead({
        customer_id: cid,
        contact_phone: phone,
        contact_name: data['name'] || data['contact_name'],
        package: data['_package'],
        status: result.handoverToAdmin ? 'Contacted' : 'Inquiry',
        data,
        source,
      })
    }

    // ── Log message ──
    insertMessageLog({
      id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      customer_id: cid,
      to_number: phone,
      type: 'incoming',
      status: 'received',
      content: userMessage,
    })

    return NextResponse.json({
      reply: result.reply,
      leadSaved: result.leadSaved,
      leadData: result.leadData,
      autoReply: result.autoReply,
      handoverToAdmin: result.handoverToAdmin,
    })
  } catch (error) {
    console.error('[chat-engine] Error:', error)
    return NextResponse.json({
      error: 'Terjadi kesalahan internal. Silakan coba lagi.',
    }, { status: 500 })
  }
}
