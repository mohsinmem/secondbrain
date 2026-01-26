-- ============================================================================
-- AFERR SecondBrain — Work Order 5.10: The Absolute Linkage
-- SECURITY DEFINER RPC - Idempotent Version
-- ============================================================================

-- PHYSICS REPAIR: Explicitly drop previous variants to avoid overload errors
DROP FUNCTION IF EXISTS public.apply_hub_linkage(uuid, timestamptz, timestamptz); -- Old 5.7 signature
DROP FUNCTION IF EXISTS public.apply_hub_linkage(uuid, uuid, timestamptz, timestamptz); -- New 5.10 signature
DROP FUNCTION IF EXISTS public.clear_hub_linkage(); -- Old 5.7 signature
DROP FUNCTION IF EXISTS public.clear_hub_linkage(uuid); -- New 5.10 signature

-- 1. Create apply_hub_linkage with UTC Normalization
CREATE OR REPLACE FUNCTION public.apply_hub_linkage(
    p_user_id uuid,
    target_hub_id uuid, 
    envelope_start timestamptz, 
    envelope_end timestamptz
)
RETURNS void AS $$
BEGIN
    UPDATE public.calendar_events
    SET hub_id = target_hub_id
    WHERE user_id = p_user_id
    AND (start_at AT TIME ZONE 'UTC') >= (envelope_start AT TIME ZONE 'UTC')
    AND (end_at AT TIME ZONE 'UTC') <= (envelope_end AT TIME ZONE 'UTC');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Create clear_hub_linkage with Scoped Reset
CREATE OR REPLACE FUNCTION public.clear_hub_linkage(p_user_id uuid)
RETURNS void AS $$
BEGIN
    UPDATE public.calendar_events
    SET hub_id = null
    WHERE user_id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Audit policy reinforcement for context_hubs
DROP POLICY IF EXISTS context_hubs_select_own ON public.context_hubs;
DROP POLICY IF EXISTS context_hubs_insert_own ON public.context_hubs;
DROP POLICY IF EXISTS context_hubs_update_own ON public.context_hubs;
DROP POLICY IF EXISTS context_hubs_delete_own ON public.context_hubs;
DROP POLICY IF EXISTS context_hubs_all_own ON public.context_hubs;

CREATE POLICY context_hubs_all_own ON public.context_hubs
    FOR ALL 
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

COMMENT ON FUNCTION public.apply_hub_linkage(uuid, uuid, timestamptz, timestamptz) IS 'Administrative function to link events to hubs, bypassing RLS but respecting user scoping.';
