-- ============================================================================
-- Work Order 6.2.5: Dismissal Persistence
-- ============================================================================

DO $$ BEGIN
    ALTER TABLE public.calendar_events ADD COLUMN dismissed_at timestamptz;
EXCEPTION
    WHEN duplicate_column THEN NULL;
END $$;

COMMENT ON COLUMN public.calendar_events.dismissed_at IS 'Timestamp when an event was explicitly dismissed as noise during reflection.';
