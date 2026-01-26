-- ============================================================================
-- AFERR SecondBrain — Work Order 5: Schema Correction
-- Adding metadata column to calendar_events for Anchor Logic
-- ============================================================================

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_NAME = 'calendar_events' AND COLUMN_NAME = 'metadata'
  ) THEN
    ALTER TABLE public.calendar_events ADD COLUMN metadata jsonb DEFAULT '{}'::jsonb;
  END IF;
END $$;

COMMENT ON COLUMN public.calendar_events.metadata IS 'Stores anchor tags and other semantic flags for the Hub Engine.';
