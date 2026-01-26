/**
 * Calendar Reprocess API
 * GET /api/calendar/reprocess
 * 
 * Triggers the Hub-and-Spoke engine to cluster events into hubs
 * and returns the Semantic Coverage & Integrity Report.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { processContextHubs, generateIntegrityReport } from '@/lib/services/hub_service';
import { syncGoogleCalendar } from '@/lib/services/calendar_sync';

export async function GET(req: NextRequest) {
    try {
        const supabase = await createServerSupabaseClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const force = searchParams.get('force') === 'true';

        // 1. Optional Force Re-Sync for Anchor Recovery
        if (force) {
            console.log(`[Reprocess] Force re-sync requested for user ${user.id}`);
            // Find all active Google sources for this user
            const { data: sources } = await supabase
                .from('calendar_sources')
                .select('id')
                .eq('user_id', user.id)
                .eq('provider', 'google')
                .eq('status', 'active');

            if (sources) {
                for (const source of sources) {
                    await syncGoogleCalendar(source.id, 90);
                }
            }
        }

        // 2. Run Hub Clustering Engine
        console.log(`[Reprocess] Running Hub Engine for user ${user.id}`);
        const hubsCreated = await processContextHubs(user.id);

        // 3. Generate Integrity Report
        console.log(`[Reprocess] Generating Integrity Report for user ${user.id}`);
        const report = await generateIntegrityReport(user.id);

        return NextResponse.json({
            success: true,
            hubs_processed: hubsCreated,
            report
        });

    } catch (error: any) {
        console.error('Reprocess error:', error);
        return NextResponse.json({ error: error.message || 'Failed to reprocess hubs' }, { status: 500 });
    }
}
