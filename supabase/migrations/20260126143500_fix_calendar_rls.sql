-- ============================================================================
-- AFERR SecondBrain — Phase 4.4.3: RLS & Schema Alignment
-- Correcting Missing Columns + Hardening Truth Layer Security
-- ============================================================================

-- 1) SCHEMA ALIGNMENT: Add missing description column to calendar_events
-- This fulfills the requirement for the PII Scrubber to have a storage target.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_NAME = 'calendar_events' AND COLUMN_NAME = 'description'
  ) THEN
    ALTER TABLE public.calendar_events ADD COLUMN description text;
  END IF;
END $$;

-- 2) IDEMPOTENCY: Ensure calendar_sources has the unique constraint for OAuth
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'calendar_sources_user_id_provider_key'
  ) THEN
    ALTER TABLE public.calendar_sources 
    ADD CONSTRAINT calendar_sources_user_id_provider_key UNIQUE (user_id, provider);
  END IF;
END $$;

-- 3) TABLE CREATION (Safety): Ensure calendar_tokens exists if previous steps failed
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

-- 4) HARDENED RLS: calendar_sources
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

-- 5) HARDENED RLS: calendar_events
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

-- 6) HARDENED RLS: calendar_tokens
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

-- Metadata
COMMENT ON COLUMN public.calendar_events.description IS 'Scrubbed event description (Truth Layer - Privacy Safe)';
