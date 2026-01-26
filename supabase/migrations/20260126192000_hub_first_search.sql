-- ============================================================================
-- AFERR SecondBrain — Work Order 5: Hub-First search
-- Prioritizing Contextual Hubs in Similarity Search
-- ============================================================================

-- UPDATE SEARCH FUNCTION: Search Hubs first, then events
CREATE OR REPLACE FUNCTION search_resonance(query_text text, threshold float)
RETURNS TABLE (
    result_id uuid,
    result_type text,
    result_title text,
    result_start_at timestamptz,
    result_end_at timestamptz,
    similarity float
) AS $$
BEGIN
    RETURN QUERY
    -- 1. Search Hubs (Highest Gravity)
    SELECT 
        id as result_id, 
        'hub' as result_type, 
        title as result_title, 
        start_at as result_start_at, 
        end_at as result_end_at,
        similarity(title, query_text) as similarity
    FROM public.context_hubs
    WHERE 
        similarity(title, query_text) > threshold
        AND user_id = auth.uid()
        
    UNION ALL
    
    -- 2. Search Events (Individual Pulse)
    SELECT 
        id as result_id, 
        'event' as result_type, 
        title as result_title, 
        start_at as result_start_at, 
        end_at as result_end_at,
        GREATEST(similarity(title, query_text), similarity(location, query_text), similarity(description, query_text)) as similarity
    FROM public.calendar_events
    WHERE 
        (
            similarity(title, query_text) > threshold 
            OR similarity(location, query_text) > threshold
            OR similarity(description, query_text) > threshold
        )
        AND user_id = auth.uid()
        -- Exclude events already linked to a matching hub (to avoid redundancy)
        AND (hub_id IS NULL OR hub_id NOT IN (SELECT id FROM public.context_hubs WHERE similarity(title, query_text) > threshold))
        
    ORDER BY similarity DESC, result_start_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
