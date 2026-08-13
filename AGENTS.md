# Chatin — Multi-Tenant WhatsApp Business API Dashboard

Technical documentation for AI agents and developers.

## What is Chatin?

Chatin is a **multi-tenant WhatsApp Business API dashboard** that lets you (the operator) onboard multiple business clients onto a single WhatsApp gateway powered by [KirimDev](https://kirimdev.com). Each client gets their own WhatsApp Business Account (WABA) connected via Meta Embedded Signup, and can use a built-in **generic chatbot lead collector** to automatically capture customer leads from incoming WhatsApp chats.

**Live**: `chatin.coderey.dev`  
**Stack**: Next.js 16, React 19, TypeScript 5, Tailwind CSS 4, Supabase (PostgreSQL + Auth + Realtime), KirimDev SDK  
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
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────┐  │
│  │  KirimDev   │  │ Supabase Auth│  │ Live Inbox     │  │
│  │  SDK        │  │ & PostgreSQL │  │ (Realtime WS)  │  │
│  └─────────────┘  └──────────────┘  └────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

---

## Database Schema (Supabase PostgreSQL)

Migration file: `supabase/migrations/001_initial_schema.sql` (Auto-managed via Supabase REST API & Service Role client `src/lib/supabase/admin.ts`).

### profiles
Stores user profile information, auto-created upon signup via PostgreSQL trigger `on_auth_user_created`.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | References `auth.users(id)` |
| full_name | TEXT | Display name |
| avatar_url | TEXT | Profile avatar / Google account picture |
| role | TEXT | Default `'admin'` |
| is_onboarded | BOOLEAN | `true`=completed onboarding wizard, `false`=needs onboarding |
| last_active_at | TIMESTAMPTZ | Updated on activity (used for 60-day cleanup) |

### customers
One row per client (tenant). ID comes from KirimDev's customer system.

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | KirimDev customer ID (e.g. `cus_xxx`) |
| name | TEXT | Business name |
| email | TEXT | Business contact email |
| status | TEXT | `pending`, `active`, `archived` |
| phone_number_id | TEXT | Meta phone_number_id (from webhook) |
| phone_number | TEXT | Human-readable phone (e.g. `+628123456789`) |
| onboarded_at | TIMESTAMPTZ | When they completed Embedded Signup |

### bot_configs
One row per customer. Stores the chatbot configuration as **native JSONB** — any industry, any fields.

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | `bc_xxx` |
| customer_id | TEXT FK → customers | UNIQUE (one config per customer) |
| industry_preset | TEXT | `wedding_decor`, `jasa_rental`, `klinik`, `toko_online`, `generic` |
| enabled | BOOLEAN | `true`=active, `false`=disabled |
| fields_json | JSONB | `BotField[]` — what data to collect from chats |
| templates_json | JSONB | `{greeting: "...", followup: "..."}` |
| pricelist_links_json | JSONB | `{"Wedding Gedung": "https://...", ...}` |

### leads
One row per contact phone per customer. Partial data saved from first message.

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | `lead_xxx` |
| customer_id | TEXT FK → customers | |
| contact_phone | TEXT | WhatsApp number (unique per customer) |
| contact_name | TEXT | Extracted name |
| package | TEXT | Computed package label (e.g. "Wedding + Gedung") |
| status | TEXT | `Inquiry`, `Contacted`, `Booked`, `DP Paid`, `Completed`, `Cancelled` |
| data_json | JSONB | Full field data: `{name, event_date, venue_type, ...}` |
| source | TEXT | `whatsapp_bot`, `web`, `manual` |
| last_inbound_at | TIMESTAMPTZ | Timestamp of last customer message (used for 24h window calculation) |

### message_logs
Audit trail of all messages sent/received. Subscribed via Supabase Realtime WebSocket for Live Inbox.

### subscriptions & invoices
Customer SaaS billing & plan tier limits (`starter`, `pro`, `enterprise`).

---

## Authentication & Network Proxying

Chatin uses **Supabase Auth** with full support for:
1. **Google OAuth 2.0**: Single click login/signup via Google.
2. **Email & Password**: Open registration ([/register](file:///d:/Project%20Website/chatin/src/app/register/page.tsx)) and login ([/login](file:///d:/Project%20Website/chatin/src/app/login/page.tsx)).
3. **Next.js 16 Proxy / Middleware**: Request proxying and JWT session verification are implemented in [src/proxy.ts](file:///d:/Project%20Website/chatin/src/proxy.ts) and delegated by [middleware.ts](file:///d:/Project%20Website/chatin/middleware.ts).
4. **Server Component Auth Guard**: [DashboardLayout](file:///d:/Project%20Website/chatin/src/app/dashboard/layout.tsx) validates the session server-side (`if (!user) redirect('/login')`) before rendering dashboard pages or making DB queries.
5. **Cleanup Policy**: Users inactive for over 60 days are cleaned up automatically via scheduled cron tasks.

---

## Live Conversation Inbox

Available at `/dashboard/inbox`:
- **3-Column KirimDev Inspired Layout**:
  - **Left Column**: Contact list, search filter, status pills (`Semua`, `Terbuka`, `Closed`), and tenant switcher.
  - **Middle Column**: Active chat thread header with badge alignment fix (`✅ Jendela 24j Terbuka`), KirimDev dark green/grey WhatsApp chat bubbles (`#005c4b` / `#202c33`), WhatsApp Markdown parser (`*bold*`, `_italic_`, links), status tick marks (`✓✓`), and multiline reply bar (`Shift+Enter`).
  - **Right Column (Pelanggan & Lead Detail Sidebar)**: KirimDev-style customer profile card and real-time inspection of captured lead form fields (`name`, `event_date`, `venue_type`, `package`, lead status).
- **Supabase Realtime**: Connects via WebSocket (`supabase.channel('inbox-live-realtime')`) to render inbound/outbound messages and status updates instantly.
- **24h Window Badge**: Computes remaining time for Meta 24h customer service window (`✅ 24j Terbuka (23j 54m tersisa)` / `⏰ Closed`).
- **Direct Reply**: `/api/inbox/[phone]` allows admins to reply directly via KirimDev SDK if within 24h.
- **Mark As Read**: Webhook receiver automatically triggers `markAsRead(wamid)` via KirimDev SDK.

---

## Subscription & Billing System

Available at `/dashboard/billing`:
- **Plan Tiers**:
  - `starter`: Rp 75.000 / bulan (1 WABA, 500 Leads)
  - `pro`: Rp 149.000 / bulan (3 WABA, 3.000 Leads, Live Realtime Inbox)
  - `enterprise`: Rp 249.000 / bulan (10 WABA, Unlimited Leads)
- **Agnostic Payment Webhook**: Endpoint `/api/webhooks/payment` accepts payment notifications from Xendit, Midtrans, Mayar.id, or Tripay, updating invoice status to `paid` and extending subscription by +30 days.

---

## Chat Engine (Lead Collector)

The chat engine is a **generic, template-driven** system in `src/lib/chat-engine.ts`. Single source of truth for presets and fields is maintained in `src/lib/industry-templates.ts`.

### Field Types (`BotField`)

```typescript
interface BotField {
  key: string      // data key: "name", "event_date", "venue_type"
  label: string    // display label: "Nama", "Tanggal Acara"
  emoji: string    // UI emoji: "👤", "📅"
  type: 'text' | 'date' | 'select' | 'keyword' | 'location'
  required: boolean
  keywords?: Record<string, string[]>
  options?: string[]
  default_value?: string
}
```

---

## File Structure

```
/var/www/chatin/
├── AGENTS.md                          # This file (AI agent context)
├── middleware.ts                       # Supabase Auth middleware (JWT session check)
├── next.config.ts                     # Next.js 16 config
├── chatin-context.txt                 # Short prompt context summary
├── .env                               # Secrets & credentials (gitignored)
│
├── supabase/
│   └── migrations/
│       └── 001_initial_schema.sql     # Supabase DDL schema, RLS, & Realtime
│
├── src/lib/
│   ├── db.ts                          # Supabase DB helper functions (async)
│   ├── kirimdev.ts                    # KirimDev SDK lazy initialization & Proxy
│   ├── webhook-verify.ts             # HMAC webhook signature verification
│   ├── lead-parser.ts                # Generic field extraction (regex, keywords, dates)
│   ├── chat-engine.ts                # 4-step funnel engine
│   ├── industry-templates.ts         # Single source of truth for 5 industry presets
│   └── supabase/
│       ├── server.ts                  # Server client (@supabase/ssr)
│       ├── client.ts                  # Browser client (@supabase/ssr)
│       └── admin.ts                   # Service role admin client (bypasses RLS)
│
├── src/app/
│   ├── page.tsx                        # Landing page
│   ├── layout.tsx                      # Root layout
│   ├── login/page.tsx                  # Login page (Google OAuth + Email/Password)
│   ├── register/page.tsx               # Registration page
│   ├── auth/callback/route.ts          # OAuth callback exchanger
│   ├── onboarded/page.tsx              # Meta signup success page
│   ├── onboard-failed/page.tsx         # Meta signup failure page
│   │
│   ├── api/
│   │   ├── chat/route.ts              # POST /api/chat — public chat endpoint
│   │   ├── auth/login/route.ts        # POST /api/auth/login
│   │   ├── auth/logout/route.ts       # POST /api/auth/logout
│   │   ├── billing/route.ts           # GET/POST subscription & invoices
│   │   ├── customers/route.ts         # GET/POST customers
│   │   ├── customers/[id]/route.ts    # GET/DELETE customer
│   │   ├── customers/[id]/setup-link/ # POST setup link
│   │   ├── customers/[id]/chat-settings/ # GET/PUT bot config
│   │   ├── customers/[id]/leads/      # GET/POST leads
│   │   ├── customers/[id]/leads/[leadId]/ # PATCH/DELETE lead item
│   │   ├── inbox/route.ts             # GET inbox contacts
│   │   ├── inbox/[phone]/route.ts     # GET thread & POST 24h reply
│   │   ├── messages/route.ts          # GET/POST message logs
│   │   ├── webhooks/kirimdev/route.ts # POST KirimDev webhook receiver
│   │   └── webhooks/payment/route.ts  # POST Payment gateway webhook receiver
│   │
│   └── dashboard/
│       ├── page.tsx                    # Dashboard overview (client stats & quick access)
│       ├── layout.tsx                  # Dashboard layout (Sidebar, auth guard)
│       ├── Sidebar.tsx                 # Desktop sidebar & mobile slide-over drawer
│       ├── bot/page.tsx                # Client direct route for bot settings
│       ├── leads/page.tsx              # Client direct route for leads management
│       ├── profile/page.tsx            # Client direct route for business profile
│       ├── loading.tsx                 # Skeleton loader
│       ├── error.tsx                   # Error boundary
│       ├── not-found.tsx               # 404 page
│       ├── billing/page.tsx            # Subscription & billing page
│       ├── inbox/page.tsx              # Live conversation inbox (Realtime WS)
│       ├── messages/page.tsx           # Message logs
│       └── customers/
│           ├── page.tsx                # Customer list (operator view)
│           ├── new/page.tsx            # Add customer
│           └── [id]/
│               ├── page.tsx            # Customer detail
│               ├── bot/page.tsx        # Bot settings
│               └── leads/page.tsx      # Leads list (status dropdown, search, CSV export)
```

---

## Environment Variables

```
# KirimDev API (required)
KIRIMDEV_API_KEY=kdv_xxx              # From dashboard.kirimdev.com
KIRIMDEV_PHONE_NUMBER_ID=xxx          # Your platform's phone_number_id
KIRIMDEV_TEAM_ID=xxx                  # KirimDev team ID
KIRIMDEV_APP_URL=https://chatin.coderey.dev  # For redirect URLs

# Webhook (required for HMAC verification)
KIRIMDEV_WEBHOOK_SECRET=whsec_xxx     # HMAC secret for webhook verification

# Supabase Credentials (required)
NEXT_PUBLIC_SUPABASE_URL=https://horuzytvjcysjstdglsm.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...

# Google OAuth Credentials (required for Google Login)
GOOGLE_CLIENT_ID=1085627868207-lbg1q4sqsd91qii216k2iij2buar6pfu.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_google_client_secret_here
```

---

## GitHub Actions Automated Deployment

File workflow: `.github/workflows/deploy.yml`

Whenever code is pushed to branch `main`, GitHub Actions automatically:
1. Installs dependencies and runs `pnpm build` check.
2. SSH into VPS (`/var/www/chatin`).
3. Fetches latest code, installs production dependencies, builds project, and reloads PM2 process (`pm2 reload chatin --update-env`).

### Required GitHub Repository Secrets (`Settings -> Secrets & variables -> Actions`):
- `VPS_HOST`: Domain or IP address of your VPS (e.g. `chatin.coderey.dev` or `103.xxx.xxx.xxx`)
- `VPS_USERNAME`: SSH username (e.g. `root` or `ubuntu`)
- `VPS_SSH_KEY`: Private SSH Key (`cat ~/.ssh/id_rsa` or private key file content)
- `VPS_PORT`: SSH Port (default `22`)
- `NEXT_PUBLIC_SUPABASE_URL`: `https://horuzytvjcysjstdglsm.supabase.co`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Supabase Anon Key
- `SUPABASE_SERVICE_ROLE_KEY`: Supabase Service Role Key

---

## Key Design Decisions

1. **Supabase PostgreSQL + JSONB**: Provides native relational security (RLS), real-time WebSockets for Live Inbox, built-in Auth, and flexible NoSQL-like JSONB columns for field configurations without external billing complexity.

2. **Single Source of Truth**: Industry templates and fields are managed strictly in `src/lib/industry-templates.ts` to avoid code duplication across bot settings and chat engine.

3. **Partial Lead Saving**: Leads are saved to Supabase immediately upon the first user interaction, ensuring zero loss of partial customer details.

4. **24h Window & Mark-As-Read**: Incoming messages track `last_inbound_at` to enforce Meta's 24-hour customer service window, and automatically send read receipts (`markAsRead`).

5. **Agnostic Payment Integration**: Webhook `/api/webhooks/payment` accepts webhook events from any gateway (Xendit, Midtrans, Mayar, Tripay) without lock-in.

6. **Automated CI/CD Deployment**: Push to `main` automatically builds and deploys to VPS (`/var/www/chatin`) via SSH and PM2 without manual SSH sessions.

7. **Interactive WhatsApp Sandbox Chat Simulator**: Integrated live interactive sandbox mode (`simMode === 'interactive'`) in Bot Settings (`/dashboard/bot`). Uses an internal scroller ref (`chatCanvasRef.current.scrollTop = chatCanvasRef.current.scrollHeight`) to prevent webpage scroll jumps, multiline `<textarea>` for `Shift+Enter` newlines, and proper chat bubble alignment (Customer typing on RIGHT in `#005c4b` green, Bot auto-reply on LEFT in `#202c33` dark grey).

8. **100% Dynamic Conflict & Synonym-Aware Scoring Matcher**: `findMatchingPricelistLink` extracts synonyms and mutually-exclusive conflict pairs dynamically directly from active `BotField[]` configuration (zero hardcoded industry terms). Assigns +10 bonus for keyword matches and -15 penalty for conflicting options of the same field.

9. **Levenshtein Fuzzy Typo Detection**: `lead-parser.ts` includes a fast Levenshtein Distance algorithm (`isFuzzyMatch`) for keyword field extraction, tolerating up to 2 typos for words >= 4 characters. Name extraction uses line-bounded regex (`[^\n\r]`) and expanded `NAME_STOP_WORDS` to prevent form labels (`tanggal`, `lokasi`, `jenis`, etc.) from leaking into customer names.

10. **Single-Tenant Mode Enforcement & Auto-Healing User Link**: Enforces single-tenant mode (max 1 customer tenant per user account). Hides `+ Add Customer` button when a user has an active customer, hides `OPERATOR & MULTI-TENANT` section from Sidebar, blocks creation via `POST /api/customers`, and automatically links orphan customer records (`user_id = null`) to logged-in users via matching `email` in `listCustomers`.

11. **Live WhatsApp Testing Whitelist Mode**: Webhook receiver (`/api/webhooks/kirimdev`) checks `botConfig.config_json.test_mode_enabled` and `test_phone_numbers`. When enabled, bot auto-replies are ONLY executed for whitelisted tester phone numbers (e.g. `085156266871`), while real public customer messages are safely logged to Live Inbox without triggering bot auto-replies.

12. **Typing Mode Indicator**: Webhook auto-reply calls Meta WhatsApp API `action: { type: 'typing_on' }` with a 1-second delay prior to sending outbound text responses, simulating human typing behavior. Interactive Sandbox simulator in `/dashboard/bot` also renders animated typing bubble indicators (`sedang mengetik...`).

---

## Webhook Handling (v2.3.1 — Critical Detail)

`POST /api/webhooks/kirimdev` receives Meta Cloud API events forwarded by KirimDev.

### Real Payload Format (from production logs)

**Headers** (source of truth for event type):
```
x-kirim-event: message.received
x-kirim-event-id: wamid.HBgNNjI4NTE1NjI2Njg3MRUCABIYFjNFQjA1MzYwM0EwQkQ3QjczQjQ5MTMA
x-kirim-signature: t=1786544906,v1=HEX  (t=v1 format, same as Slack/Stripe)
x-kirim-source: meta
user-agent: Kirim-Webhook/1.0
```

**Body** (Meta Cloud API entry format):
```json
{
  "entry": [{
    "id": "2259525001457664",
    "changes": [{
      "field": "messages",
      "value": {
        "contacts": [{"wa_id": "6285156266871", "profile": {"name": "Reynaldi"}}],
        "messages": [{"id": "wamid...", "from": "6285156266871", "text": {"body": "tess"}}],
        "metadata": {"phone_number_id": "1265311166666629"}
      }
    }]
  }],
  "kirim": {"delivery_id": "wbd_..."}
}
```

### Processing Flow

```
Webhook POST → parseHeader(x-kirim-event) + parseBody(entry[0].changes[0])
  → extractInboundMessage(from, body, waName, wamid)
  → find customer by phone_number_id OR fallback to active customer
  → insertMessageLog (→ Supabase Realtime → Live Inbox)
  → if bot enabled: handleChat() → auto-reply via KirimDev API
  → upsertLead() + markAsRead()
```

### Key Implementation Details

- **Event type**: Read from x-kirim-event header (not body) — only reliable source
- **Message ID (wamid)**: From x-kirim-event-id header OR entry[0].changes[0].value.messages[0].id
- **Phone number ID**: From entry[0].changes[0].value.metadata.phone_number_id
- **HMAC**: Format t=TIMESTAMP,v1=HEX. Wrapped in try/catch, non-fatal (logs warning only)
- **File**: src/lib/webhook-verify.ts handles t=v1 format with multiple candidate hashes

### Known Pitfalls (Fixed in v2.3.1)

| Issue | Fix |
|-------|-----|
| All webhook_events had type: "unknown" | Read x-kirim-event header in parseWebhookPayload(rawBody, headerEventType) |
| RangeError: Input buffers must have same byte length | HMAC wrapped in try/catch, non-fatal |
| payload: {} empty in webhook_events | Store full entry body as payload |
| Live Inbox not showing | Ensure Supabase Realtime enabled for message_logs table |
