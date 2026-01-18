-- Refined Migration for Step 6: Consequence Threads (Causal Mapping)
-- Location: supabase/migrations/20260118010000_step6_consequences.sql

CREATE TABLE IF NOT EXISTS public.signal_edges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- Mandatory anchoring to both ends (Step 6 refined requirement)
    source_event_id UUID NOT NULL REFERENCES public.calendar_events(id) ON DELETE CASCADE,
    signal_id UUID NOT NULL REFERENCES public.signals(id) ON DELETE CASCADE,
    target_event_id UUID NOT NULL REFERENCES public.calendar_events(id) ON DELETE CASCADE,
    
    edge_type TEXT NOT NULL DEFAULT 'consequence',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- RLS Policies
ALTER TABLE public.signal_edges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own signal edges" 
    ON public.signal_edges 
    FOR ALL 
    USING (auth.uid() = user_id);

-- Indexes for efficient fetching
CREATE INDEX IF NOT EXISTS idx_signal_edges_user_id ON public.signal_edges(user_id);
CREATE INDEX IF NOT EXISTS idx_signal_edges_source_event_id ON public.signal_edges(source_event_id);
CREATE INDEX IF NOT EXISTS idx_signal_edges_signal_id ON public.signal_edges(signal_id);
CREATE INDEX IF NOT EXISTS idx_signal_edges_target_event_id ON public.signal_edges(target_event_id);

COMMENT ON TABLE public.signal_edges IS 'User-created causal threads linking validated meaning (signals) anchored in a source event to subsequent target events.';
