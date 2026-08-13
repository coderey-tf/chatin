import { NextRequest, NextResponse } from 'next/server'
import { getBotConfig, upsertBotConfig } from '@/lib/db'

// GET /api/customers/[id]/chat-settings — returns bot_config with parsed JSONs
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const cfg = await getBotConfig(id)
    if (!cfg) return NextResponse.json({ data: null })

    const parseJson = (val: unknown, fallback: unknown) => {
      if (!val) return fallback
      if (typeof val === 'object') return val
      if (typeof val === 'string') {
        try { return JSON.parse(val) } catch { return fallback }
      }
      return fallback
    }

    const fields = parseJson(cfg.fields_json, [])
    const templates = parseJson(cfg.templates_json, {})
    const pricelist_links = parseJson(cfg.pricelist_links_json, {})
    const config = parseJson(cfg.config_json, {})

    return NextResponse.json({
      data: {
        id: cfg.id,
        customer_id: cfg.customer_id,
        industry_preset: cfg.industry_preset,
        enabled: !!cfg.enabled,
        config_json: config,
        fields,
        templates,
        pricelist_links,
        config,
      },
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed' }, { status: 500 })
  }
}

// PUT /api/customers/[id]/chat-settings — save bot config
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()

    await upsertBotConfig({
      customer_id: id,
      industry_preset: body.industry_preset,
      enabled: Boolean(body.enabled),
      test_mode_enabled: body.test_mode_enabled !== undefined ? Boolean(body.test_mode_enabled) : undefined,
      test_phone_numbers: body.test_phone_numbers !== undefined ? String(body.test_phone_numbers) : undefined,
      fields: body.fields,
      templates: body.templates,
      pricelist_links: body.pricelist_links,
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed' }, { status: 500 })
  }
}
