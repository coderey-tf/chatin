# Project Briefing: Chatin

> **Copy this entire document as a prompt to onboard Antigravity (or any AI agent) to this project.**

---

## 1. What is Chatin?

**Chatin** is a multi-tenant WhatsApp Business API SaaS dashboard. It lets an operator (us) onboard multiple business clients onto a single WhatsApp gateway. Each client connects their own WhatsApp Business Account (WABA) via Meta Embedded Signup, and gets access to:

- A dashboard to send/receive WhatsApp messages
- A built-in **generic chatbot** that automatically collects customer leads from incoming WhatsApp chats
- Industry-specific templates (wedding decoration, clinic, rental shop, online store, etc.)

**Live**: https://chatin.coderey.dev  
**GitHub**: https://github.com/coderey-tf/chatin  
**VPS path**: `/var/www/chatin/`  
**PM2 process**: `chatin` (port 3004)  

---

## 2. Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router) |
| UI | React 19, Tailwind CSS 4 |
| Language | TypeScript 5 |
| Database | SQLite via `better-sqlite3` |
| WhatsApp API | KirimDev SDK (`@kirimdev/sdk`) — official Meta Cloud API BSP |
| Deployment | PM2 on VPS, nginx reverse proxy, HTTPS |

No external databases, no Firebase, no Postgres. SQLite with JSON columns for flexible schema.

---

## 3. Architecture

```
WhatsApp Customer
       │
       ▼ Meta Cloud API
KirimDev Platform (official Meta BSP)
       │
       ├── SDK calls ──► Chatin API (send messages, manage customers)
       │
       └── Webhooks ──► Chatin /api/webhooks/kirimdev
                             │
                             ├── Inbound message → Chat Engine → Auto-reply back to WA
                             ├── Customer onboarded → Create/update customer record
                             └── Message status → Update delivery logs
```

**Key concept**: Chatin is the **platform owner**. Each client is a "customer" in the system. When a customer completes Embedded Signup, KirimDev connects their WABA and forwards their webhooks to Chatin.

**Billing model**:
- Operator pays: KirimDev Rp199k/mo + VPS Rp100k/mo = **Rp299k fixed**
- Clients pay: Rp75k–Rp249k/mo subscription
- Meta Cloud API fees (Rp87–Rp438/conversation) are **pass-through** — billed directly to each client's WABA, NOT to the operator
- Break-even: 4 clients

---

## 4. Database Schema (SQLite)

All tables are in `chatin.db` (auto-created by `src/lib/db.ts`).

### `customers` — One row per client tenant
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | KirimDev customer ID (e.g. `cus_xxx`) |
| name | TEXT | Business name |
| status | TEXT | `pending`, `active`, `archived` |
| phone_number_id | TEXT | Meta phone_number_id (set by webhook after onboarding) |
| phone_number | TEXT | Human-readable phone (e.g. `+628123456789`) |
| onboarded_at | TEXT | ISO timestamp when Embedded Signup completed |

### `bot_configs` — Chatbot configuration per customer (flexible JSON)
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | `bc_xxx` |
| customer_id | TEXT FK | UNIQUE — one config per customer |
| industry_preset | TEXT | `wedding_decor`, `jasa_rental`, `klinik`, `toko_online`, `generic` |
| enabled | INTEGER | 1=active, 0=disabled |
| fields_json | TEXT | JSON array of `BotField[]` — what data to collect |
| templates_json | TEXT | JSON `{greeting: "...", followup: "..."}` |
| pricelist_links_json | TEXT | JSON `{"Wedding Gedung": "https://...", ...}` |

### `leads` — Captured leads per customer (flexible JSON)
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | `lead_xxx` |
| customer_id | TEXT FK | |
| contact_phone | TEXT | WhatsApp number (UNIQUE per customer) |
| contact_name | TEXT | Denormalized for fast queries |
| package | TEXT | Computed label like "Wedding + Gedung" |
| status | TEXT | `Inquiry`, `Contacted`, `Booked`, `DP Paid`, `Completed`, `Cancelled` |
| data_json | TEXT | Full field data as JSON |
| source | TEXT | `whatsapp_bot`, `web`, `manual` |

### Other tables
- `message_logs` — Audit trail of all messages sent/received
- `webhook_events` — Raw webhook payloads (audit + replay)
- `setup_links` — One-time Meta Embedded Signup links

---

## 5. Chat Engine (Lead Collector)

The chat engine is **generic and template-driven**. It works for any industry. The bot_config's `fields_json` defines what to ask. The engine implements a 4-step funnel:

