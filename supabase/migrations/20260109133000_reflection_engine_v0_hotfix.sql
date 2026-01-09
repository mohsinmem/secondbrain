-- ============================================================================
-- AFERR SecondBrain — Reflection Engine v0 Hotfix
-- Safe ALTER-forward migration (because core tables already exist)
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1) Ensure critical constraints exist

-- conversation_segments unique per conversation+segment_number
DO $$ BEGIN
  ALTER TABLE public.conversation_segments
    ADD CONSTRAINT conversation_segments_unique UNIQUE (conversation_id, segment_number);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- raw_conversations date range check
DO $$ BEGIN
  ALTER TABLE public.raw_conversations
    ADD CONSTRAINT raw_conversations_date_range_check
    CHECK (date_range_start IS NULL OR date_range_end IS NULL OR date_range_start <= date_range_end);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ai_runs error_required check (schema dump doesn't show it)
DO $$ BEGIN
  ALTER TABLE public.ai_runs
    ADD CONSTRAINT ai_runs_error_required
    CHECK ((status = 'failed' AND error_type IS NOT NULL) OR status <> 'failed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- signals provenance check
DO $$ BEGIN
  ALTER TABLE public.signals
    ADD CONSTRAINT signals_provenance_complete
    CHECK ((source_conversation_id IS NULL) OR (source_excerpt IS NOT NULL));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2) Indexes (safe create)

CREATE INDEX IF NOT EXISTS idx_raw_conversations_user_status
  ON public.raw_conversations(user_id, status);

CREATE INDEX IF NOT EXISTS idx_raw_conversations_platform
  ON public.raw_conversations(platform);

CREATE INDEX IF NOT EXISTS idx_raw_conversations_date_range
  ON public.raw_conversations(date_range_start, date_range_end);

CREATE INDEX IF NOT EXISTS idx_segments_conversation
  ON public.conversation_segments(conversation_id);

CREATE INDEX IF NOT EXISTS idx_segments_user
  ON public.conversation_segments(user_id);

CREATE INDEX IF NOT EXISTS idx_segments_status
  ON public.conversation_segments(extraction_status);

CREATE INDEX IF NOT EXISTS idx_ai_runs_user
  ON public.ai_runs(user_id);

CREATE INDEX IF NOT EXISTS idx_ai_runs_conversation
  ON public.ai_runs(conversation_id);

CREATE INDEX IF NOT EXISTS idx_ai_runs_segment
  ON public.ai_runs(segment_id);

CREATE INDEX IF NOT EXISTS idx_ai_runs_status
  ON public.ai_runs(status);

CREATE INDEX IF NOT EXISTS idx_candidates_review_status
  ON public.signal_candidates(review_status);

CREATE INDEX IF NOT EXISTS idx_candidates_segment
  ON public.signal_candidates(segment_id);

CREATE INDEX IF NOT EXISTS idx_candidates_ai_run
  ON public.signal_candidates(ai_run_id);

CREATE INDEX IF NOT EXISTS idx_candidates_deferred
  ON public.signal_candidates(deferred_until)
  WHERE deferred_until IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_signals_conversation
  ON public.signals(source_conversation_id)
  WHERE source_conversation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_signals_candidate
  ON public.signals(approved_from_candidate_id)
  WHERE approved_from_candidate_id IS NOT NULL;

-- 3) RLS policies (create if missing; do not drop existing)

ALTER TABLE public.conversation_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_runs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY conversation_segments_select_own
    ON public.conversation_segments FOR SELECT
    USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY conversation_segments_insert_own
    ON public.conversation_segments FOR INSERT
    WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY conversation_segments_update_own
    ON public.conversation_segments FOR UPDATE
    USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY conversation_segments_delete_own
    ON public.conversation_segments FOR DELETE
    USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY ai_runs_select_own
    ON public.ai_runs FOR SELECT
    USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY ai_runs_insert_own
    ON public.ai_runs FOR INSERT
    WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 4) updated_at triggers (raw_conversations + signal_candidates + signals)

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_raw_conversations_updated_at ON public.raw_conversations;
CREATE TRIGGER update_raw_conversations_updated_at
BEFORE UPDATE ON public.raw_conversations
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_signal_candidates_updated_at ON public.signal_candidates;
CREATE TRIGGER update_signal_candidates_updated_at
BEFORE UPDATE ON public.signal_candidates
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_signals_updated_at ON public.signals;
CREATE TRIGGER update_signals_updated_at
BEFORE UPDATE ON public.signals
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5) Chunking RPC (v0 stub) — creates 1 segment if none exist yet
CREATE OR REPLACE FUNCTION public.auto_chunk_conversation(
  p_conversation_id uuid,
  p_time_window_days integer DEFAULT 90,
  p_message_cap integer DEFAULT 1000
)
RETURNS TABLE (
  segment_id uuid,
  segment_number integer,
  message_count integer,
  date_range_start timestamptz,
  date_range_end timestamptz
) AS $$
DECLARE
  v_user_id uuid;
  v_raw_text text;
  v_total_messages integer;
  v_exists boolean;
BEGIN
  SELECT user_id, raw_text, message_count
    INTO v_user_id, v_raw_text, v_total_messages
  FROM public.raw_conversations
  WHERE id = p_conversation_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conversation not found: %', p_conversation_id;
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.conversation_segments
    WHERE conversation_id = p_conversation_id AND segment_number = 1
  ) INTO v_exists;

  IF v_exists THEN
    -- return existing segment 1
    RETURN QUERY
      SELECT id, segment_number, message_count, date_range_start, date_range_end
      FROM public.conversation_segments
      WHERE conversation_id = p_conversation_id AND segment_number = 1;
    RETURN;
  END IF;

  INSERT INTO public.conversation_segments (
    conversation_id, user_id, segment_number, segment_text, message_count,
    chunking_method, chunking_params
  )
  VALUES (
    p_conversation_id, v_user_id, 1, v_raw_text, coalesce(v_total_messages, 0),
    'auto_time_window',
    jsonb_build_object('time_window_days', p_time_window_days, 'message_cap', p_message_cap)
  )
  RETURNING id, segment_number, message_count, date_range_start, date_range_end
  INTO segment_id, segment_number, message_count, date_range_start, date_range_end;

  RETURN NEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.auto_chunk_conversation IS
  'v0 stub: creates one segment from entire raw_conversation if segment 1 does not exist.';
