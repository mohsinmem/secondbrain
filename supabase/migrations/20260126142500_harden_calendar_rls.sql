-- ============================================================================
-- AFERR SecondBrain — Phase 4.4.3: Supabase RLS & Schema Hardening
-- Resolving "Failed to create calendar source" and securing Truth Layer
-- ============================================================================

-- 1) Add unique constraint to calendar_sources for OAuth idempotency
-- This is required for the .upsert({ ... }, { onConflict: 'user_id,provider' }) call.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'calendar_sources_user_id_provider_key'
  ) THEN
    ALTER TABLE public.calendar_sources 
    ADD CONSTRAINT calendar_sources_user_id_provider_key UNIQUE (user_id, provider);
  END IF;
END $$;

-- 2) Harden RLS Policies for calendar_sources
-- We use separate policies for clarity, ensuring WITH CHECK for INSERT/UPDATE.
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

-- 3) Harden RLS Policies for calendar_events
-- Events must also be tightly coupled to auth.uid().
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

-- 4) Harden RLS Policies for calendar_tokens
-- Tokens are the most sensitive; ensuring ALL operations check user_id.
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

-- 5) Final Audit Summary
COMMENT ON CONSTRAINT calendar_sources_user_id_provider_key ON public.calendar_sources IS 'Ensures idempotency for OAuth connections: one source per provider per user.';