```
Step 1: GREETING
  Customer sends "Halo" → Bot sends a form asking for defined fields
  Fields come from bot_configs.fields_json

Step 2: EXTRACT
  Customer replies → Regex parser extracts values from their message
  Supports: keyword matching, date parsing, name extraction, location detection

Step 3: PRICELIST + HANDOVER
  When ALL required fields are filled:
    → Save lead to DB
    → Send pricelist link (from bot_configs.pricelist_links_json)
    → Go silent (autoReply=false, handoverToAdmin=true)
    → Human admin takes over

Step 4: FOLLOW-UP (if incomplete)
  If required fields are still missing → Bot asks only for the missing ones
```

### Field Types (`BotField` interface)

```typescript
interface BotField {
  key: string       // Data key: "name", "event_date", "venue_type"
  label: string     // Display label: "Nama", "Tanggal Acara"
  emoji: string     // UI emoji: "👤", "📅"
  type: 'text' | 'date' | 'select' | 'keyword' | 'location'
  required: boolean
  keywords?: Record<string, string[]>  // For 'keyword' type
  options?: string[]                    // For 'select' type
  default_value?: string                // Fallback if not provided
}
```

| type | Behavior | Example |
|------|----------|---------|
| `text` | Free text. Special: if `key="name"`, uses regex to extract names after "Nama:", "Saya", etc. | "Budi" from "Nama saya Budi, mau nikah" |
| `keyword` | Matches keywords in message → maps to a value | "nikah" → "Wedding", "lamaran" → "Engagement" |
| `select` | Literal match (case-insensitive) | "gedung" → "Gedung" |
| `date` | Indonesian date formats: "20 Oktober 2026", "20/10/2026" | → `2026-10-20` |
| `location` | Indonesian cities (hardcoded list) | "Bandung" → "Bandung" |

### Industry Presets (5 built-in)

| Key | Name | Fields |
|-----|------|--------|
| `wedding_decor` | Wedding & Decoration | name, event_date, event_type (Wedding/Engagement), venue_type (Gedung/Rumah) |
| `jasa_rental` | Rental Service | name, item_type (Mobil/Kamera/Alat Berat), rental_date, location |
| `klinik` | Clinic / Doctor | name, service (Umum/Gigi/Kecantikan), visit_date |
| `toko_online` | Online Store | name, item_wanted, location |
| `generic` | General Business | name, inquiry, date, location |

Users select a preset, then can fully customize fields via the dashboard.

---

## 6. API Endpoints

### Public (no auth)

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/chat` | **Main endpoint** — send a message, get bot response |
| POST | `/api/webhooks/kirimdev` | Webhook receiver from KirimDev/Meta |
| POST | `/api/auth/login` | Dashboard login |
| GET | `/onboarded` | Meta Embedded Signup success redirect |
| GET | `/onboard-failed` | Meta Embedded Signup failure redirect |

### Protected (Bearer token or session cookie)

| Method | Path | Purpose |
|--------|------|---------|
| GET/POST | `/api/customers` | List or create customers |
| GET/DELETE | `/api/customers/:id` | Get or archive a customer |
| POST | `/api/customers/:id/setup-link` | Generate Embedded Signup link |
| GET/PUT | `/api/customers/:id/chat-settings` | Get or save bot config |
| GET/POST | `/api/customers/:id/leads` | List or create leads |
| GET/POST | `/api/messages` | List or send messages |

### POST /api/chat — Request/Response

**Request:**
```json
{
  "message": "Halo, saya mau nikah di gedung",
  "customer_id": "cus_xxx",
  "phone": "+628123456789",
  "history": [{"role": "user", "content": "Halo"}],
  "business_name": "Sebelas Decor",
  "source": "whatsapp_bot"
}
```

**Response:**
```json
{
  "reply": "Halo Kak! Selamat datang di Sebelas Decor...",
  "leadSaved": false,
  "leadData": {
    "field_values": {"event_type": "Wedding", "venue_type": "Gedung"},
    "is_complete": false,
    "missing_fields": ["name", "event_date"]
  },
  "autoReply": true,
  "handoverToAdmin": false
}
```

When `autoReply=false` + `handoverToAdmin=true`, the bot goes silent and a human admin takes over the conversation.

---

## 7. File Structure

```
/var/www/chatin/
├── AGENTS.md                           # Full technical docs (read this for deep context)
├── middleware.ts                        # Auth middleware (Bearer token / cookie)
├── next.config.ts
├── chatin.db                           # SQLite database (gitignored)
├── .env                                # Secrets (gitignored)
├── .env.example                        # Template for env vars
│
├── src/lib/
│   ├── db.ts                           # Schema init + all DB helper functions
│   ├── kirimdev.ts                     # KirimDev SDK singleton
│   ├── webhook-verify.ts              # HMAC webhook signature verification
│   ├── lead-parser.ts                 # Generic field extraction engine
│   ├── chat-engine.ts                 # 4-step funnel logic + INDUSTRY_TEMPLATES
│   └── industry-templates.ts          # Industry preset metadata (name, icon, description)
│
├── src/app/
│   ├── page.tsx                         # Landing page
│   ├── login/page.tsx                   # Login
│   ├── onboarded/page.tsx              # Signup success
│   ├── onboard-failed/page.tsx         # Signup failure
│   │
│   ├── api/
│   │   ├── chat/route.ts              # POST /api/chat — public, core chat endpoint
│   │   ├── auth/login/route.ts        # POST login
│   │   ├── customers/route.ts         # GET/POST customers
│   │   ├── customers/[id]/route.ts    # GET/DELETE customer
│   │   ├── customers/[id]/setup-link/route.ts
│   │   ├── customers/[id]/chat-settings/route.ts  # GET/PUT bot config
│   │   ├── customers/[id]/leads/route.ts           # GET/POST leads
│   │   ├── messages/route.ts          # GET/POST messages
│   │   └── webhooks/kirimdev/route.ts # Webhook receiver + auto-reply
│   │
│   └── dashboard/
│       ├── page.tsx                     # Stats overview
│       ├── layout.tsx                   # Nav + auth wrapper
│       ├── messages/page.tsx           # Message logs
│       └── customers/
│           ├── page.tsx                 # Customer list
│           ├── new/page.tsx            # Add customer
│           └── [id]/
│               ├── page.tsx             # Customer detail + WA connection
│               ├── bot/page.tsx         # Bot settings (template, fields, pricelist)
│               └── leads/page.tsx       # Leads list with filters + stats
```

---

## 8. Environment Variables

```
# KirimDev API (required)
KIRIMDEV_API_KEY=kdv_xxx
KIRIMDEV_PHONE_NUMBER_ID=xxx
KIRIMDEV_TEAM_ID=xxx
KIRIMDEV_APP_URL=https://chatin.coderey.dev

