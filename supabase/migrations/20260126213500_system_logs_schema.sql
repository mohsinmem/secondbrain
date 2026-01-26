-- ============================================================================
-- AFERR SecondBrain — Work Order 5.8: Telemetry & Error Propagation
-- System Logs Table (The Microscope)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.system_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    module text NOT NULL, -- e.g., 'hub_service', 'api/intent', 'rpc'
    level text DEFAULT 'error', -- 'error', 'warn', 'info'
    message text NOT NULL,
    stack_trace text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamptz DEFAULT now()
);

-- Indexes for diagnostic speed
CREATE INDEX IF NOT EXISTS idx_system_logs_user ON public.system_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_system_logs_module ON public.system_logs(module);
CREATE INDEX IF NOT EXISTS idx_system_logs_created ON public.system_logs(created_at DESC);

-- RLS: Minimal protection (Only owner can see their logs)
ALTER TABLE public.system_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY system_logs_select_own ON public.system_logs
    FOR SELECT USING (user_id = auth.uid());

-- Permit insertion by system (even if technically unauthenticated during some server runs)
-- But usually the API has a user context.
CREATE POLICY system_logs_insert_own ON public.system_logs
    FOR INSERT WITH CHECK (user_id = auth.uid() OR user_id IS NULL);

COMMENT ON TABLE public.system_logs IS 'Central ledger for system-level errors and telemetry. Used for debugging complex relational logic.';
