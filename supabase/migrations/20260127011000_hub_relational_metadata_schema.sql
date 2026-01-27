-- ============================================================================
-- Work Order 6.1: Wisdom Injection - Relational Metadata
-- ============================================================================

DO $$ BEGIN
    ALTER TABLE public.context_hubs ADD COLUMN relational_metadata jsonb DEFAULT '[]'::jsonb;
EXCEPTION
    WHEN duplicate_column THEN NULL;
END $$;

COMMENT ON COLUMN public.context_hubs.relational_metadata IS 'Stores manual wisdom attributes (Family, Professional, etc.) added via the Wisdom Gate UI.';
