-- Migration 043: Evolution API Integration Config
-- Stores Evolution API server connection details per account.

CREATE TABLE IF NOT EXISTS public.evolution_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  server_url TEXT NOT NULL,
  api_key TEXT NOT NULL,
  instance_name TEXT NOT NULL,
  instance_token TEXT,
  status TEXT NOT NULL DEFAULT 'disconnected',
  phone_number TEXT,
  profile_name TEXT,
  profile_pic_url TEXT,
  webhook_url TEXT,
  auto_webhook BOOLEAN DEFAULT true,
  reject_calls BOOLEAN DEFAULT false,
  always_online BOOLEAN DEFAULT true,
  read_messages BOOLEAN DEFAULT false,
  connected_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT evolution_config_account_id_unique UNIQUE (account_id)
);

-- Enable RLS
ALTER TABLE public.evolution_config ENABLE ROW LEVEL SECURITY;

-- Allow members of the account to view the evolution config
CREATE POLICY "Account members can view evolution config"
  ON public.evolution_config
  FOR SELECT
  USING (
    account_id IN (
      SELECT account_id FROM public.profiles WHERE user_id = auth.uid()
    )
  );

-- Allow admins/owners to insert/update/delete evolution config
CREATE POLICY "Admins can manage evolution config"
  ON public.evolution_config
  FOR ALL
  USING (
    account_id IN (
      SELECT account_id FROM public.profiles 
      WHERE user_id = auth.uid() 
      AND (account_role IN ('owner', 'admin') OR account_role IS NULL)
    )
  );

CREATE INDEX IF NOT EXISTS idx_evolution_config_instance_name ON public.evolution_config(instance_name);
