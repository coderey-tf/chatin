import { NextRequest, NextResponse } from 'next/server'
import { kirim, APP_URL, isValidKirimDevCustomerId, generateKirimDevCustomerId } from '@/lib/kirimdev'
import { insertSetupLink, getCustomer, upsertCustomer } from '@/lib/db'
import { createAdminClient } from '@/lib/supabase/admin'

// POST /api/customers/[id]/setup-link - Generate setup link
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    let { id: targetCustomerId } = await params
    const body = await request.json().catch(() => ({}))
    const { expires_in_hours } = body

    const apiKey = process.env.KIRIMDEV_API_KEY
    if (!apiKey || apiKey === 'kdv_xxx') {
      return NextResponse.json(
        { error: 'API Key KirimDev belum diisi di .env (KIRIMDEV_API_KEY). Dapatkan API Key resmi (kdv_live_...) Anda dari Dashboard KirimDev -> Developers -> API Keys.' },
        { status: 400 }
      )
    }

    const localCustomer = await getCustomer(targetCustomerId)

    // If customer ID does not match KirimDev's 26-char ULID format, migrate/register it to a valid KirimDev ID
    if (!isValidKirimDevCustomerId(targetCustomerId)) {
      try {
        const kirimCustomer = await kirim.customers.create({
          name: localCustomer?.name || 'Customer',
          email: localCustomer?.email || undefined,
        })
        const newId = kirimCustomer.id

        // Migrate local DB records if needed
        const sb = createAdminClient()
        if (localCustomer) {
          await upsertCustomer({
            id: newId,
            name: localCustomer.name,
            email: localCustomer.email,
            status: localCustomer.status,
            phone_number: localCustomer.phone_number,
            phone_number_id: localCustomer.phone_number_id,
            onboarded_at: localCustomer.onboarded_at,
          })
          // Delete old non-ULID record
          await sb.from('customers').delete().eq('id', targetCustomerId)
        }
        targetCustomerId = newId
      } catch {
        // Fallback: generate valid Crockford ULID locally if KirimDev API create fails
        const fallbackId = generateKirimDevCustomerId()
        if (localCustomer) {
          await upsertCustomer({
            id: fallbackId,
            name: localCustomer.name,
            email: localCustomer.email,
            status: localCustomer.status,
            phone_number: localCustomer.phone_number,
            phone_number_id: localCustomer.phone_number_id,
          })
        }
        targetCustomerId = fallbackId
      }
    }

    try {
      const link = await kirim.customers.createSetupLink(targetCustomerId, {
        expires_in_hours: expires_in_hours || 168, // 7 days default
        success_redirect_url: `${APP_URL}/onboarded`,
        failure_redirect_url: `${APP_URL}/onboard-failed`,
      })

      // Save to local DB
      await insertSetupLink({
        id: link.id,
        customer_id: targetCustomerId,
        status: 'active',
        token_last4: link.token_last4,
        expires_at: link.expires_at,
      })

      return NextResponse.json({
        data: {
          id: link.id,
          setup_url: link.setup_url,
          token_last4: link.token_last4,
          expires_at: link.expires_at,
          status: 'active',
        }
      }, { status: 201 })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('API key') || msg.includes('401') || msg.includes('unauthorized')) {
        return NextResponse.json(
          { error: 'API Key KirimDev di .env tidak valid. Silakan periksa KIRIMDEV_API_KEY di dashboard KirimDev -> Developers -> API Keys.' },
          { status: 400 }
        )
      }
      throw err
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create setup link' },
      { status: 500 }
    )
  }
}

// GET /api/customers/[id]/setup-link - List setup links
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const apiKey = process.env.KIRIMDEV_API_KEY
    if (!apiKey || apiKey === 'kdv_xxx') {
      return NextResponse.json({ data: [] })
    }

    if (!isValidKirimDevCustomerId(id)) {
      return NextResponse.json({ data: [] })
    }

    try {
      const links = await kirim.customers.listSetupLinks(id)
      return NextResponse.json({ data: links })
    } catch {
      return NextResponse.json({ data: [] })
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to list setup links' },
      { status: 500 }
    )
  }
}
