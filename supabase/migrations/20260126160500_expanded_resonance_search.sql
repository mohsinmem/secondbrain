-- ============================================================================
-- AFERR SecondBrain — Phase 4.4.8: Expanded Resonance Search
-- Including Descriptions in Similarity Search for Higher Recall
-- ============================================================================

-- 1) UPDATE FUZZY SEARCH INDEX: Add description support
CREATE INDEX IF NOT EXISTS idx_calendar_events_description_trgm ON public.calendar_events USING gin (description gin_trgm_ops);

-- 2) UPDATE SEARCH FUNCTION: Include description in similarity score
CREATE OR REPLACE FUNCTION search_calendar_events_fuzzy(query_text text, threshold float)
RETURNS SETOF public.calendar_events AS $$
BEGIN
    RETURN QUERY
    SELECT *
    FROM public.calendar_events
    WHERE 
        (
            similarity(title, query_text) > threshold 
            OR similarity(location, query_text) > threshold
            OR similarity(description, query_text) > threshold
        )
        AND user_id = auth.uid()
    ORDER BY 
        GREATEST(similarity(title, query_text), similarity(location, query_text), similarity(description, query_text)) DESC, 
        start_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
