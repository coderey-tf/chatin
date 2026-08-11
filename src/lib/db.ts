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
  const db = getDb()
  const stmt = db.prepare(`
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
  `)
  stmt.run(
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
