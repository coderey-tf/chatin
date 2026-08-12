import { createAdminClient } from './supabase/admin'

export interface Customer {
  id: string
  name: string
  email: string | null
  status: string
  metadata: string | Record<string, unknown> | null
  phone_number_id: string | null
  phone_number: string | null
  wa_account_status: string | null
  created_at: string
  updated_at: string
  onboarded_at: string | null
}

export interface SetupLink {
  id: string
  customer_id: string
  status: string
  token_last4: string | null
  expires_at: string | null
  consumed_at: string | null
  created_at: string
}

export interface MessageLog {
  id: string
  customer_id: string | null
  phone_number_id: string | null
  to_number: string | null
  contact_phone: string | null
  direction: 'inbound' | 'outbound' | string
  wamid: string | null
  type: string | null
  status: string | null
  content: string | null
  error: string | null
  created_at: string
  customer_name?: string | null
}

export interface BotField {
  key: string             // data key: e.g. "name", "event_date", "venue_type"
  label: string           // human label: e.g. "Nama", "Tanggal Acara"
  emoji: string           // emoji for UI: e.g. "👤", "📅"
  type: 'text' | 'date' | 'select' | 'keyword' | 'location'
  required: boolean
  options?: string[]      // for select type: possible values
  keywords?: Record<string, string[]>  // for keyword type: value -> list of keywords
  placeholder?: string
  default_value?: string  // value to fill if not provided
}

export interface BotConfig {
  id: string
  customer_id: string
  industry_preset: string
  enabled: boolean | number
  config_json: Record<string, unknown> | string | null
  fields_json: BotField[] | string | null
  templates_json: Record<string, string> | string | null
  pricelist_links_json: Record<string, string> | string | null
  created_at: string
  updated_at: string
}

export interface Lead {
  id: string
  customer_id: string
  contact_phone: string
  contact_name: string | null
  package: string | null
  status: string
  data_json: Record<string, unknown> | string | null
  source: string | null
  last_inbound_at: string | null
  created_at: string
  updated_at: string
}

// ─── Customer Helpers ───

export async function upsertCustomer(data: {
  id: string
  name: string
  email?: string | null
  status?: string
  metadata?: object | null
  phone_number_id?: string | null
  phone_number?: string | null
  wa_account_status?: string | null
  created_at?: string
  updated_at?: string
  onboarded_at?: string | null
}): Promise<void> {
  const sb = createAdminClient()
  const payload: Record<string, unknown> = {
    id: data.id,
    name: data.name,
    email: data.email ?? null,
    status: data.status ?? 'pending',
    updated_at: data.updated_at || new Date().toISOString(),
  }

  if (data.metadata !== undefined) payload.metadata = data.metadata
  if (data.phone_number_id) payload.phone_number_id = data.phone_number_id
  if (data.phone_number) payload.phone_number = data.phone_number
  if (data.wa_account_status) payload.wa_account_status = data.wa_account_status
  if (data.created_at) payload.created_at = data.created_at
  if (data.onboarded_at) payload.onboarded_at = data.onboarded_at

  const { error } = await sb.from('customers').upsert(payload, { onConflict: 'id' })
  if (error) throw new Error(`upsertCustomer error: ${error.message}`)
}

export async function getCustomer(id: string): Promise<Customer | null> {
  const sb = createAdminClient()
  const { data, error } = await sb.from('customers').select('*').eq('id', id).maybeSingle()
  if (error) throw new Error(`getCustomer error: ${error.message}`)
  return data
}

export async function listCustomers(status?: string): Promise<Customer[]> {
  const sb = createAdminClient()
  let query = sb.from('customers').select('*').order('created_at', { ascending: false })
  if (status) query = query.eq('status', status)
  const { data, error } = await query
  if (error) throw new Error(`listCustomers error: ${error.message}`)
  return data || []
}

// ─── Setup Link Helpers ───

export async function insertSetupLink(data: {
  id: string
  customer_id: string
  status?: string
  token_last4?: string
  expires_at?: string
  created_at?: string
}): Promise<void> {
  const sb = createAdminClient()
  const { error } = await sb.from('setup_links').insert({
    id: data.id,
    customer_id: data.customer_id,
    status: data.status || 'active',
    token_last4: data.token_last4 || null,
    expires_at: data.expires_at || null,
    created_at: data.created_at || new Date().toISOString(),
  })
  if (error) throw new Error(`insertSetupLink error: ${error.message}`)
}

// ─── Message Log Helpers ───

