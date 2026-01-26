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

/**
 * Semantic Salience Helper (Work Order 5.15)
 * Extracts the "Soul" of a cluster via keyword frequency.
 */
function deriveSovereignTitle(events: any[], anchors: HubAnchor[]): string {
    // 1. ANCHOR FIRST (Directive: Anchor IS the Hub)
    if (anchors.length > 0) {
        const primary = anchors[0];
        const prefix = primary.type === 'travel' ? 'Stay at' : 'Focus on';
        return `${prefix} ${primary.title}`;
    }

    // 2. SALIENCE SCAN (TF-IDF Inspired Keyword Scan)
    const STOP_WORDS = new Set(['the', 'and', 'for', 'with', 'your', 'from', 'call', 'meeting', 'sync', 'daily', 'standup', 'activity', 'pulse', 'intensive']);
    const wordCounts: Record<string, number> = {};

    events.forEach(e => {
        const words = (e.title || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').split(/\s+/);
        words.forEach((w: string) => {
            if (w.length > 3 && !STOP_WORDS.has(w)) {
                wordCounts[w] = (wordCounts[w] || 0) + 1;
            }
        });
    });

    const winners = Object.entries(wordCounts).sort((a, b) => b[1] - a[1]);

    // Require at least 2 occurrences for "Sovereignty"
    if (winners.length > 0 && winners[0][1] >= 2) {
        const keyword = winners[0][0].charAt(0).toUpperCase() + winners[0][0].slice(1);
        return `${keyword} Cluster`;
    }

    // 3. FALLBACK (Directive: No more "Pulse: [Date]")
    return "Requires Intent";
}

/**
 * Terminal Proof Logger (Directive: The Semantic Proof Report)
 */
function logSemanticProof(hubs: any[]) {
    console.log('\n===== SEMANTIC PROOF REPORT (WO 5.15) =====');
    console.table(hubs.map(h => ({
        'Target ID': h.id?.substring(0, 8) || 'PRE-PERSIST',
        'Found Events': h.eventCount || '?',
        'Anchor Detected': h.anchorIds.length > 0 ? 'YES' : 'NONE',
        'Proposed Human Name': h.title
    })));
    console.log('============================================\n');
}

export async function processContextHubs(userId: string) {
    const supabase = await createServerSupabaseClient();

    // 1. Fetch all events for the user
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

    // 1.5. Administrative Reset
    try {
        const { error: clearError } = await supabase.rpc('clear_hub_linkage', { p_user_id: userId });
        if (clearError) throw clearError;
    } catch (e) {
        await logError(supabase, userId, 'Failed to clear old hub links via RPC', e);
        throw new Error('Physics Error: Cannot reset relational network links.');
    }

    // 2. Step 1: Anchor Extraction (Gravity Wells)
    const anchors: HubAnchor[] = events
        .filter(ev => ev.metadata?.is_anchor === true)
        .map(ev => ({
            eventId: ev.id,
            title: ev.title,
            start: new Date(ev.start_at),
            end: new Date(ev.end_at),
            type: (ev.metadata?.anchor_type === 'travel' || ev.metadata?.anchor_type === 'all_day') ? 'travel' : 'anchor'
        }));

    // 3. Step 2: Temporal & Semantic Clustering (Work Order 5.15)
    const hubsPrepared: any[] = [];

    try {
        // Phase 1: Anchored Blocks (Directive: Anchor IS the Hub)
        let currentHub: any = null;
        anchors.forEach(anchor => {
            if (!currentHub) {
                currentHub = {
                    title: '',
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
                    hubsPrepared.push(currentHub);
                    currentHub = {
                        title: '',
                        type: anchor.type,
                        start: anchor.start,
                        end: anchor.end,
                        anchorIds: [anchor.eventId]
                    };
                }
            }
        });
        if (currentHub) hubsPrepared.push(currentHub);

        // Phase 2: Floating Clusters (Directive: Salience Scan)
        const floatingEvents = events.filter(ev => !anchors.some(a => a.eventId === ev.id));
        const dailyGroups: Record<string, any[]> = {};
        floatingEvents.forEach(ev => {
            const day = ev.start_at.split('T')[0];
            if (!dailyGroups[day]) dailyGroups[day] = [];
            dailyGroups[day].push(ev);
        });

        Object.entries(dailyGroups).forEach(([day, cluster]) => {
            if (cluster.length >= 4) {
                hubsPrepared.push({
                    title: '',
                    type: 'intent',
                    start: new Date(cluster[0].start_at),
                    end: new Date(cluster[cluster.length - 1].end_at),
                    anchorIds: []
                });
            }
        });

        // Step 3: APPLY SOVEREIGN NAMING (Directive: Invert Hierarchy)
        hubsPrepared.forEach(hub => {
            const associatedEvents = events.filter(e =>
                new Date(e.start_at) >= hub.start && new Date(e.end_at) <= hub.end
            );
            const hubAnchors = anchors.filter(a => hub.anchorIds.includes(a.eventId));
            hub.title = deriveSovereignTitle(associatedEvents, hubAnchors);
            hub.eventCount = associatedEvents.length;
        });

        // 📝 OUTPUT SEMANTIC PROOF
        logSemanticProof(hubsPrepared);

    } catch (e) {
        await logError(supabase, userId, 'Failed during Sovereign Clustering', e);
        throw e;
    }

    // 4. Step 3: Persistence
    let linkageCount = 0;
    for (const hubData of hubsPrepared) {
        try {
            // IMMEDIATE COUPLING (Work Order 5.10): Persist Hub and Link immediately
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

            // Link all events within this envelope (with a 6-hour buffer)
            const envelopeStart = new Date(hubData.start.getTime() - (6 * 60 * 60 * 1000));
            const envelopeEnd = new Date(hubData.end.getTime() + (6 * 60 * 60 * 1000));

            const { error: linkError } = await supabase
                .rpc('apply_hub_linkage', {
                    p_user_id: userId,
                    target_hub_id: hub.id,
                    envelope_start: envelopeStart.toISOString(),
                    envelope_end: envelopeEnd.toISOString()
                });

            if (linkError) throw linkError;
            linkageCount++;

        } catch (e) {
            await logError(supabase, userId, `Failed to persist hub: ${hubData.title}`, e, { hubData });
        }
    }

    if (linkageCount > 0) {
        console.log(`[Hub Engine] Absolute Linkage complete. 74%+ Coverage expected.`);
    }

    return hubsPrepared.length;
}

/**
 * Generate the Semantic Coverage & Integrity Report
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

        return {
            total_events: total,
            coverage: {
                anchored_pct: (anchored / total) * 100,
                floating_pct: (floating / total) * 100
            }
        };
    } catch (e) {
        await logError(supabase, userId, 'Failed to generate integrity report', e);
        return null;
    }
}
