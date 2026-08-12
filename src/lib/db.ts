import Database from 'better-sqlite3'
import path from 'path'

const DB_PATH = path.join(process.cwd(), 'chatin.db')

let db: Database.Database | null = null

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH)
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')
    initSchema()
  }
  return db
}

function initSchema() {
  db!.exec(`
    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT,
      status TEXT DEFAULT 'pending',
      metadata TEXT,
      phone_number_id TEXT,
      phone_number TEXT,
      wa_account_status TEXT,
      created_at TEXT,
      updated_at TEXT,
      onboarded_at TEXT
    );

    CREATE TABLE IF NOT EXISTS setup_links (
      id TEXT PRIMARY KEY,
      customer_id TEXT NOT NULL,
      status TEXT DEFAULT 'active',
      token_last4 TEXT,
      expires_at TEXT,
      consumed_at TEXT,
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS message_logs (
      id TEXT PRIMARY KEY,
      customer_id TEXT,
      phone_number_id TEXT,
      to_number TEXT,
      type TEXT,
      status TEXT,
      content TEXT,
      error TEXT,
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS webhook_events (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      payload TEXT,
      processed INTEGER DEFAULT 0,
      created_at TEXT
    );

    -- Generic bot config: one row per customer, JSON-driven
    -- industry_preset: key for industry template (wedding_decor, jasa_rental, clinic, shop, generic)
    -- config_json: full BotConfig (fields, templates, links, etc)
    -- fields_json: array of field definitions (flexible custom fields)
    -- templates_json: greeting, followup, pricelist, handover templates
    -- pricelist_links_json: mapping category->link (keyed by package/category)
    CREATE TABLE IF NOT EXISTS bot_configs (
      id TEXT PRIMARY KEY,
      customer_id TEXT NOT NULL UNIQUE,
      industry_preset TEXT DEFAULT 'generic',
      enabled INTEGER DEFAULT 1,
      config_json TEXT,
      fields_json TEXT,
      templates_json TEXT,
      pricelist_links_json TEXT,
      created_at TEXT,
      updated_at TEXT,
      FOREIGN KEY(customer_id) REFERENCES customers(id) ON DELETE CASCADE
    );

    -- Generic leads: fields stored as JSON (flexible like NoSQL)
    -- core columns: id, customer_id, contact_phone (unique key per customer)
    -- data_json: arbitrary {field_key: value} e.g. {name, date, venue, package, ...}
    -- package: denormalized important category (e.g. Wedding Gedung)
    -- status: Inquiry / Contacted / Booked / etc
    -- source: whatsapp_bot, web, manual
    CREATE TABLE IF NOT EXISTS leads (
      id TEXT PRIMARY KEY,
      customer_id TEXT NOT NULL,
      contact_phone TEXT NOT NULL,
      contact_name TEXT,
      package TEXT,
      status TEXT DEFAULT 'Inquiry',
      data_json TEXT,
      source TEXT DEFAULT 'whatsapp_bot',
      created_at TEXT,
      updated_at TEXT,
      UNIQUE(customer_id, contact_phone),
      FOREIGN KEY(customer_id) REFERENCES customers(id) ON DELETE CASCADE
    );
  `)
}

// --- Customer helpers ---

export interface Customer {
  id: string
  name: string
  email: string | null
  status: string
  metadata: string | null
  phone_number_id: string | null
  phone_number: string | null
  wa_account_status: string | null
  created_at: string
  updated_at: string
  onboarded_at: string | null
}

