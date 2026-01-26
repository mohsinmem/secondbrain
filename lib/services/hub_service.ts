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
    const { error: clearError } = await supabase
        .from('calendar_events')
        .update({ hub_id: null })
        .eq('user_id', userId);

    if (clearError) console.error('[Hub Engine] Failed to clear old hub links:', clearError);

    console.log(`[Hub Engine] Processing ${events.length} events for user ${userId}`);

    // 2. Step 1: Anchor Detection
    // Flights, Hotels, and All-Day events act as Primary Gravitational Hubs
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
            type: (ev.metadata?.anchor_type === 'travel') ? 'travel' : 'anchor'
        }));

    // 3. Step 2: Temporal Clustering
    // Group travel anchors that are close together (e.g. Flight In -> Hotel -> Flight Out)
    const travelHubs: { title: string; start: Date; end: Date; anchorIds: string[] }[] = [];

    let currentTravelHub: typeof travelHubs[0] | null = null;

    anchors.forEach(anchor => {
        if (anchor.type === 'travel') {
            if (!currentTravelHub) {
                currentTravelHub = {
                    title: `Trip: ${anchor.title}`,
                    start: anchor.start,
                    end: anchor.end,
                    anchorIds: [anchor.eventId]
                };
            } else {
                // If this travel anchor is within 14 days of the last one, expand the hub
                const gap = anchor.start.getTime() - currentTravelHub.end.getTime();
                if (gap < 14 * 24 * 60 * 60 * 1000) {
                    currentTravelHub.end = anchor.end;
                    currentTravelHub.anchorIds.push(anchor.eventId);
                    // Update title if we find a destination city etc (future polish)
                } else {
                    travelHubs.push(currentTravelHub);
                    currentTravelHub = {
                        title: `Trip: ${anchor.title}`,
                        start: anchor.start,
                        end: anchor.end,
                        anchorIds: [anchor.eventId]
                    };
                }
            }
        }
    });
    if (currentTravelHub) travelHubs.push(currentTravelHub);

    // 4. Step 3: Persistence
    // Create hubs in DB and link events
    for (const hubData of travelHubs) {
        const { data: hub, error: hubError } = await supabase
            .from('context_hubs')
            .upsert({
                user_id: userId,
                title: hubData.title,
                type: 'travel',
                start_at: hubData.start.toISOString(),
                end_at: hubData.end.toISOString(),
                metadata: { anchors: hubData.anchorIds }
            }, { onConflict: 'user_id, title, start_at' }) // Basic dedupe
            .select('id')
            .single();

        if (hubError) {
            console.error('[Hub Engine] Failed to create hub:', hubError);
            continue;
        }

        // Link all events within this temporal envelope to the hub
        const { error: linkError } = await supabase
            .from('calendar_events')
            .update({ hub_id: hub.id })
            .eq('user_id', userId)
            .gte('start_at', hubData.start.toISOString())
            .lte('end_at', hubData.end.toISOString());

        if (linkError) console.error('[Hub Engine] Failed to link events to hub:', linkError);
    }

    return travelHubs.length;
}

/**
 * Generate the Semantic Coverage & Integrity Report (Work Order 5 Directive)
 */
export async function generateIntegrityReport(userId: string) {
    const supabase = await createServerSupabaseClient();

    const { data: events } = await supabase
        .from('calendar_events')
        .select('id, metadata, hub_id')
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
            const day = e.metadata?.start_at?.split('T')[0] || 'Unknown';
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
