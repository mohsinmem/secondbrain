-- ============================================================================
-- AFERR SecondBrain — Phase 4.4.5: Vector & Fuzzy Search Support
-- Enabling Similarity Search for Intent Resonance
-- ============================================================================

-- 1) Enable Extensions
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS vector;

-- 2) ADD EMBEDDING COLUMN: Future-proofing for LLM-based semantic search
-- Using 1536 as it is the standard for text-embedding-ada-002 / 3-small
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_NAME = 'calendar_events' AND COLUMN_NAME = 'embedding'
  ) THEN
    ALTER TABLE public.calendar_events ADD COLUMN embedding vector(1536);
  END IF;
END $$;

-- 3) FUZZY SEARCH INDEX: Trigram support for fast title/location matches
-- This allows for similarity(title, query) > 0.3 etc.
CREATE INDEX IF NOT EXISTS idx_calendar_events_title_trgm ON public.calendar_events USING gin (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_calendar_events_location_trgm ON public.calendar_events USING gin (location gin_trgm_ops);

-- 4) SEARCH FUNCTION: For similarity-based retrieval
-- Can be called via supabase.rpc('search_calendar_events_fuzzy', { query_text: '...', threshold: 0.3 })
CREATE OR REPLACE FUNCTION search_calendar_events_fuzzy(query_text text, threshold float)
RETURNS SETOF public.calendar_events AS $$
BEGIN
    RETURN QUERY
    SELECT *
    FROM public.calendar_events
    WHERE 
        (similarity(title, query_text) > threshold OR similarity(location, query_text) > threshold)
        AND user_id = auth.uid()
    ORDER BY similarity(title, query_text) DESC, start_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
