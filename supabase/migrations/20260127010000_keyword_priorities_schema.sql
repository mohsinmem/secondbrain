-- ============================================================================
-- Work Order 6.0: Strategic Priority Weights
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.keyword_priorities (
    id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    keyword text NOT NULL,
    weight integer NOT NULL DEFAULT 50 CHECK (weight BETWEEN 0 AND 100),
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    
    CONSTRAINT keyword_priorities_user_keyword_unique UNIQUE (user_id, keyword)
);

-- RLS
ALTER TABLE public.keyword_priorities ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY keyword_priorities_select_own ON public.keyword_priorities
    FOR SELECT USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY keyword_priorities_upsert_own ON public.keyword_priorities
    FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_keyword_priorities_updated_at ON public.keyword_priorities;
CREATE TRIGGER update_keyword_priorities_updated_at
BEFORE UPDATE ON public.keyword_priorities
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
