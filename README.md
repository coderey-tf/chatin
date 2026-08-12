# 🔌 Chatin

Multi-tenant WhatsApp Business API dashboard with built-in lead collector chatbot.

## Quickstart

```bash
cp .env.example .env
# Edit .env with your KirimDev API key
pnpm install
pnpm build
pnpm start
# Dashboard: http://localhost:3004
```

## What it does

- **Onboard clients**: Generate Embedded Signup links → clients connect their WhatsApp Business Account (WABA)
- **Automated lead collection**: Generic chatbot captures customer data (name, phone, service, date) via WhatsApp
- **Template-driven**: 5 industry presets (wedding, klinik, rental, toko, generic) — fully customizable per client
- **Pass-through billing**: Meta Cloud API fees are billed directly to client's WABA — you only pay KirimDev platform subscription

## Architecture

```
WhatsApp → KirimDev (Meta BSP) → Chatin webhook → Chat engine → Auto-reply back to WhatsApp
                                                          ↓
                                                     SQLite leads
```

**Stack**: Next.js 16 + React 19 + TypeScript + Tailwind CSS 4 + SQLite

## Chat API

```bash
POST /api/chat
{
  "message": "Halo, saya mau nikah di gedung",
  "customer_id": "cus_xxx",
  "phone": "+628123456789"
}
```

Returns: `{ reply, autoReply, handoverToAdmin, leadSaved, leadData }`

## Documentation

See [AGENTS.md](./AGENTS.md) for full technical docs (for AI agents and developers).

## Deploy

```bash
pnpm build
pm2 start pm2.config.cjs   # or: pm2 restart chatin
```

VPS config: port 3004, nginx reverse proxy, SSL.