# Webhook (recommended)
KIRIMDEV_WEBHOOK_SECRET=

# Dashboard auth (required)
CHATIN_AUTH_TOKEN=
```

---

## 9. How to Work With This Project

### Running locally
```bash
cd /var/www/chatin
cp .env.example .env   # Fill in your KirimDev credentials
pnpm install
pnpm dev               # Dev server on :3000
```

### Building & deploying
```bash
pnpm build             # TypeScript check + Next.js build
pm2 restart chatin     # Restart production process
```

### Testing the chat endpoint
```bash
curl -X POST http://localhost:3004/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"Halo","customer_id":"cus_test","phone":"62812345001"}'
```

### Key conventions
- **All DB functions** are in `src/lib/db.ts` — import `getDb()`, `upsertCustomer()`, `getLeadByPhone()`, etc.
- **Chat engine** is pure functions in `src/lib/chat-engine.ts` — `handleChat()` takes a message + bot config, returns `{reply, autoReply, leadSaved, leadData, handoverToAdmin}`
- **Lead parser** is in `src/lib/lead-parser.ts` — `extractFromText()` extracts field values from a single message, `isGreeting()` checks if a message is just a greeting
- **Industry templates** are defined inline in `src/lib/chat-engine.ts` (the `INDUSTRY_TEMPLATES` constant). The UI-facing metadata is in `src/lib/industry-templates.ts`
- **SQLite schema** is auto-initialized in `db.ts` `getDb()` — tables are created on first call if they don't exist
- **Webhook handling** is in `src/app/api/webhooks/kirimdev/route.ts` — handles inbound messages, customer events, message status updates, and triggers the chat engine for auto-reply
- **Auth middleware** (`middleware.ts`) protects `/dashboard/*` and most `/api/*` routes. `/api/chat`, `/api/webhooks/*`, `/api/auth/*` are public

### Important design decisions
1. SQLite + JSON columns (not Firebase/Postgres) — zero external deps, flexible schema
2. The chat engine is **generic** — works for any industry via configurable fields
3. Meta fees are **pass-through** — Chatin only pays KirimDev platform subscription
4. `/api/chat` is public — security boundary is the bot_config (no config = no auto-reply)
5. Lead dedup by `(customer_id, contact_phone)` — same phone re-contacting = silent handover

---

## 10. What's Next (Roadmap)

- [ ] Customer portal (clients can self-manage their WA + bot settings)
- [ ] Broadcast / bulk message (CSV upload + variable substitution)
- [ ] Scheduled / recurring messages
- [ ] Shared inbox / multi-agent (1 WA, multiple CS agents)
- [ ] AI auto-reply (LLM-powered FAQ, integration with RAG backends)
- [ ] Analytics per customer (delivery rate, peak hours, top contacts)
- [ ] Billing / quota enforcement per client
- [ ] Landing page with pricing tiers
