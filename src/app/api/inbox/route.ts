import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { listInboxContacts } from '@/lib/db'

// GET /api/inbox — list contacts with last message & 24h window info
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const customerId = searchParams.get('customer_id') || undefined

    const contacts = await listInboxContacts(customerId, user.id)
    return NextResponse.json({ data: contacts, count: contacts.length })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch inbox contacts' },
      { status: 500 }
    )
  }
}
