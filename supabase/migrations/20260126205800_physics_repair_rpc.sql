-- ============================================================================
-- AFERR SecondBrain — Work Order 5.7: The Physics Repair
-- SECURITY DEFINER RPC for Hub-to-Event Linkage
-- ============================================================================

-- This RPC allows the Hub Engine to update calendar_events even with RLS enabled
-- by using SECURITY DEFINER. User isolation is maintained via auth.uid().

CREATE OR REPLACE FUNCTION public.apply_hub_linkage(
    target_hub_id uuid, 
    envelope_start timestamptz, 
    envelope_end timestamptz
)
RETURNS void AS $$
BEGIN
    UPDATE public.calendar_events
    SET hub_id = target_hub_id
    WHERE user_id = auth.uid()  -- VITAL: Preserve user isolation
    AND start_at >= envelope_start
    AND end_at <= envelope_end;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC for clearing hub links (Bypasses RLS via SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.clear_hub_linkage()
RETURNS void AS $$
BEGIN
    UPDATE public.calendar_events
    SET hub_id = null
    WHERE user_id = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Audit policy reinforcement for context_hubs
-- Ensure hubs are fully accessible and manageable by their owners
DROP POLICY IF EXISTS context_hubs_select_own ON public.context_hubs;
DROP POLICY IF EXISTS context_hubs_insert_own ON public.context_hubs;
DROP POLICY IF EXISTS context_hubs_update_own ON public.context_hubs;
DROP POLICY IF EXISTS context_hubs_delete_own ON public.context_hubs;

CREATE POLICY context_hubs_all_own ON public.context_hubs
    FOR ALL 
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

COMMENT ON FUNCTION public.apply_hub_linkage IS 'Administrative function to link events to hubs, bypassing RLS but respecting auth.uid().';
