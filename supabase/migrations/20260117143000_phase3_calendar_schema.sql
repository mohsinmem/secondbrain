-- ============================================================================
-- AFERR SecondBrain — Phase 3: Event-Centric Life Map
-- Calendar Truth Layer + Orientation Layer
-- ============================================================================

-- 1) Create calendar_sources table
CREATE TABLE IF NOT EXISTS public.calendar_sources (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('google', 'upload')),
  sync_mode text NOT NULL CHECK (sync_mode IN ('upload', 'oauth')),
  date_range_start date,
  date_range_end date,
  last_synced_at timestamptz,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'error')),
  created_at timestamptz DEFAULT now(),

  CONSTRAINT calendar_sources_date_range_check
    CHECK (date_range_start IS NULL OR date_range_end IS NULL OR date_range_start <= date_range_end)
);

CREATE INDEX IF NOT EXISTS idx_calendar_sources_user ON public.calendar_sources(user_id);
CREATE INDEX IF NOT EXISTS idx_calendar_sources_status ON public.calendar_sources(status);

-- RLS for calendar_sources
ALTER TABLE public.calendar_sources ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY calendar_sources_select_own ON public.calendar_sources
    FOR SELECT USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY calendar_sources_insert_own ON public.calendar_sources
    FOR INSERT WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY calendar_sources_update_own ON public.calendar_sources
    FOR UPDATE USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY calendar_sources_delete_own ON public.calendar_sources
    FOR DELETE USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- 2) Create calendar_events table (Central node of Phase 3)
CREATE TABLE IF NOT EXISTS public.calendar_events (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_id uuid NOT NULL REFERENCES public.calendar_sources(id) ON DELETE CASCADE,
  external_event_id text NOT NULL,
  title text NOT NULL,
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  location text,
  attendees text[],
  raw_payload jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  CONSTRAINT calendar_events_time_check CHECK (start_at <= end_at)
);

-- Unique index for idempotency (deduplication)
CREATE UNIQUE INDEX IF NOT EXISTS idx_calendar_events_external_unique
  ON public.calendar_events(source_id, external_event_id);

CREATE INDEX IF NOT EXISTS idx_calendar_events_user ON public.calendar_events(user_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_source ON public.calendar_events(source_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_time ON public.calendar_events(start_at, end_at);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_calendar_events_updated_at ON public.calendar_events;
CREATE TRIGGER update_calendar_events_updated_at
  BEFORE UPDATE ON public.calendar_events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS for calendar_events
ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY calendar_events_select_own ON public.calendar_events
    FOR SELECT USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY calendar_events_insert_own ON public.calendar_events
    FOR INSERT WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY calendar_events_update_own ON public.calendar_events
    FOR UPDATE USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY calendar_events_delete_own ON public.calendar_events
    FOR DELETE USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- 3) Create calendar_maps table (Stores AI-generated orientation)
CREATE TABLE IF NOT EXISTS public.calendar_maps (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_id uuid NOT NULL REFERENCES public.calendar_sources(id) ON DELETE CASCADE,
  date_range_start date,
  date_range_end date,
  map_data jsonb NOT NULL,
  ai_run_id uuid REFERENCES public.ai_runs(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),

  CONSTRAINT calendar_maps_date_range_check
    CHECK (date_range_start IS NULL OR date_range_end IS NULL OR date_range_start <= date_range_end)
);

-- One map per source + date range combination
CREATE UNIQUE INDEX IF NOT EXISTS idx_calendar_maps_source_daterange
  ON public.calendar_maps(source_id, date_range_start, date_range_end);

CREATE INDEX IF NOT EXISTS idx_calendar_maps_user ON public.calendar_maps(user_id);
CREATE INDEX IF NOT EXISTS idx_calendar_maps_source ON public.calendar_maps(source_id);

-- RLS for calendar_maps
ALTER TABLE public.calendar_maps ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY calendar_maps_select_own ON public.calendar_maps
    FOR SELECT USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY calendar_maps_insert_own ON public.calendar_maps
    FOR INSERT WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY calendar_maps_delete_own ON public.calendar_maps
    FOR DELETE USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- 4) Create event_contexts table (Links user-added context to events)
CREATE TABLE IF NOT EXISTS public.event_contexts (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  event_id uuid NOT NULL REFERENCES public.calendar_events(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  context_type text NOT NULL CHECK (context_type IN ('note', 'conversation', 'document')),
  content text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_event_contexts_event ON public.event_contexts(event_id);
CREATE INDEX IF NOT EXISTS idx_event_contexts_user ON public.event_contexts(user_id);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_event_contexts_updated_at ON public.event_contexts;
CREATE TRIGGER update_event_contexts_updated_at
  BEFORE UPDATE ON public.event_contexts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS for event_contexts
ALTER TABLE public.event_contexts ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY event_contexts_select_own ON public.event_contexts
    FOR SELECT USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY event_contexts_insert_own ON public.event_contexts
    FOR INSERT WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY event_contexts_update_own ON public.event_contexts
    FOR UPDATE USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY event_contexts_delete_own ON public.event_contexts
    FOR DELETE USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- 5) Extend existing tables for event linking

-- Add linked_event_id to signals table
DO $$ BEGIN
  ALTER TABLE public.signals ADD COLUMN linked_event_id uuid REFERENCES public.calendar_events(id) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_column THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_signals_linked_event ON public.signals(linked_event_id)
  WHERE linked_event_id IS NOT NULL;

-- Add source_event_id to signal_candidates table
DO $$ BEGIN
  ALTER TABLE public.signal_candidates ADD COLUMN source_event_id uuid REFERENCES public.calendar_events(id) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_column THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_candidates_source_event ON public.signal_candidates(source_event_id)
  WHERE source_event_id IS NOT NULL;


-- 6) Add comments for clarity
COMMENT ON TABLE public.calendar_sources IS 'Tracks how calendar data enters the system (upload or OAuth)';
COMMENT ON TABLE public.calendar_events IS 'Central truth node for Phase 3: immutable event records';
COMMENT ON TABLE public.calendar_maps IS 'AI-generated orientation maps (descriptive only, never prescriptive)';
COMMENT ON TABLE public.event_contexts IS 'User-added context (notes, conversations, documents) attached to events';
COMMENT ON COLUMN public.calendar_events.raw_payload IS 'Immutable traceability: original event data from source';
COMMENT ON COLUMN public.calendar_maps.map_data IS 'JSONB structure: participants, themes, patterns, reflection_zones, guardrails, readiness';
