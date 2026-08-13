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
  is_onboarded BOOLEAN DEFAULT false,
  last_active_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_onboarded BOOLEAN DEFAULT false;

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
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE, -- Owner account ID
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

ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_customers_user_id ON public.customers(user_id);
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
  status TEXT NOT NULL DEFAULT 'Inquiry',
  data_json JSONB DEFAULT '{}',
  source TEXT DEFAULT 'whatsapp_bot',
  last_inbound_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT uq_customer_contact UNIQUE (customer_id, contact_phone)
);

-- ─── MESSAGE LOGS ───
CREATE TABLE IF NOT EXISTS public.message_logs (
  id TEXT PRIMARY KEY DEFAULT 'msg_' || substr(md5(random()::text), 1, 12),
  customer_id TEXT NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  phone_number_id TEXT,
  to_number TEXT,
  contact_phone TEXT,
  direction TEXT NOT NULL DEFAULT 'outbound',
  wamid TEXT,
  type TEXT DEFAULT 'text',
  status TEXT DEFAULT 'pending',
  content TEXT,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Realtime Publication for message_logs (Idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'message_logs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.message_logs;
  END IF;
END $$;

-- Enable RLS and Grant Permissions
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_logs ENABLE ROW LEVEL SECURITY;

GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
