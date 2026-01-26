-- ============================================================================
-- AFERR SecondBrain — Phase 4.4: The GCal Connection
-- Secure OAuth Token Storage
-- ============================================================================

-- 1) Create calendar_tokens table
-- This stores sensitive OAuth credentials.
-- It is linked 1:1 with calendar_sources where provider = 'google'.
CREATE TABLE IF NOT EXISTS public.calendar_tokens (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  source_id uuid NOT NULL REFERENCES public.calendar_sources(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  expires_at timestamptz NOT NULL,
  token_type text DEFAULT 'Bearer',
  scope text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  CONSTRAINT calendar_tokens_source_unique UNIQUE (source_id)
);

-- Index for lookup
CREATE INDEX IF NOT EXISTS idx_calendar_tokens_user ON public.calendar_tokens(user_id);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_calendar_tokens_updated_at ON public.calendar_tokens;
CREATE TRIGGER update_calendar_tokens_updated_at
  BEFORE UPDATE ON public.calendar_tokens
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS for calendar_tokens
-- CRITICAL: Only the server-side service role should ideally manage tokens,
-- but for now we follow the 'own user' pattern. 
-- In a real production apps, we might use vault or more restricted RLS.
ALTER TABLE public.calendar_tokens ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY calendar_tokens_all_own ON public.calendar_tokens
    FOR ALL USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2) Add comment for clarity
COMMENT ON TABLE public.calendar_tokens IS 'Stores encrypted/raw OAuth tokens for external health/calendar providers. Linked to calendar_sources.';
