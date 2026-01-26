/**
 * Hubs Diagnostic Endpoint
 * GET /api/diagnostics/hubs
 * 
 * Performs a multi-step "Physics" check on the relational network.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
    const supabase = await createServerSupabaseClient();
    const results = {
        timestamp: new Date().toISOString(),
        steps: {
            auth_uid: { status: 'pending', value: null },
            anchors_count: { status: 'pending', value: 0 },
            events_count: { status: 'pending', value: 0 },
            rpc_physics: { status: 'pending', error: null },
            system_logs: { status: 'pending', recent_errors: [] }
        } as any
    };

    try {
        // Step 1: Auth Resolve
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            results.steps.auth_uid = { status: 'fail', value: 'Unauthorized' };
            return NextResponse.json(results, { status: 401 });
        }
        results.steps.auth_uid = { status: 'pass', value: user.id };

        // Step 2: Anchors Count
        const { count: anchorsCount, error: anchorsError } = await supabase
            .from('calendar_events')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', user.id)
            .filter('metadata->is_anchor', 'eq', true);

        results.steps.anchors_count = {
            status: anchorsError ? 'fail' : 'pass',
            value: anchorsCount || 0
        };

        // Step 3: Events Count
        const { count: eventsCount, error: eventsError } = await supabase
            .from('calendar_events')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', user.id);

        results.steps.events_count = {
            status: eventsError ? 'fail' : 'pass',
            value: eventsCount || 0
        };

        // Step 4: RPC Physics (Dry run or Clear attempt)
        const { error: rpcError } = await supabase.rpc('clear_hub_linkage');
        results.steps.rpc_physics = {
            status: rpcError ? 'fail' : 'pass',
            error: rpcError ? rpcError.message : null
        };

        // Step 5: Recent System Logs
        const { data: recentLogs } = await supabase
            .from('system_logs')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(5);

        results.steps.system_logs = {
            status: 'pass',
            recent_errors: recentLogs || []
        };

        return NextResponse.json(results);

    } catch (error: any) {
        return NextResponse.json({
            success: false,
            error: error.message,
            partial_results: results
        }, { status: 500 });
    }
}