export function upsertCustomer(data: {
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
}) {
  const d = getDb()
  d.prepare(`
    INSERT INTO customers (id, name, email, status, metadata, phone_number_id, phone_number, wa_account_status, created_at, updated_at, onboarded_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      email = excluded.email,
      status = excluded.status,
      metadata = excluded.metadata,
      phone_number_id = COALESCE(excluded.phone_number_id, customers.phone_number_id),
      phone_number = COALESCE(excluded.phone_number, customers.phone_number),
      wa_account_status = COALESCE(excluded.wa_account_status, customers.wa_account_status),
      updated_at = excluded.updated_at,
      onboarded_at = COALESCE(excluded.onboarded_at, customers.onboarded_at)
  `).run(
    data.id,
    data.name,
    data.email || null,
    data.status || 'pending',
    data.metadata ? JSON.stringify(data.metadata) : null,
    data.phone_number_id || null,
    data.phone_number || null,
    data.wa_account_status || null,
    data.created_at || new Date().toISOString(),
    data.updated_at || new Date().toISOString(),
    data.onboarded_at || null
  )
}

export function getCustomer(id: string): Customer | undefined {
  return getDb().prepare('SELECT * FROM customers WHERE id = ?').get(id) as Customer | undefined
}

export function listCustomers(status?: string): Customer[] {
  if (status) {
    return getDb().prepare('SELECT * FROM customers WHERE status = ? ORDER BY created_at DESC').all(status) as Customer[]
  }
  return getDb().prepare('SELECT * FROM customers ORDER BY created_at DESC').all() as Customer[]
}

// --- Setup Link helpers ---

