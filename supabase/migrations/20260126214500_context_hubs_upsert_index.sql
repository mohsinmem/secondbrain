-- ============================================================================
-- AFERR SecondBrain — Work Order 5.9: The Index Alignment
-- Creating Explicit Unique Index for Upsert Conflict Targeting
-- ============================================================================

-- This index specifically targets the user_id, title, and start_at columns
-- to satisfy the ON CONFLICT requirement in the Supabase/PostgreSQL upsert.

CREATE UNIQUE INDEX IF NOT EXISTS context_hubs_upsert_idx 
ON public.context_hubs (user_id, title, start_at);

COMMENT ON INDEX public.context_hubs_upsert_idx IS 'Surgical index to enable stable upserts for the Hub clustering engine.';
