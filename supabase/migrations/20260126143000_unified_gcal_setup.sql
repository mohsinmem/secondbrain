-- ============================================================================
-- AFERR SecondBrain — Phase 4.4: Unified GCal Setup & Hardening
-- Consolidates Token Storage + Schema Idempotency + Specialized RLS
-- ============================================================================

-- 1) Create calendar_tokens table (Secure OAuth Storage)
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

CREATE INDEX IF NOT EXISTS idx_calendar_tokens_user ON public.calendar_tokens(user_id);

-- Trigger for updated_at in calendar_tokens
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_calendar_tokens_updated_at') THEN
    CREATE TRIGGER update_calendar_tokens_updated_at
      BEFORE UPDATE ON public.calendar_tokens
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;


-- 2) Idempotency Guard: Unique constraint for OAuth handling
-- Required for UPSERT flow in /api/calendar/callback
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'calendar_sources_user_id_provider_key'
  ) THEN
    ALTER TABLE public.calendar_sources 
    ADD CONSTRAINT calendar_sources_user_id_provider_key UNIQUE (user_id, provider);
  END IF;
END $$;


-- 3) Hardened RLS: calendar_sources
ALTER TABLE public.calendar_sources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS calendar_sources_select_own ON public.calendar_sources;
CREATE POLICY calendar_sources_select_own ON public.calendar_sources
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS calendar_sources_insert_own ON public.calendar_sources;
CREATE POLICY calendar_sources_insert_own ON public.calendar_sources
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS calendar_sources_update_own ON public.calendar_sources;
CREATE POLICY calendar_sources_update_own ON public.calendar_sources
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS calendar_sources_delete_own ON public.calendar_sources;
CREATE POLICY calendar_sources_delete_own ON public.calendar_sources
  FOR DELETE USING (user_id = auth.uid());


-- 4) Hardened RLS: calendar_events
ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS calendar_events_select_own ON public.calendar_events;
CREATE POLICY calendar_events_select_own ON public.calendar_events
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS calendar_events_insert_own ON public.calendar_events;
CREATE POLICY calendar_events_insert_own ON public.calendar_events
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS calendar_events_update_own ON public.calendar_events;
CREATE POLICY calendar_events_update_own ON public.calendar_events
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS calendar_events_delete_own ON public.calendar_events;
CREATE POLICY calendar_events_delete_own ON public.calendar_events
  FOR DELETE USING (user_id = auth.uid());


-- 5) Hardened RLS: calendar_tokens (The Privacy Spine)
ALTER TABLE public.calendar_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS calendar_tokens_all_own ON public.calendar_tokens;
DROP POLICY IF EXISTS calendar_tokens_select_own ON public.calendar_tokens;
CREATE POLICY calendar_tokens_select_own ON public.calendar_tokens
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS calendar_tokens_insert_own ON public.calendar_tokens;
CREATE POLICY calendar_tokens_insert_own ON public.calendar_tokens
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS calendar_tokens_update_own ON public.calendar_tokens;
CREATE POLICY calendar_tokens_update_own ON public.calendar_tokens
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS calendar_tokens_delete_own ON public.calendar_tokens;
CREATE POLICY calendar_tokens_delete_own ON public.calendar_tokens
  FOR DELETE USING (user_id = auth.uid());


-- 6) Metadata/Comments
COMMENT ON TABLE public.calendar_tokens IS 'Stores encrypted/raw OAuth tokens for external providers. Linked to calendar_sources.';
COMMENT ON CONSTRAINT calendar_sources_user_id_provider_key ON public.calendar_sources IS 'Ensures idempotency for OAuth connections: one source per provider per user.';