export function insertSetupLink(data: {
  id: string
  customer_id: string
  status?: string
  token_last4?: string
  expires_at?: string
  created_at?: string
}) {
  getDb().prepare(`
    INSERT INTO setup_links (id, customer_id, status, token_last4, expires_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    data.id,
    data.customer_id,
    data.status || 'active',
    data.token_last4 || null,
    data.expires_at || null,
    data.created_at || new Date().toISOString()
  )
}

// --- Message Log helpers ---

export function insertMessageLog(data: {
  id: string
  customer_id?: string
  phone_number_id?: string
  to_number?: string
  type?: string
  status?: string
  content?: string
  error?: string
}) {
  getDb().prepare(`
    INSERT INTO message_logs (id, customer_id, phone_number_id, to_number, type, status, content, error, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    data.id,
    data.customer_id || null,
    data.phone_number_id || null,
    data.to_number || null,
    data.type || null,
    data.status || null,
    data.content || null,
    data.error || null,
    new Date().toISOString()
  )
}

// ─── Bot Config helpers ───

export interface BotConfig {
  id: string
  customer_id: string
  industry_preset: string
  enabled: number
  config_json: string | null
  fields_json: string | null
  templates_json: string | null
  pricelist_links_json: string | null
  created_at: string
  updated_at: string
}

export function getBotConfig(customerId: string): BotConfig | undefined {
  return getDb().prepare('SELECT * FROM bot_configs WHERE customer_id = ?').get(customerId) as BotConfig | undefined
}

export function upsertBotConfig(data: {
  customer_id: string
  industry_preset?: string
  enabled?: number
  config?: Record<string, unknown>
  fields?: BotField[]
  templates?: Record<string, string>
  pricelist_links?: Record<string, string>
}) {
  const d = getDb()
  const existing = getBotConfig(data.customer_id)
  const now = new Date().toISOString()
  if (existing) {
    d.prepare(`
      UPDATE bot_configs SET
        industry_preset = COALESCE(?, industry_preset),
        enabled = COALESCE(?, enabled),
        config_json = COALESCE(?, config_json),
        fields_json = COALESCE(?, fields_json),
        templates_json = COALESCE(?, templates_json),
        pricelist_links_json = COALESCE(?, pricelist_links_json),
        updated_at = ?
      WHERE customer_id = ?
    `).run(
      data.industry_preset ?? null,
      data.enabled ?? null,
      data.config ? JSON.stringify(data.config) : null,
      data.fields ? JSON.stringify(data.fields) : null,
      data.templates ? JSON.stringify(data.templates) : null,
      data.pricelist_links ? JSON.stringify(data.pricelist_links) : null,
      now,
      data.customer_id
    )
  } else {
    const id = `bc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    d.prepare(`
      INSERT INTO bot_configs (id, customer_id, industry_preset, enabled, config_json, fields_json, templates_json, pricelist_links_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      data.customer_id,
      data.industry_preset ?? 'generic',
      data.enabled ?? 1,
      data.config ? JSON.stringify(data.config) : null,
      data.fields ? JSON.stringify(data.fields) : null,
      data.templates ? JSON.stringify(data.templates) : null,
      data.pricelist_links ? JSON.stringify(data.pricelist_links) : null,
      now,
      now
    )
  }
}

// ─── Bot Field type (generic) ───

export interface BotField {
  key: string             // data key: e.g. "name", "event_date", "venue_type"
  label: string           // human label: e.g. "Nama", "Tanggal Acara"
  emoji: string           // emoji for UI: e.g. "👤", "📅"
  type: 'text' | 'date' | 'select' | 'keyword' | 'location'
  required: boolean
  options?: string[]      // for select type: possible values
  keywords?: Record<string, string[]>  // for keyword type: value -> list of keywords
  placeholder?: string
  default_value?: string  // value to fill if not provided (e.g. "Belum pasti")
}

// ─── Leads helpers (generic) ───

export interface Lead {
  id: string
  customer_id: string
  contact_phone: string
  contact_name: string | null
  package: string | null
  status: string
  data_json: string | null
  source: string | null
  created_at: string
  updated_at: string
}

export function getLeadByPhone(customerId: string, phone: string): Lead | undefined {
  return getDb().prepare('SELECT * FROM leads WHERE customer_id = ? AND contact_phone = ?').get(customerId, phone) as Lead | undefined
}

export function listLeads(customerId: string): Lead[] {
  return getDb().prepare('SELECT * FROM leads WHERE customer_id = ? ORDER BY created_at DESC').all(customerId) as Lead[]
}

export function parseLead(lead: Lead): Lead & { data: Record<string, unknown> } {
  let data: Record<string, unknown> = {}
  try { if (lead.data_json) data = JSON.parse(lead.data_json) } catch { }
  return { ...lead, data }
}

/**
 * Upsert lead with flexible JSON data.
 * Supports merging: only overwrites data keys if value is provided.
 */
export function upsertLead(data: {
  customer_id: string
  contact_phone: string
  contact_name?: string
  package?: string
  status?: string
  // flexible fields: will be merged into data_json
  data?: Record<string, string | undefined>
  source?: string
}) {
  const d = getDb()
  const existing = getLeadByPhone(data.customer_id, data.contact_phone)
  const now = new Date().toISOString()

  let merged: Record<string, string | undefined> = {}

  if (existing) {
    try { merged = existing.data_json ? JSON.parse(existing.data_json) : {} } catch { merged = {} }

    // merge new data only if value provided
    if (data.data) {
      for (const [k, v] of Object.entries(data.data)) {
        if (v) merged[k] = v
      }
    }

    d.prepare(`
      UPDATE leads SET
        contact_name = COALESCE(?, contact_name),
        package = COALESCE(?, package),
        status = COALESCE(?, status),
        data_json = ?,
        updated_at = ?
      WHERE customer_id = ? AND contact_phone = ?
    `).run(
      data.contact_name ?? null,
      data.package ?? null,
      data.status ?? null,
      JSON.stringify(merged),
      now,
      data.customer_id,
      data.contact_phone
    )
    return existing.id
  } else {
    const id = `lead_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const initialData = data.data ?? {}

    d.prepare(`
      INSERT INTO leads (id, customer_id, contact_phone, contact_name, package, status, data_json, source, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      data.customer_id,
      data.contact_phone,
      data.contact_name ?? null,
      data.package ?? null,
      data.status ?? 'Inquiry',
      JSON.stringify(initialData),
      data.source ?? 'whatsapp_bot',
      now,
      now
    )
    return id
  }
}
