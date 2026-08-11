import { NextRequest, NextResponse } from 'next/server'
import { kirim, APP_URL } from '@/lib/kirimdev'
import { insertSetupLink } from '@/lib/db'

// POST /api/customers/[id]/setup-link - Generate setup link
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json().catch(() => ({}))
    const { expires_in_hours } = body

    const link = await kirim.customers.createSetupLink(id, {
      expires_in_hours: expires_in_hours || 168, // 7 days default
      success_redirect_url: `${APP_URL}/onboarded`,
      failure_redirect_url: `${APP_URL}/onboard-failed`,
    })

    // Save to local DB
    insertSetupLink({
      id: link.id,
      customer_id: id,
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

    const links = await kirim.customers.listSetupLinks(id)

    return NextResponse.json({ data: links })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to list setup links' },
      { status: 500 }
    )
  }
}
