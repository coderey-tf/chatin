-- =============================================
-- Chatin: Multi-tenant WhatsApp Dashboard
-- Migration Schema for Supabase PostgreSQL
-- =============================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── PROFILES (auto-created on signup) ───
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  avatar_url TEXT,
  role TEXT NOT NULL DEFAULT 'admin',
  last_active_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Trigger to auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', NEW.raw_user_meta_data->>'picture', '')
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    avatar_url = EXCLUDED.avatar_url;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ─── CUSTOMERS (tenants) ───
CREATE TABLE IF NOT EXISTS public.customers (
  id TEXT PRIMARY KEY,                  -- KirimDev customer ID (cus_xxx)
  name TEXT NOT NULL,
  email TEXT,
  status TEXT NOT NULL DEFAULT 'pending',  -- pending, active, archived
  metadata JSONB,
  phone_number_id TEXT,
  phone_number TEXT,
  wa_account_status TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  onboarded_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_customers_status ON public.customers(status);

-- ─── SETUP LINKS ───
CREATE TABLE IF NOT EXISTS public.setup_links (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'active',
  token_last4 TEXT,
  expires_at TIMESTAMPTZ,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ─── BOT CONFIGS ───
CREATE TABLE IF NOT EXISTS public.bot_configs (
  id TEXT PRIMARY KEY DEFAULT 'bc_' || substr(md5(random()::text), 1, 12),
  customer_id TEXT NOT NULL UNIQUE REFERENCES public.customers(id) ON DELETE CASCADE,
  industry_preset TEXT DEFAULT 'generic',
  enabled BOOLEAN DEFAULT true,
  config_json JSONB,
  fields_json JSONB,        -- BotField[]
  templates_json JSONB,     -- {greeting, followup, ...}
  pricelist_links_json JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ─── LEADS ───
CREATE TABLE IF NOT EXISTS public.leads (
  id TEXT PRIMARY KEY DEFAULT 'lead_' || substr(md5(random()::text), 1, 12),
  customer_id TEXT NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  contact_phone TEXT NOT NULL,
  contact_name TEXT,
  package TEXT,
  status TEXT DEFAULT 'Inquiry',
  data_json JSONB DEFAULT '{}'::jsonb,
  source TEXT DEFAULT 'whatsapp_bot',
  last_inbound_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(customer_id, contact_phone)
);

CREATE INDEX IF NOT EXISTS idx_leads_customer ON public.leads(customer_id);
CREATE INDEX IF NOT EXISTS idx_leads_status ON public.leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_created ON public.leads(created_at DESC);

-- ─── MESSAGE LOGS ───
CREATE TABLE IF NOT EXISTS public.message_logs (
  id TEXT PRIMARY KEY,
  customer_id TEXT REFERENCES public.customers(id) ON DELETE SET NULL,
  phone_number_id TEXT,
  to_number TEXT,
  contact_phone TEXT,
  direction TEXT DEFAULT 'outbound',
  wamid TEXT,
  type TEXT,
  status TEXT,
  content TEXT,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_messages_customer ON public.message_logs(customer_id);
CREATE INDEX IF NOT EXISTS idx_messages_contact ON public.message_logs(customer_id, contact_phone, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_created ON public.message_logs(created_at DESC);

-- ─── WEBHOOK EVENTS ───
CREATE TABLE IF NOT EXISTS public.webhook_events (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  payload JSONB,
  processed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ─── SUBSCRIPTIONS & PLANS ───
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id TEXT NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  plan_tier TEXT NOT NULL DEFAULT 'starter', -- 'trial', 'starter', 'pro', 'enterprise'
  status TEXT NOT NULL DEFAULT 'active',     -- 'trialing', 'active', 'past_due', 'canceled', 'expired'
  current_period_start TIMESTAMPTZ DEFAULT now(),
  current_period_end TIMESTAMPTZ DEFAULT (now() + INTERVAL '7 days'), -- 7 days trial default
  max_waba_accounts INT DEFAULT 1,
  max_leads_per_month INT DEFAULT 500,
  auto_renew BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_customer ON public.subscriptions(customer_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON public.subscriptions(status, current_period_end);

-- ─── INVOICES ───
CREATE TABLE IF NOT EXISTS public.invoices (
  id TEXT PRIMARY KEY DEFAULT 'inv_' || substr(md5(random()::text), 1, 12),
  customer_id TEXT NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  plan_tier TEXT NOT NULL DEFAULT 'starter',
  amount INT NOT NULL,                   -- e.g. 149000 (IDR)
  status TEXT NOT NULL DEFAULT 'pending',-- 'pending', 'paid', 'failed', 'expired'
  payment_method TEXT,                  -- 'qris', 'va_bca', 'gopay', 'manual'
  payment_url TEXT,                     -- Redirect link
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoices_customer ON public.invoices(customer_id);

-- ─── RLS POLICIES ───
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.setup_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

-- Clean existing policies if re-running
DROP POLICY IF EXISTS "auth_full_profiles" ON public.profiles;
DROP POLICY IF EXISTS "auth_full_customers" ON public.customers;
DROP POLICY IF EXISTS "auth_full_setup_links" ON public.setup_links;
DROP POLICY IF EXISTS "auth_full_bot_configs" ON public.bot_configs;
DROP POLICY IF EXISTS "auth_full_leads" ON public.leads;
DROP POLICY IF EXISTS "auth_full_message_logs" ON public.message_logs;
DROP POLICY IF EXISTS "auth_full_webhook_events" ON public.webhook_events;
DROP POLICY IF EXISTS "auth_full_subscriptions" ON public.subscriptions;
DROP POLICY IF EXISTS "auth_full_invoices" ON public.invoices;

DROP POLICY IF EXISTS "anon_read_bots" ON public.bot_configs;
DROP POLICY IF EXISTS "anon_rw_leads" ON public.leads;
DROP POLICY IF EXISTS "anon_insert_msgs" ON public.message_logs;
DROP POLICY IF EXISTS "anon_insert_webhooks" ON public.webhook_events;

-- Authenticated: full access
CREATE POLICY "auth_full_profiles" ON public.profiles FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "auth_full_customers" ON public.customers FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "auth_full_setup_links" ON public.setup_links FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "auth_full_bot_configs" ON public.bot_configs FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "auth_full_leads" ON public.leads FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "auth_full_message_logs" ON public.message_logs FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "auth_full_webhook_events" ON public.webhook_events FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "auth_full_subscriptions" ON public.subscriptions FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "auth_full_invoices" ON public.invoices FOR ALL USING (auth.role() = 'authenticated');

-- Public (anon): for /api/chat and webhook processing if unauthenticated
CREATE POLICY "anon_read_bots" ON public.bot_configs FOR SELECT USING (true);
CREATE POLICY "anon_rw_leads" ON public.leads FOR ALL USING (true);
CREATE POLICY "anon_insert_msgs" ON public.message_logs FOR INSERT WITH CHECK (true);
CREATE POLICY "anon_insert_webhooks" ON public.webhook_events FOR INSERT WITH CHECK (true);

-- ─── REALTIME ───
ALTER PUBLICATION supabase_realtime ADD TABLE public.message_logs;
