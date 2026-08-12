import { createClient } from '@/lib/supabase/server'
import { upsertCustomer, upsertBotConfig, setOnboardedStatus, upsertSubscription } from '@/lib/db'
import { kirim, generateKirimDevCustomerId } from '@/lib/kirimdev'
import { INDUSTRY_TEMPLATES } from '@/lib/industry-templates'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { businessName, email, industryPreset, phone } = body

    if (!businessName?.trim()) {
      return NextResponse.json({ error: 'Nama bisnis wajib diisi' }, { status: 400 })
    }

    let customerId = generateKirimDevCustomerId()

    // Try to create customer in KirimDev API first
    const apiKey = process.env.KIRIMDEV_API_KEY
    if (apiKey && apiKey !== 'kdv_xxx') {
      try {
        const kirimCustomer = await kirim.customers.create({
          name: businessName.trim(),
          email: email || user.email || undefined,
        })
        if (kirimCustomer?.id) {
          customerId = kirimCustomer.id
        }
      } catch (e) {
        console.warn('[onboarding] KirimDev API customer creation skipped:', e)
      }
    }

    const presetKey = (industryPreset || 'generic') as keyof typeof INDUSTRY_TEMPLATES
    const preset = INDUSTRY_TEMPLATES[presetKey] || INDUSTRY_TEMPLATES.generic

    // 1. Create Customer in local DB
    await upsertCustomer({
      id: customerId,
      name: businessName.trim(),
      email: email || user.email || null,
      status: 'active',
      phone_number: phone || null,
      onboarded_at: new Date().toISOString(),
    })

    // 2. Create Default Bot Config
    await upsertBotConfig({
      customer_id: customerId,
      industry_preset: presetKey,
      enabled: true,
      fields: preset.fields,
      templates: {
        greeting: preset.default_greeting,
        followup: preset.default_followup,
      },
      pricelist_links: preset.default_pricelist_links,
    })

    // 3. Create Trial Subscription
    await upsertSubscription({
      customer_id: customerId,
      plan_tier: 'starter',
      status: 'active',
    })

    // 4. Mark Profile as Onboarded
    await setOnboardedStatus(user.id, true)

    return NextResponse.json({ success: true, customerId })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to complete onboarding'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
