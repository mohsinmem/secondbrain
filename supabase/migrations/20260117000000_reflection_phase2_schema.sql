-- ============================================================================
-- AFERR SecondBrain — Reflection Phase 2
-- Conversation Maps, Segmentation Enhancements, Validation + Weighting
-- ============================================================================

-- 1) Create conversation_maps table
CREATE TABLE IF NOT EXISTS public.conversation_maps (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  conversation_id uuid NOT NULL REFERENCES public.raw_conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  map_data jsonb NOT NULL,
  created_at timestamptz DEFAULT now(),
  
  CONSTRAINT conversation_maps_conv_unique UNIQUE (conversation_id)
);

CREATE INDEX IF NOT EXISTS idx_conversation_maps_user ON public.conversation_maps(user_id);
CREATE INDEX IF NOT EXISTS idx_conversation_maps_conv ON public.conversation_maps(conversation_id);

-- RLS for conversation_maps
ALTER TABLE public.conversation_maps ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY conversation_maps_select_own ON public.conversation_maps
    FOR SELECT USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY conversation_maps_insert_own ON public.conversation_maps
    FOR INSERT WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY conversation_maps_delete_own ON public.conversation_maps
    FOR DELETE USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- 2) Create candidate_weights table
CREATE TABLE IF NOT EXISTS public.candidate_weights (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  candidate_id uuid NOT NULL REFERENCES public.signal_candidates(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Weights (User-owned)
  relevance integer CHECK (relevance BETWEEN 1 AND 5),
  importance integer CHECK (importance BETWEEN 1 AND 5),
  energy_impact integer CHECK (energy_impact BETWEEN -5 AND 5),
  confidence text CHECK (confidence IN ('Low', 'Med', 'High')),
  action_timing text CHECK (action_timing IN ('now', 'later', 'no')),
  
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  CONSTRAINT candidate_weights_unique UNIQUE (candidate_id)
);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_candidate_weights_updated_at ON public.candidate_weights;
CREATE TRIGGER update_candidate_weights_updated_at
  BEFORE UPDATE ON public.candidate_weights
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_candidate_weights_user ON public.candidate_weights(user_id);
CREATE INDEX IF NOT EXISTS idx_candidates_weights_candidate ON public.candidate_weights(candidate_id);

-- RLS for candidate_weights
ALTER TABLE public.candidate_weights ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY candidate_weights_select_own ON public.candidate_weights
    FOR SELECT USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY candidate_weights_insert_own ON public.candidate_weights
    FOR INSERT WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY candidate_weights_update_own ON public.candidate_weights
    FOR UPDATE USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY candidate_weights_delete_own ON public.candidate_weights
    FOR DELETE USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- 3) Add columns to signal_candidates
DO $$ BEGIN
    ALTER TABLE public.signal_candidates ADD COLUMN why_surfaced text;
EXCEPTION
    WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE public.signal_candidates ADD COLUMN ambiguity_note text;
EXCEPTION
    WHEN duplicate_column THEN NULL;
END $$;


-- 4) Add unique index to signals for accept idempotency
CREATE UNIQUE INDEX IF NOT EXISTS idx_signals_candidate_unique
  ON public.signals(approved_from_candidate_id)
  WHERE approved_from_candidate_id IS NOT NULL;
