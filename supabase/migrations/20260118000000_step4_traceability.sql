-- ============================================================================
-- AFERR SecondBrain — Phase 3.1 Step 4: Step 4: Signal ↔ Event Linking
-- Traceability and Durable Meaning persistence
-- ============================================================================

-- 1) Enhance signals table with traceability
DO $$ BEGIN
  ALTER TABLE public.signals ADD COLUMN source_candidate_id uuid REFERENCES public.signal_candidates(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.signals ADD COLUMN source_ai_run_id uuid REFERENCES public.ai_runs(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- 2) Add indexes for navigation and audit
CREATE INDEX IF NOT EXISTS idx_signals_source_candidate ON public.signals(source_candidate_id)
  WHERE source_candidate_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_signals_source_ai_run ON public.signals(source_ai_run_id)
  WHERE source_ai_run_id IS NOT NULL;

-- 3) Ensure signal_candidates has ai_run_id (audit path)
-- Note: It should already have it from earlier phases, but we ensure it here if needed.
DO $$ BEGIN
  ALTER TABLE public.signal_candidates ADD COLUMN ai_run_id uuid REFERENCES public.ai_runs(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- 4) Add metadata/context grouping to signal_candidates (optional but powerful)
DO $$ BEGIN
  ALTER TABLE public.signal_candidates ADD COLUMN source_context_ids jsonb;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- 5) Add status to signal_candidates to track promotion
DO $$ BEGIN
    -- Check if column exists, if not add it
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'signal_candidates' AND column_name = 'promotion_status') THEN
        ALTER TABLE public.signal_candidates ADD COLUMN promotion_status text DEFAULT 'pending' 
            CHECK (promotion_status IN ('pending', 'promoted', 'deferred', 'rejected'));
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_candidates_promotion_status ON public.signal_candidates(promotion_status);

-- 6) Comments for Auditability
COMMENT ON COLUMN public.signals.source_candidate_id IS 'Traceability: The candidate that was promoted to this signal';
COMMENT ON COLUMN public.signals.source_ai_run_id IS 'Traceability: The AI run that generated the candidate source';
COMMENT ON COLUMN public.signal_candidates.source_context_ids IS 'Reference to the specific notes/conversations used to propose this candidate';