export async function insertMessageLog(data: {
  id: string
  customer_id?: string
  phone_number_id?: string
  to_number?: string
  contact_phone?: string
  direction?: 'inbound' | 'outbound'
  wamid?: string
  type?: string
  status?: string
  content?: string
  error?: string
}): Promise<void> {
  const sb = createAdminClient()
  const { error } = await sb.from('message_logs').insert({
    id: data.id,
    customer_id: data.customer_id || null,
    phone_number_id: data.phone_number_id || null,
    to_number: data.to_number || null,
    contact_phone: data.contact_phone || data.to_number || null,
    direction: data.direction || 'outbound',
    wamid: data.wamid || null,
    type: data.type || null,
    status: data.status || null,
    content: data.content || null,
    error: data.error || null,
    created_at: new Date().toISOString(),
  })
  if (error) console.error('insertMessageLog error:', error.message)
}

// ─── Bot Config Helpers ───

export async function getBotConfig(customerId: string): Promise<BotConfig | null> {
  const sb = createAdminClient()
  const { data, error } = await sb.from('bot_configs').select('*').eq('customer_id', customerId).maybeSingle()
  if (error) throw new Error(`getBotConfig error: ${error.message}`)
  return data
}

export async function upsertBotConfig(data: {
  customer_id: string
  industry_preset?: string
  enabled?: boolean | number
  config?: Record<string, unknown>
  fields?: BotField[]
  templates?: Record<string, string>
  pricelist_links?: Record<string, string>
}): Promise<void> {
  const sb = createAdminClient()
  const existing = await getBotConfig(data.customer_id)
  const now = new Date().toISOString()

  const isEnabled = data.enabled !== undefined ? (data.enabled === true || data.enabled === 1) : (existing ? existing.enabled : true)

  const payload = {
    customer_id: data.customer_id,
    industry_preset: data.industry_preset ?? existing?.industry_preset ?? 'generic',
    enabled: isEnabled,
    config_json: data.config ?? existing?.config_json ?? null,
    fields_json: data.fields ?? existing?.fields_json ?? null,
    templates_json: data.templates ?? existing?.templates_json ?? null,
    pricelist_links_json: data.pricelist_links ?? existing?.pricelist_links_json ?? null,
    updated_at: now,
  }

  const { error } = await sb.from('bot_configs').upsert(payload, { onConflict: 'customer_id' })
  if (error) throw new Error(`upsertBotConfig error: ${error.message}`)
}

// ─── Lead Helpers ───

export async function getLeadByPhone(customerId: string, phone: string): Promise<Lead | null> {
  const sb = createAdminClient()
  const { data, error } = await sb
    .from('leads')
    .select('*')
    .eq('customer_id', customerId)
    .eq('contact_phone', phone)
    .maybeSingle()
  if (error) throw new Error(`getLeadByPhone error: ${error.message}`)
  return data
}

export async function listLeads(customerId: string): Promise<Lead[]> {
  const sb = createAdminClient()
  const { data, error } = await sb
    .from('leads')
    .select('*')
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false })
  if (error) throw new Error(`listLeads error: ${error.message}`)
  return data || []
}

export function parseLead(lead: Lead): Lead & { data: Record<string, unknown> } {
  let data: Record<string, unknown> = {}
  if (typeof lead.data_json === 'object' && lead.data_json !== null) {
    data = lead.data_json as Record<string, unknown>
  } else if (typeof lead.data_json === 'string') {
    try { data = JSON.parse(lead.data_json) } catch { }
  }
  return { ...lead, data }
}

export async function upsertLead(data: {
  customer_id: string
  contact_phone: string
  contact_name?: string
  package?: string
  status?: string
  data?: Record<string, string | undefined>
  source?: string
  last_inbound_at?: string
}): Promise<string> {
  const sb = createAdminClient()
  const existing = await getLeadByPhone(data.customer_id, data.contact_phone)
  const now = new Date().toISOString()

  let merged: Record<string, unknown> = {}
  if (existing?.data_json) {
    if (typeof existing.data_json === 'object') {
      merged = { ...(existing.data_json as Record<string, unknown>) }
    } else if (typeof existing.data_json === 'string') {
      try { merged = JSON.parse(existing.data_json) } catch { }
    }
  }

  if (data.data) {
    for (const [k, v] of Object.entries(data.data)) {
      if (v) merged[k] = v
    }
  }

  const payload: Record<string, unknown> = {
    customer_id: data.customer_id,
    contact_phone: data.contact_phone,
    contact_name: data.contact_name ?? existing?.contact_name ?? null,
    package: data.package ?? existing?.package ?? null,
    status: data.status ?? existing?.status ?? 'Inquiry',
    data_json: merged,
    source: data.source ?? existing?.source ?? 'whatsapp_bot',
    updated_at: now,
  }

  if (data.last_inbound_at) {
    payload.last_inbound_at = data.last_inbound_at
  }

  const { data: res, error } = await sb
    .from('leads')
    .upsert(payload, { onConflict: 'customer_id,contact_phone' })
    .select('id')
    .single()

  if (error) throw new Error(`upsertLead error: ${error.message}`)
  return res.id
}

