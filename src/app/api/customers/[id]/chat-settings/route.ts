import { NextRequest, NextResponse } from 'next/server'
import { getBotConfig, upsertBotConfig } from '@/lib/db'

// GET /api/customers/[id]/chat-settings — returns bot_config with parsed JSONs
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const cfg = getBotConfig(id)
    if (!cfg) return NextResponse.json({ data: null })

    let fields: unknown[] = []
    let templates: Record<string, string> = {}
    let pricelist_links: Record<string, string> = {}
    let config: Record<string, unknown> | null = null
    try { fields = JSON.parse(cfg.fields_json || '[]') } catch { }
    try { templates = JSON.parse(cfg.templates_json || '{}') } catch { }
    try { pricelist_links = JSON.parse(cfg.pricelist_links_json || '{}') } catch { }
    try { if (cfg.config_json) config = JSON.parse(cfg.config_json) } catch { }

    return NextResponse.json({
      data: {
        id: cfg.id,
        customer_id: cfg.customer_id,
        industry_preset: cfg.industry_preset,
        enabled: !!cfg.enabled,
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

    upsertBotConfig({
      customer_id: id,
      industry_preset: body.industry_preset,
      enabled: body.enabled ? 1 : 0,
      config: body.config,
      fields: body.fields,
      templates: body.templates,
      pricelist_links: body.pricelist_links,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed' }, { status: 500 })
  }
}
