/**
 * Hub-and-Spoke Engine (Work Order 5)
 * 
 * Responsible for clustering raw calendar events into "Contextual Hubs"
 * using anchor detection and temporal envelopes.
 */

import { createServerSupabaseClient } from '@/lib/supabase/server';

interface HubAnchor {
    eventId: string;
    title: string;
    start: Date;
    end: Date;
    type: 'travel' | 'project' | 'anchor';
}

/**
 * Telemetry Logger
 */
async function logError(supabase: any, userId: string, message: string, error: any, context: any = {}) {
    console.error(`[Telemetry] ${message}`, error);
    await supabase.from('system_logs').insert({
        user_id: userId,
        module: 'hub_service',
        message,
        stack_trace: error?.stack || JSON.stringify(error),
        metadata: { ...context, error_string: String(error) }
    });
}

export async function processContextHubs(userId: string) {
    const supabase = await createServerSupabaseClient();

    // 1. Fetch all events for the user (90-day window)
    let events;
    try {
        const { data, error: fetchError } = await supabase
            .from('calendar_events')
            .select('*')
            .eq('user_id', userId)
            .order('start_at', { ascending: true });

        if (fetchError) throw fetchError;
        events = data;
    } catch (e) {
        await logError(supabase, userId, 'Failed to fetch events for clustering', e);
        return;
    }

    if (!events || events.length === 0) {
        console.log('[Hub Engine] No events found to process.');
        return;
    }

    // 1.5. Clear existing hub links for a fresh run
    try {
        // PHYSICS REPAIR (Work Order 5.7): Call SECURITY DEFINER RPC to bypass RLS
        const { error: clearError } = await supabase.rpc('clear_hub_linkage');
        if (clearError) throw clearError;
    } catch (e) {
        await logError(supabase, userId, 'Failed to clear old hub links via RPC', e);
        // Continue anyway? Or stop? Let's stop to be safe.
        throw new Error('Physics Error: Cannot reset relational network links.');
    }

    console.log(`[Hub Engine] Processing ${events.length} events for user ${userId}`);

    // 2. Step 1: Anchor Detection
    const anchors: HubAnchor[] = events
        .filter(ev => {
            const metadata = ev.metadata || {};
            return metadata.is_anchor === true;
        })
        .map(ev => ({
            eventId: ev.id,
            title: ev.title,
            start: new Date(ev.start_at),
            end: new Date(ev.end_at),
            type: (ev.metadata?.anchor_type === 'travel' || ev.metadata?.anchor_type === 'all_day') ? 'travel' : 'anchor'
        }));

    // 3. Step 2: Temporal Clustering & Fallback
    const hubsToCreate: { title: string; type: string; start: Date; end: Date; anchorIds: string[] }[] = [];

    try {
        // Group 1: Anchored Hubs (Travel/Stay primary)
        let currentHub: typeof hubsToCreate[0] | null = null;
        anchors.forEach(anchor => {
            if (!currentHub) {
                currentHub = {
                    title: anchor.type === 'travel' ? `Trip: ${anchor.title}` : `Focus: ${anchor.title}`,
                    type: anchor.type,
                    start: anchor.start,
                    end: anchor.end,
                    anchorIds: [anchor.eventId]
                };
            } else {
                const gap = anchor.start.getTime() - currentHub.end.getTime();
                if (gap < 5 * 24 * 60 * 60 * 1000) {
                    currentHub.end = anchor.end;
                    currentHub.anchorIds.push(anchor.eventId);
                } else {
                    hubsToCreate.push(currentHub);
                    currentHub = {
                        title: anchor.type === 'travel' ? `Trip: ${anchor.title}` : `Focus: ${anchor.title}`,
                        type: anchor.type,
                        start: anchor.start,
                        end: anchor.end,
                        anchorIds: [anchor.eventId]
                    };
                }
            }
        });
        if (currentHub) hubsToCreate.push(currentHub);

        // Group 2: Activity Gaps (Contextual Pulses)
        const floatingEvents = events.filter(ev => !anchors.some(a => a.eventId === ev.id));
        const dailyClusters: Record<string, any[]> = {};
        floatingEvents.forEach(ev => {
            const day = ev.start_at.split('T')[0];
            if (!dailyClusters[day]) dailyClusters[day] = [];
            dailyClusters[day].push(ev);
        });

        Object.entries(dailyClusters).forEach(([day, cluster]) => {
            if (cluster.length >= 4) {
                const startStr = cluster[0].start_at;
                const endStr = cluster[cluster.length - 1].end_at;
                hubsToCreate.push({
                    title: `Pulse: ${day} activity`,
                    type: 'intent',
                    start: new Date(startStr),
                    end: new Date(endStr),
                    anchorIds: []
                });
            }
        });
    } catch (e) {
        await logError(supabase, userId, 'Failed during temporal clustering logic', e);
        throw e;
    }

    // 4. Step 3: Persistence
    for (const hubData of hubsToCreate) {
        try {
            const { data: hub, error: hubError } = await supabase
                .from('context_hubs')
                .upsert({
                    user_id: userId,
                    title: hubData.title,
                    type: hubData.type,
                    start_at: hubData.start.toISOString(),
                    end_at: hubData.end.toISOString(),
                    metadata: { anchors: hubData.anchorIds }
                }, { onConflict: 'user_id, title, start_at' })
                .select('id')
                .single();

            if (hubError) throw hubError;

            const envelopeStart = new Date(hubData.start.getTime() - (6 * 60 * 60 * 1000));
            const envelopeEnd = new Date(hubData.end.getTime() + (6 * 60 * 60 * 1000));

            const { error: linkError } = await supabase
                .rpc('apply_hub_linkage', {
                    target_hub_id: hub.id,
                    envelope_start: envelopeStart.toISOString(),
                    envelope_end: envelopeEnd.toISOString()
                });

            if (linkError) throw linkError;
        } catch (e) {
            await logError(supabase, userId, `Failed to persist hub: ${hubData.title}`, e, { hubData });
            // Continue to next hub
        }
    }

    return hubsToCreate.length;
}

/**
 * Generate the Semantic Coverage & Integrity Report (Work Order 5 Directive)
 */
export async function generateIntegrityReport(userId: string) {
    const supabase = await createServerSupabaseClient();

    try {
        const { data: events, error } = await supabase
            .from('calendar_events')
            .select('id, metadata, hub_id, start_at')
            .eq('user_id', userId);

        if (error) throw error;
        if (!events) return null;

        const total = events.length;
        const anchored = events.filter(e => e.hub_id).length;
        const floating = total - anchored;

        const floatingEvents = events.filter(e => !e.hub_id);
        const primaryAnchors = events.filter(e => e.metadata?.is_anchor);
        let gapsCount = 0;
        if (floatingEvents.length > 0) {
            const dailyPulse: Record<string, number> = {};
            floatingEvents.forEach(e => {
                const day = e.start_at?.split('T')[0] || 'Unknown';
                dailyPulse[day] = (dailyPulse[day] || 0) + 1;
            });
            gapsCount = Object.values(dailyPulse).filter(count => count > 3).length;
        }

        return {
            total_events: total,
            primary_anchors_found: primaryAnchors.length,
            coverage: {
                anchored_pct: (anchored / total) * 100,
                floating_pct: (floating / total) * 100
            },
            gap_analysis: gapsCount > 0
                ? `Detected ${gapsCount} clusters of activity missing orientation anchors.`
                : "No significant coverage gaps identified."
        };
    } catch (e) {
        await logError(supabase, userId, 'Failed to generate integrity report', e);
        return null;
    }
}
