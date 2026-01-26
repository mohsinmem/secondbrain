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

export async function processContextHubs(userId: string) {
    const supabase = await createServerSupabaseClient();

    // 1. Fetch all events for the user (90-day window)
    const { data: events, error: fetchError } = await supabase
        .from('calendar_events')
        .select('*')
        .eq('user_id', userId)
        .order('start_at', { ascending: true });

    if (fetchError || !events) {
        console.error('[Hub Engine] Failed to fetch events:', fetchError);
        return;
    }

    // 1.5. Clear existing hub links for a fresh run
    // PHYSICS REPAIR (Work Order 5.7): Call SECURITY DEFINER RPC to bypass RLS
    const { error: clearError } = await supabase.rpc('clear_hub_linkage');

    if (clearError) console.error('[Hub Engine] Failed to clear old hub links via RPC:', clearError);

    console.log(`[Hub Engine] Processing ${events.length} events for user ${userId}`);

    // 2. Step 1: Anchor Detection
    // All anchors (Travel, Stay, or Dense Block) act as gravity wells
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
            // Group anchors within 5 days of each other into one context
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

    // Group 2: Activity Gaps (Create "Contextual Pulses" for dense non-anchored periods)
    const floatingEvents = events.filter(ev => !anchors.some(a => a.eventId === ev.id));
    const dailyClusters: Record<string, any[]> = {};
    floatingEvents.forEach(ev => {
        const day = ev.start_at.split('T')[0];
        if (!dailyClusters[day]) dailyClusters[day] = [];
        dailyClusters[day].push(ev);
    });

    Object.entries(dailyClusters).forEach(([day, cluster]) => {
        if (cluster.length >= 4) { // Dense activity cluster
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

    // 4. Step 3: Persistence
    for (const hubData of hubsToCreate) {
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

        if (hubError) continue;

        // Link all events within this envelope (with a 6-hour buffer for arrival/departure events)
        const envelopeStart = new Date(hubData.start.getTime() - (6 * 60 * 60 * 1000));
        const envelopeEnd = new Date(hubData.end.getTime() + (6 * 60 * 60 * 1000));

        // PHYSICS REPAIR (Work Order 5.7): Call SECURITY DEFINER RPC to bypass RLS
        const { error: linkError } = await supabase
            .rpc('apply_hub_linkage', {
                target_hub_id: hub.id,
                envelope_start: envelopeStart.toISOString(),
                envelope_end: envelopeEnd.toISOString()
            });

        if (linkError) console.error('[Hub Engine] Failed to link events via RPC:', linkError);
    }

    return hubsToCreate.length;
}

/**
 * Generate the Semantic Coverage & Integrity Report (Work Order 5 Directive)
 */
export async function generateIntegrityReport(userId: string) {
    const supabase = await createServerSupabaseClient();

    const { data: events } = await supabase
        .from('calendar_events')
        .select('id, metadata, hub_id, start_at')
        .eq('user_id', userId);

    if (!events) return null;

    const total = events.length;
    const anchored = events.filter(e => e.hub_id).length;
    const floating = total - anchored;

    // Gap Analysis: Identify "High-Activity Gaps" (Periods without hubs)
    const floatingEvents = events.filter(e => !e.hub_id);
    const primaryAnchors = events.filter(e => e.metadata?.is_anchor);
    let gapsCount = 0;
    if (floatingEvents.length > 0) {
        // Group floating events by day and see where they cluster
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
}
