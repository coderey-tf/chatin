import { NextRequest, NextResponse } from 'next/server'
import { getCustomer, getBotConfig, getLeadByPhone, upsertLead, insertMessageLog, listCustomers } from '@/lib/db'
import { handleChat, type ChatEngineResult } from '@/lib/chat-engine'
import { INDUSTRY_TEMPLATES } from '@/lib/industry-templates'
import type { BotField } from '@/lib/db'

/**
 * POST /api/chat — Generic chat engine endpoint
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
    let cid = customerId
    if (!cid && phone) {
      const allCustomers = await listCustomers('active')
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
    const botCfg = await getBotConfig(cid)
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

    // Parse config (handles both object/array and stringified JSON)
    const parseJson = (val: unknown, fallback: unknown) => {
      if (!val) return fallback
      if (typeof val === 'object') return val
      if (typeof val === 'string') {
        try { return JSON.parse(val) } catch { return fallback }
      }
      return fallback
    }

    const preset = INDUSTRY_TEMPLATES[botCfg.industry_preset] || INDUSTRY_TEMPLATES.wedding_decor
    const rawFields = parseJson(botCfg.fields_json, []) as BotField[]
    const fields = (rawFields.length > 0 ? rawFields : preset.fields).map((f: BotField) => {
      const defaultPresetField = preset.fields.find((pf: BotField) => pf.key === f.key)
      return {
        ...defaultPresetField,
        ...f,
        keywords:
          f.keywords && Object.keys(f.keywords).length > 0
            ? f.keywords
            : defaultPresetField?.keywords,
        options:
          f.options && f.options.length > 0
            ? f.options
            : defaultPresetField?.options,
      }
    })
    const templates = parseJson(botCfg.templates_json, {}) as Record<string, string>
    const pricelist_links = parseJson(botCfg.pricelist_links_json, {}) as Record<string, string>

    const customer = await getCustomer(cid)
    const effectiveBusinessName = businessName || customer?.name || 'Bisnis Kami'

    // ── Check existing lead ──
    const existingLead = phone ? await getLeadByPhone(cid, phone) : null

    // ── Run chat engine ──
    const result: ChatEngineResult = handleChat(userMessage, history, existingLead || null, {
      fields,
      templates,
      pricelist_links,
      business_name: effectiveBusinessName,
    })

    // ── Save lead (Partial Lead Saving: saves whenever fields are present) ──
    if (phone) {
      const fieldValues = result.leadData.field_values || {}
      const hasData = Object.keys(fieldValues).some(k => k !== '_package' && fieldValues[k])

      if (hasData || result.leadData.is_complete) {
        const dataObj: Record<string, string> = {}
        for (const [k, v] of Object.entries(fieldValues)) {
          if (typeof v === 'string' && v) dataObj[k] = v
        }

        await upsertLead({
          customer_id: cid,
          contact_phone: phone,
          contact_name: dataObj['name'] || dataObj['contact_name'],
          package: dataObj['_package'],
          status: result.leadData.is_complete ? (result.handoverToAdmin ? 'Contacted' : 'Inquiry') : 'Inquiry',
          data: dataObj,
          source,
          last_inbound_at: new Date().toISOString(),
        })
      }
    }

    // ── Log message ──
    await insertMessageLog({
      id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      customer_id: cid,
      to_number: phone,
      contact_phone: phone,
      direction: 'inbound',
      type: 'text',
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