export async function updateLead(leadId: string, customerId: string, updates: {
  status?: string
  contact_name?: string
  package?: string
  data?: Record<string, unknown>
}): Promise<void> {
  const sb = createAdminClient()
  const payload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  }
  if (updates.status) payload.status = updates.status
  if (updates.contact_name) payload.contact_name = updates.contact_name
  if (updates.package) payload.package = updates.package
  if (updates.data) payload.data_json = updates.data

  const { error } = await sb
    .from('leads')
    .update(payload)
    .eq('id', leadId)
    .eq('customer_id', customerId)

  if (error) throw new Error(`updateLead error: ${error.message}`)
}

export async function deleteLead(leadId: string, customerId: string): Promise<void> {
  const sb = createAdminClient()
  const { error } = await sb
    .from('leads')
    .delete()
    .eq('id', leadId)
    .eq('customer_id', customerId)
  if (error) throw new Error(`deleteLead error: ${error.message}`)
}

// ─── Inbox & Dashboard Query Helpers ───

export interface InboxContact {
  contact_phone: string
  contact_name: string | null
  customer_id: string
  customer_name: string
  last_message: string | null
  last_message_at: string
  last_inbound_at: string | null
  is_24h_open: boolean
}

export async function listInboxContacts(customerId?: string): Promise<InboxContact[]> {
  const sb = createAdminClient()
  
  let query = sb
    .from('message_logs')
    .select('customer_id, contact_phone, content, created_at, direction, customers(name)')
    .order('created_at', { ascending: false })

  if (customerId) query = query.eq('customer_id', customerId)
  const { data, error } = await query
  if (error) throw new Error(`listInboxContacts error: ${error.message}`)

  // Group by (customer_id + contact_phone)
  const map = new Map<string, InboxContact>()
  const now = new Date().getTime()
  const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000

  // We also fetch leads to get lead contact_name and last_inbound_at
  const { data: leads } = await sb.from('leads').select('customer_id, contact_phone, contact_name, last_inbound_at')
  const leadMap = new Map<string, { contact_name: string | null; last_inbound_at: string | null }>()
  for (const l of leads || []) {
    leadMap.set(`${l.customer_id}_${l.contact_phone}`, {
      contact_name: l.contact_name,
      last_inbound_at: l.last_inbound_at,
    })
  }

  for (const row of data || []) {
    if (!row.contact_phone || !row.customer_id) continue
    const key = `${row.customer_id}_${row.contact_phone}`
    if (!map.has(key)) {
      const customerName = (row.customers as unknown as { name: string } | null)?.name || row.customer_id
      const leadInfo = leadMap.get(key)
      const lastInbound = leadInfo?.last_inbound_at || null
      const isInboundOpen = lastInbound ? (now - new Date(lastInbound).getTime() < TWENTY_FOUR_HOURS) : false

      map.set(key, {
        contact_phone: row.contact_phone,
        contact_name: leadInfo?.contact_name || row.contact_phone,
        customer_id: row.customer_id,
        customer_name: customerName,
        last_message: row.content || '',
        last_message_at: row.created_at,
        last_inbound_at: lastInbound,
        is_24h_open: isInboundOpen,
      })
    }
  }

  return Array.from(map.values())
}

export async function getConversationThread(customerId: string, contactPhone: string, limit = 50): Promise<MessageLog[]> {
  const sb = createAdminClient()
  const { data, error } = await sb
    .from('message_logs')
    .select('*')
    .eq('customer_id', customerId)
    .eq('contact_phone', contactPhone)
    .order('created_at', { ascending: true })
    .limit(limit)

  if (error) throw new Error(`getConversationThread error: ${error.message}`)
  return data || []
}

