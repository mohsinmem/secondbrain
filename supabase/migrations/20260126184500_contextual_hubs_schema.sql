-- ============================================================================
-- AFERR SecondBrain — Work Order 5: The Associative Context Overhaul
-- Relational Network Foundation: Contextual Hubs
-- ============================================================================

-- 1) Create context_hubs table (The gravity wells of the platform)
CREATE TABLE IF NOT EXISTS public.context_hubs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    title text NOT NULL,
    type text NOT NULL CHECK (type IN ('travel', 'project', 'intent', 'anchor')),
    start_at timestamptz NOT NULL,
    end_at timestamptz NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamptz DEFAULT now(),
    
    CONSTRAINT context_hubs_time_check CHECK (start_at <= end_at)
);

CREATE INDEX IF NOT EXISTS idx_context_hubs_user ON public.context_hubs(user_id);
CREATE INDEX IF NOT EXISTS idx_context_hubs_time ON public.context_hubs(start_at, end_at);

-- 2) Link calendar_events to hubs
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_NAME = 'calendar_events' AND COLUMN_NAME = 'hub_id'
  ) THEN
    ALTER TABLE public.calendar_events ADD COLUMN hub_id uuid REFERENCES public.context_hubs(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_calendar_events_hub ON public.calendar_events(hub_id);

-- 3) Enable RLS for context_hubs
ALTER TABLE public.context_hubs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY context_hubs_select_own ON public.context_hubs
    FOR SELECT USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY context_hubs_insert_own ON public.context_hubs
    FOR INSERT WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY context_hubs_update_own ON public.context_hubs
    FOR UPDATE USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY context_hubs_delete_own ON public.context_hubs
    FOR DELETE USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 4) Add comments for clarity
COMMENT ON TABLE public.context_hubs IS 'Relational network nodes: groupings of events around a central anchor or theme.';
COMMENT ON COLUMN public.calendar_events.hub_id IS 'Linking raw events to their contextual gravity wells.';
