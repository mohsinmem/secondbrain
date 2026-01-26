/**
 * Manual Sync API
 * POST /api/calendar/sync
 * 
 * Allows users to manually trigger a sync for a specific calendar source.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { syncGoogleCalendar } from '@/lib/services/calendar_sync';

async function handleSync(req: NextRequest) {
    try {
        const supabase = await createServerSupabaseClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const sourceId = searchParams.get('source_id');
        const force = searchParams.get('force') === 'true';

        if (!sourceId) {
            return NextResponse.json({ error: 'Missing source_id' }, { status: 400 });
        }

        // Verify ownership
        const { data: source, error: sourceError } = await supabase
            .from('calendar_sources')
            .select('id, provider')
            .eq('id', sourceId)
            .eq('user_id', user.id)
            .single();

        if (sourceError || !source) {
            return NextResponse.json({ error: 'Source not found' }, { status: 404 });
        }

        if (source.provider !== 'google') {
            return NextResponse.json({ error: 'Sync only supported for Google sources' }, { status: 400 });
        }

        console.log(`[Manual Sync] Triggering sync for source ${sourceId} (Force: ${force})`);

        // Run sync (default 90 days lookback)
        // Note: The syncGoogleCalendar function handles upserts naturally via external_event_id conflict.
        const count = await syncGoogleCalendar(source.id, 90);

        return NextResponse.json({ success: true, count, forced: force });

    } catch (error: any) {
        console.error('Manual sync error:', error);
        return NextResponse.json({ error: error.message || 'Failed to sync calendar' }, { status: 500 });
    }
}

export async function GET(req: NextRequest) {
    return handleSync(req);
}

export async function POST(req: NextRequest) {
    return handleSync(req);
}