export async function getDashboardStats() {
  const sb = createAdminClient()
  const todayStart = new Date().toISOString().split('T')[0]

  const [{ count: totalCustomers }, { count: activeCustomers }] = await Promise.all([
    sb.from('customers').select('*', { count: 'exact', head: true }),
    sb.from('customers').select('*', { count: 'exact', head: true }).eq('status', 'active'),
  ])

  const [{ count: totalLeads }, { count: todayLeads }] = await Promise.all([
    sb.from('leads').select('*', { count: 'exact', head: true }),
    sb.from('leads').select('*', { count: 'exact', head: true }).gte('created_at', todayStart),
  ])

  const [{ count: totalMessages }, { count: todayMessages }] = await Promise.all([
    sb.from('message_logs').select('*', { count: 'exact', head: true }),
    sb.from('message_logs').select('*', { count: 'exact', head: true }).gte('created_at', todayStart),
  ])

  return {
    totalCustomers: totalCustomers || 0,
    activeCustomers: activeCustomers || 0,
    totalLeads: totalLeads || 0,
    todayLeads: todayLeads || 0,
    totalMessages: totalMessages || 0,
    todayMessages: todayMessages || 0,
  }
}

// ─── Subscriptions & Invoices Helpers ───

export interface Subscription {
  id: string
  customer_id: string
  plan_tier: 'trial' | 'starter' | 'pro' | 'enterprise' | string
  status: 'trialing' | 'active' | 'past_due' | 'canceled' | 'expired' | string
  current_period_start: string
  current_period_end: string
  max_waba_accounts: number
  max_leads_per_month: number
  auto_renew: boolean
  created_at: string
  updated_at: string
}

export interface Invoice {
  id: string
  customer_id: string
  subscription_id: string | null
  plan_tier: string
  amount: number
  status: 'pending' | 'paid' | 'failed' | 'expired' | string
  payment_method: string | null
  payment_url: string | null
  paid_at: string | null
  created_at: string
}

export async function getSubscription(customerId: string): Promise<Subscription | null> {
  const sb = createAdminClient()
  const { data, error } = await sb.from('subscriptions').select('*').eq('customer_id', customerId).maybeSingle()
  if (error) {
    // Return a default virtual trial subscription if table is empty or error
    return null
  }
  return data
}

export async function upsertSubscription(data: {
  customer_id: string
  plan_tier?: string
  status?: string
  current_period_start?: string
  current_period_end?: string
  max_waba_accounts?: number
  max_leads_per_month?: number
}): Promise<void> {
  const sb = createAdminClient()
  const existing = await getSubscription(data.customer_id)

  const payload = {
    customer_id: data.customer_id,
    plan_tier: data.plan_tier || existing?.plan_tier || 'starter',
    status: data.status || existing?.status || 'active',
    current_period_start: data.current_period_start || existing?.current_period_start || new Date().toISOString(),
    current_period_end: data.current_period_end || existing?.current_period_end || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    max_waba_accounts: data.max_waba_accounts ?? existing?.max_waba_accounts ?? (data.plan_tier === 'pro' ? 3 : data.plan_tier === 'enterprise' ? 10 : 1),
    max_leads_per_month: data.max_leads_per_month ?? existing?.max_leads_per_month ?? (data.plan_tier === 'pro' ? 3000 : data.plan_tier === 'enterprise' ? 999999 : 500),
    updated_at: new Date().toISOString(),
  }

  const { error } = await sb.from('subscriptions').upsert(payload, { onConflict: 'customer_id' })
  if (error) console.error('upsertSubscription error:', error.message)
}

export async function listInvoices(customerId: string): Promise<Invoice[]> {
  const sb = createAdminClient()
  const { data, error } = await sb.from('invoices').select('*').eq('customer_id', customerId).order('created_at', { ascending: false })
  if (error) return []
  return data || []
}

export async function createInvoice(data: {
  customer_id: string
  subscription_id?: string
  plan_tier: string
  amount: number
  payment_method?: string
  payment_url?: string
}): Promise<Invoice> {
  const sb = createAdminClient()
  const id = `inv_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
  const payload = {
    id,
    customer_id: data.customer_id,
    subscription_id: data.subscription_id || null,
    plan_tier: data.plan_tier,
    amount: data.amount,
    status: 'pending',
    payment_method: data.payment_method || 'qris',
    payment_url: data.payment_url || null,
    created_at: new Date().toISOString(),
  }

  const { data: inv, error } = await sb.from('invoices').insert(payload).select('*').single()
  if (error) throw new Error(`createInvoice error: ${error.message}`)
  return inv
}

