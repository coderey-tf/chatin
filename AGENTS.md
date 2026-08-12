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

## Authentication System

Chatin uses **Supabase Auth** with full support for:
1. **Google OAuth 2.0**: Single click login/signup via Google.
2. **Email & Password**: Open registration ([/register](file:///d:/Project%20Website/chatin/src/app/register/page.tsx)) and login ([/login](file:///d:/Project%20Website/chatin/src/app/login/page.tsx)).
3. **Session Middleware**: [middleware.ts](file:///d:/Project%20Website/chatin/middleware.ts) verifies JWT tokens on all `/dashboard/*` and `/api/*` routes.
4. **Cleanup Policy**: Users inactive for over 60 days are cleaned up automatically via scheduled cron tasks.

---

## Live Conversation Inbox

Available at `/dashboard/inbox`:
- **2-Column Layout**: Left column displays contacts with search filter & customer switcher; right column displays active conversation thread.
- **Supabase Realtime**: Connects via WebSocket (`supabase.channel('inbox-live')`) to render inbound and outbound messages instantly without manual refreshing.
- **24h Window Badge**: Computes sisa waktu Jendela 24 Jam layanan Meta (`✅ Window Open (14j tersisa)` / `⏰ Closed`).
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
│       ├── page.tsx                    # Dashboard overview (stats)
│       ├── layout.tsx                  # Dashboard layout (nav, user profile, sticky header)
│       ├── loading.tsx                 # Skeleton loader
│       ├── error.tsx                   # Error boundary
│       ├── not-found.tsx               # 404 page
│       ├── billing/page.tsx            # Subscription & billing page
│       ├── inbox/page.tsx              # Live conversation inbox (Realtime WS)
│       ├── messages/page.tsx           # Message logs
│       └── customers/
│           ├── page.tsx                # Customer list
│           ├── new/page.tsx            # Add customer
│           └── [id]/
│               ├── page.tsx            # Customer detail
│               ├── bot/page.tsx        # Bot settings (template, fields, pricelist)
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

# Webhook (optional but recommended)
KIRIMDEV_WEBHOOK_SECRET=xxx           # HMAC secret for webhook verification

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
