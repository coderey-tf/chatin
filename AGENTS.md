# Chatin — Multi-Tenant WhatsApp Business API Dashboard

Technical documentation for AI agents and developers.

## What is Chatin?

Chatin is a **multi-tenant WhatsApp Business API dashboard** that lets you (the operator) onboard multiple business clients onto a single WhatsApp gateway powered by [KirimDev](https://kirimdev.com). Each client gets their own WhatsApp Business Account (WABA) connected via Meta Embedded Signup, and can use a built-in **generic chatbot lead collector** to automatically capture customer leads from incoming WhatsApp chats.

**Live**: `chatin.coderey.dev`  
**Stack**: Next.js 16, React 19, TypeScript 5, Tailwind CSS 4, SQLite (better-sqlite3), KirimDev SDK  
**Deploy**: VPS (PM2, port 3004), nginx reverse proxy  

---

## Architecture

```
                     ┌────────────────────────────┐
                     │  Customer's WhatsApp        │
                     │  Business Account (WABA)    │
                     └────────────┬───────────────┘
                                  │ Meta Cloud API
                                  ▼
┌─────────────────────────────────────────────────────────┐
│                    KIRIMDEV PLATFORM                      │
│  Official Meta BSP • Multi-tenant • Webhooks             │
│  Business plan: 10 WA accounts, 1M messages/month        │
│  Meta Cloud API fees (Rp 87-438/conv) PASS-THROUGH       │
│  — billed directly to each client's WABA account.        │
└────────────┬────────────────────────────┬────────────────┘
             │ SDK / REST API             │ Webhooks
             ▼                            ▼
┌─────────────────────────────────────────────────────────┐
│                    CHATIN (this app)                      │
│  Next.js 16 • Port 3004 • PM2                            │
│                                                          │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────┐  │
│  │ Dashboard UI │  │  API Routes  │  │  Chat Engine   │  │
│  │ /dashboard/* │  │  /api/*      │  │  (lead collector│ │
│  └─────────────┘  └──────────────┘  │  + auto-reply)  │  │
│                                     └────────────────┘  │
│  ┌─────────────┐  ┌──────────────┐                      │
│  │  KirimDev   │  │  SQLite DB   │                      │
│  │  SDK        │  │  chatin.db   │                      │
│  └─────────────┘  └──────────────┘                      │
└─────────────────────────────────────────────────────────┘
```

---

## Database Schema (SQLite)

File: `chatin.db` (auto-created by `src/lib/db.ts` on first call)

### customers
One row per client (tenant). ID comes from KirimDev's customer system.

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | KirimDev customer ID (e.g. `cus_xxx`) |
| name | TEXT | Business name |
| status | TEXT | `pending`, `active`, `archived` |
| phone_number_id | TEXT | Meta phone_number_id (from webhook) |
| phone_number | TEXT | Human-readable phone (e.g. `+628123456789`) |
| onboarded_at | TEXT | When they completed Embedded Signup |

### bot_configs
One row per customer. Stores the chatbot configuration as **flexible JSON** — any industry, any fields.

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | `bc_xxx` |
| customer_id | TEXT FK → customers | UNIQUE (one config per customer) |
| industry_preset | TEXT | `wedding_decor`, `jasa_rental`, `klinik`, `toko_online`, `generic` |
| enabled | INTEGER | 1=active, 0=disabled |
| fields_json | TEXT (JSON) | `BotField[]` — what data to collect from chats |
| templates_json | TEXT (JSON) | `{greeting: "...", followup: "..."}` |
| pricelist_links_json | TEXT (JSON) | `{"Wedding Gedung": "https://...", ...}` |

### leads
One row per contact phone per customer. Collected data stored as JSON.

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | `lead_xxx` |
| customer_id | TEXT FK → customers | |
| contact_phone | TEXT | WhatsApp number (unique per customer) |
| contact_name | TEXT | Extracted name (denormalized for fast queries) |
| package | TEXT | Computed package label (e.g. "Wedding + Gedung") |
| status | TEXT | `Inquiry`, `Contacted`, `Booked`, `DP Paid`, `Completed`, `Cancelled` |
| data_json | TEXT (JSON) | Full field data: `{name, event_date, venue_type, ...}` |
| source | TEXT | `whatsapp_bot`, `web`, `manual` |

### message_logs
Audit trail of all messages sent/received.

### webhook_events
Raw webhook payloads from KirimDev (audit + replay).

### setup_links
One-time links for Meta Embedded Signup onboarding.

---

## Chat Engine (Lead Collector)

The chat engine is a **generic, template-driven** system that works for ANY industry. It implements a 4-step funnel:

```
Step 1: Greeting
  Customer says "Halo" → Bot sends form asking for defined fields
  (fields come from bot_configs.fields_json)

Step 2: Extract
  Customer replies with their info → Regex parser extracts field values
  (keyword matching, date parsing, name extraction, location detection)

Step 3: Pricelist + Handover
  When all required fields filled → Save lead to DB, send pricelist link,
  then go silent (autoReply=false, handoverToAdmin=true)

Step 4: Follow-up
  If incomplete → Bot asks only for missing fields
```

### Field Types (`BotField`)

```typescript
interface BotField {
  key: string      // data key: "name", "event_date", "venue_type"
  label: string    // display label: "Nama", "Tanggal Acara"
  emoji: string    // UI emoji: "👤", "📅"
  type: 'text' | 'date' | 'select' | 'keyword' | 'location'
  required: boolean
  // For 'keyword' type:
  keywords?: Record<string, string[]>  // { "Wedding": ["nikah", "wedding", ...] }
  // For 'select' type:
  options?: string[]  // ["Pria", "Wanita"]
  // For default value (optional field):
  default_value?: string  // "Belum pasti"
}
```

| type | What it extracts | Example |
|------|------------------|---------|
| `text` | Free text. Special case for field `key="name"`: uses regex to find names after "Nama:", "Saya", "Perkenalkan" etc. | "Budi" from "Nama saya Budi" |
| `keyword` | Matches keywords in message to specific values | "nikah" → `Wedding`, "lamaran" → `Engagement` |
| `select` | Matches options literally (case-insensitive) | "gedung" if options include "Gedung" |
| `date` | Indonesian date formats: "20 Oktober 2026", "20/10/2026", "2026-10-20" | `2026-10-20` |
| `location` | Indonesian cities/areas (hardcoded list of ~30) | "Jakarta", "Bandung" |

### Industry Templates (presets)

5 built-in presets in `src/lib/industry-templates.ts`:

| Key | Name | Fields collected |
|-----|------|-----------------|
| `wedding_decor` | Wedding & Decoration | name, event_date, event_type (Wedding/Engagement), venue_type (Gedung/Rumah) |
| `jasa_rental` | Jasa Rental | name, item_type (Mobil/Kamera/Alat Berat), rental_date, location |
| `klinik` | Klinik / Dokter | name, service (Umum/Gigi/Kecantikan), visit_date |
| `toko_online` | Toko Online | name, item_wanted, location |
| `generic` | Bisnis Umum | name, inquiry, date, location |

Users can fully customize fields after selecting a preset via the dashboard.

### Response Format (same as Sebelas Decor's /api/chat)

```json
{
  "reply": "text to send to customer (empty string if handover)",
  "leadSaved": true,
  "leadData": {
    "field_values": {"name": "Budi", "event_type": "Wedding", ...},
    "is_complete": true,
    "missing_fields": []
  },
  "autoReply": true,
  "handoverToAdmin": true
}
```

- `autoReply=false` + `handoverToAdmin=true` → Bot stays silent, human admin takes over.
- `autoReply=true` + `reply` not empty → Bot sends the reply automatically.

---

## API Routes

### Public (no auth required)

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/chat` | Main chat endpoint. Send message, get bot response. |
| `POST` | `/api/webhooks/kirimdev` | KirimDev webhook receiver (handles inbound messages, customer events, message status) |
| `POST` | `/api/auth/login` | Login with CHATIN_AUTH_TOKEN |
| `GET` | `/onboarded` | Meta Embedded Signup success redirect |
| `GET` | `/onboard-failed` | Meta Embedded Signup failure redirect |
| `GET` | `/` | Landing page |

### Protected (Bearer token or cookie required)

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/customers` | List all customers |
| `GET` | `/api/customers/:id` | Get customer detail |
| `DELETE` | `/api/customers/:id` | Archive customer |
| `POST` | `/api/customers/:id/setup-link` | Generate Embedded Signup link |
| `GET/PUT` | `/api/customers/:id/chat-settings` | Get/save bot config (fields, templates, pricelist links) |
| `GET/POST` | `/api/customers/:id/leads` | List/create leads |
| `GET/POST` | `/api/messages` | List/send messages |
| `GET` | `/dashboard/*` | Admin dashboard |

### POST /api/chat (main endpoint)

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

| Field | Required | Notes |
|-------|----------|-------|
| message | ✅ | Incoming message text |
| customer_id | ✅ (or auto-detect) | Chatin customer ID |
| phone | Optional | Customer's WhatsApp number (for lead dedup) |
| history | Optional | `[{role: "user"|"assistant", content: "..."}]` |
| business_name | Optional | Override business name in greeting |
| source | Optional | `whatsapp_bot` (default), `web`, `manual` |

**Response:** See "Response Format" above.

### POST /api/webhooks/kirimdev

KirimDev forwards Meta Cloud API events here. This route:
1. Saves raw webhook to `webhook_events` table (audit)
2. Handles `customer.onboarded` → creates/updates customer + phone_number_id
3. Handles `message.*` status → updates message_logs
4. **Handles inbound messages** (any event containing a message body):
   - Finds the customer by `phone_number_id`
   - Loads their `bot_config`
   - Runs the chat engine
   - If `autoReply=true` → sends reply back via KirimDev API
   - If lead complete → saves lead to `leads` table

---

## File Structure

```
/var/www/chatin/
├── AGENTS.md                          # This file (AI agent context)
├── middleware.ts                       # Auth middleware (Bearer token or cookie)
├── next.config.ts                     # Next.js config
├── chatin.db                          # SQLite database (gitignored)
├── .env                               # Secrets (gitignored)
│
├── src/lib/
│   ├── db.ts                          # Database schema + all helper functions
│   ├── kirimdev.ts                    # KirimDev SDK client singleton
│   ├── webhook-verify.ts             # HMAC webhook signature verification
│   ├── lead-parser.ts                # Generic field extraction (regex, keywords, dates)
│   ├── chat-engine.ts                # 4-step funnel engine + industry templates
│   └── industry-templates.ts         # Industry preset definitions (5 templates)
│
├── src/app/
│   ├── page.tsx                        # Landing page
│   ├── layout.tsx                      # Root layout
│   ├── login/page.tsx                  # Login page
│   ├── onboarded/page.tsx              # Meta signup success page
│   ├── onboard-failed/page.tsx         # Meta signup failure page
│   │
│   ├── api/
│   │   ├── chat/route.ts              # POST /api/chat — public chat endpoint
│   │   ├── auth/login/route.ts        # POST /api/auth/login
│   │   ├── customers/route.ts         # GET/POST /api/customers
│   │   ├── customers/[id]/route.ts    # GET/DELETE /api/customers/:id
│   │   ├── customers/[id]/setup-link/ # POST /api/customers/:id/setup-link
│   │   ├── customers/[id]/chat-settings/ # GET/PUT bot config
│   │   ├── customers/[id]/leads/      # GET/POST leads
│   │   ├── messages/route.ts          # GET/POST messages
│   │   └── webhooks/kirimdev/route.ts # POST webhook receiver + auto-reply
│   │
│   └── dashboard/
│       ├── page.tsx                    # Dashboard overview (stats)
│       ├── layout.tsx                  # Dashboard layout (nav, auth)
│       ├── messages/page.tsx           # Message logs
│       └── customers/
│           ├── page.tsx                # Customer list
│           ├── new/page.tsx            # Add customer
│           └── [id]/
│               ├── page.tsx            # Customer detail (WA status, send test)
│               ├── bot/page.tsx        # Bot settings (template, fields, pricelist)
│               └── leads/page.tsx      # Leads list (filter, stats, expand)
```

---

## Environment Variables

```
# KirimDev API (required)
KIRIMDEV_API_KEY=kdv_xxx              # From dashboard.kirimdev.com
KIRIMDEV_PHONE_NUMBER_ID=xxx          # Your platform's phone_number_id
KIRIMDEV_TEAM_ID=xxx                  # KirimDev team ID
KIRIMDEV_APP_URL=https://chatin.coderey.dev  # For redirect URLs

# Webhook (optional but recommended)
KIRIMDEV_WEBHOOK_SECRET=xxx           # HMAC secret for webhook verification

# Auth (required for dashboard)
CHATIN_AUTH_TOKEN=xxx                 # Bearer token for dashboard access
```

---

## Business Model Context

Chatin is a **B2B2C SaaS reseller platform**:

- **Operator (you)**: Pays KirimDev Business plan (Rp 199k/month) + VPS (Rp 100k/month) = **Rp 299k fixed/month**
- **Clients (your customers)**: Pay you a subscription (Rp 75k-249k/month) for:
  - 1-N WhatsApp Business Accounts (connected via Embedded Signup)
  - Dashboard to manage messages, leads, templates
  - Built-in chatbot lead collector
  - Meta Cloud API fees (Rp 87-438/conversation) are **pass-through** — billed directly to each client's WABA, NOT to you
- **Margin**: ~60-80% gross per client. BEP at 4 clients.

KirimDev handles:
- Meta API proxying (messages, templates, webhooks)
- Customer onboarding (Embedded Signup)
- HMAC webhook delivery
- Rate limiting (60 write/min, 600 read/min)

---

## How KirimDev Platform Mode Works

1. You are the "platform owner" with one KirimDev account
2. Each of your clients is a "customer" in KirimDev's system
3. When a client completes Meta Embedded Signup (via your setup link), KirimDev creates a `customer` entity and connects their WABA
4. You can then send messages **on behalf of** that customer by using their `phone_number_id` in API calls
5. KirimDev forwards all Meta webhooks (inbound messages, delivery status) to your `/api/webhooks/kirimdev` endpoint
6. The SDK (`@kirimdev/sdk`) provides TypeScript wrappers for all API endpoints

---

## Key Design Decisions

1. **SQLite + JSON (not Firebase/Postgres)**: Zero external deps, no billing, no latency. `fields_json TEXT` + `JSON.parse()` = flexible NoSQL-like storage. Good for 1k-50k leads per customer.

2. **Generic engine (not Sebelas-specific)**: The chat engine works for ANY industry. Fields, templates, and pricelist links are all stored as JSON per customer. Industry presets are just convenience templates.

3. **Pass-through Meta fees**: Chatin does NOT pay Meta conversation fees. Those are billed directly to each client's own WABA billing account. Chatin only pays KirimDev's platform subscription.

4. **Public /api/chat**: This endpoint must be accessible without auth because it's called by external integrators (webhooks, RAG backends, etc.). The bot config is the security boundary — if no config exists for a customer_id, the endpoint returns autoReply=false.

5. **Lead dedup by phone**: Each (customer_id, contact_phone) pair is unique. If the same phone contacts again after being captured, the bot returns autoReply=false (silent handover to human admin).
