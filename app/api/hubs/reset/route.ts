/**
 * Nuclear Reset API
 * POST /api/hubs/reset
 * 
 * Directive: Burn the "dumb" data to prove the "smart" logic works.
 * Wipes all hubs and triggers a fresh Sovereign Brain rebuild.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { processContextHubs } from '@/lib/services/hub_service';

export async function POST(req: NextRequest) {
    try {
        const supabase = await createServerSupabaseClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        console.log(`[Nuclear Reset] Initiated by user ${user.id}`);

        // 1. Wipe the state
        // We use the existing RPC which clears both hubs and linkages specifically for this user
        const { error: resetError } = await supabase.rpc('clear_hub_linkage', { p_user_id: user.id });
        if (resetError) throw resetError;

        // 2. Also explicitly delete the hubs to be certain of a "Nuclear" wipe
        const { error: deleteError } = await supabase
            .from('context_hubs')
            .delete()
            .eq('user_id', user.id);

        if (deleteError) throw deleteError;

        // 3. Trigger the fresh "Sovereign Brain" build
        const hubCount = await processContextHubs(user.id);

        return NextResponse.json({
            success: true,
            message: 'Nuclear Reset complete. Relational network rebuilt from scratch.',
            hubsCount: hubCount
        });

    } catch (error: any) {
        console.error('Nuclear Reset failed:', error);
        return NextResponse.json({ error: error.message || 'Nuclear Reset failed' }, { status: 500 });
    }
}
