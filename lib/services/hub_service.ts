/**
 * Hub-and-Spoke Engine (Work Order 6.0 - Sovereign Brain)
 */

import { createServerSupabaseClient } from '@/lib/supabase/server';

interface HubAnchor {
    eventId: string;
    title: string;
    start: Date;
    end: Date;
    type: 'travel' | 'project' | 'anchor' | 'strategic';
    location?: string;
    keywords?: string[];
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
 * Relational Entity Extraction
 */
function extractEntities(events: any[]): { people: string[], orgs: string[] } {
    const peopleSet = new Set<string>();
    const orgsSet = new Set<string>();

    const STRATEGIC_ORGS = ['TaskUs', 'Mapletree', 'PSDC', 'AFERR', 'Evivve', 'TaskUs Inc'];

    events.forEach(e => {
        if (e.attendees && Array.isArray(e.attendees)) {
            e.attendees.forEach((email: string) => {
                const name = email.split('@')[0].replace('.', ' ');
                const formattedName = name.replace(/\b\w/g, l => l.toUpperCase());
                peopleSet.add(formattedName);

                const domain = email.split('@')[1]?.toLowerCase();
                if (domain) {
                    STRATEGIC_ORGS.forEach(org => {
                        if (domain.includes(org.toLowerCase())) orgsSet.add(org);
                    });
                }
            });
        }

        const content = `${e.title} ${e.description || ''}`;
        STRATEGIC_ORGS.forEach(org => {
            if (content.toLowerCase().includes(org.toLowerCase())) orgsSet.add(org);
        });
    });

    return {
        people: Array.from(peopleSet),
        orgs: Array.from(orgsSet)
    };
}

/**
 * Sovereign Brain Sensemaking
 */
function findSuperAnchors(transcripts: any[], start: Date, end: Date, weights: Record<string, number>): string[] {
    const keywords = ['AFERR', 'PSDC', 'Evivve', 'Bangkok', 'TaskUs', 'Mapletree', 'Manila', 'Philippines'];
    const found: { keyword: string, weight: number }[] = [];

    const relevantTranscripts = transcripts.filter(t => {
        const tDate = new Date(t.created_at);
        return tDate >= start && tDate <= end;
    });

    relevantTranscripts.forEach(t => {
        const text = t.raw_text?.toLowerCase() || '';
        keywords.forEach(k => {
            if (text.includes(k.toLowerCase())) {
                const weight = weights[k] || 50;
                found.push({ keyword: k, weight });
            }
        });
    });

    // Sort by weight descending
    return Array.from(new Set(found.sort((a, b) => b.weight - a.weight).map(f => f.keyword)));
}

/**
 * Semantic Salience Helper (With Strategic Weighting)
 */
function deriveSovereignTitle(events: any[], anchors: HubAnchor[], superAnchors: string[], weights: Record<string, number>): string {
    // 1. STRATEGIC OVERRIDE (Directive: Multi-Source Sensemaking)
    if (superAnchors.length > 0) {
        const primary = superAnchors[0]; // Already sorted by weight
        if (primary === 'TaskUs') return `TaskUs Strategic Engagement`;
        if (primary === 'Philippines' || primary === 'Manila') return `Philippines Facilitation (Evivve)`;
        if (primary === 'Bangkok') return `Bangkok Strategic Sync`;
        return `${primary} Strategic Hub`;
    }

    // 2. ORG WEIGHTING FROM EVENTS
    const entities = extractEntities(events);
    if (entities.orgs.length > 0) {
        const weightedOrgs = entities.orgs.map(org => ({ org, weight: weights[org] || 50 }))
            .sort((a, b) => b.weight - a.weight);
        if (weightedOrgs[0].weight > 70) {
            return `${weightedOrgs[0].org} Focused Hub`;
        }
    }

    // 3. ANCHOR FIRST
    if (anchors.length > 0) {
        const primary = anchors[0];
        const prefix = primary.type === 'travel' ? 'Stay at' : 'Focus on';
        return `${prefix} ${primary.title}`;
    }

    return "Requires Intent";
}

export async function processContextHubs(userId: string) {
    const supabase = await createServerSupabaseClient();

    // 1. Fetch Events, Transcripts & Strategic Weights
    const [{ data: events }, { data: transcripts }, { data: priorityData }] = await Promise.all([
        supabase.from('calendar_events').select('*').eq('user_id', userId).order('start_at', { ascending: true }),
        supabase.from('raw_conversations').select('*').eq('user_id', userId),
        supabase.from('keyword_priorities').select('keyword, weight').eq('user_id', userId)
    ]);

    if (!events || events.length === 0) return 0;

    // Convert weights to record
    const weights: Record<string, number> = {};
    priorityData?.forEach(p => { weights[p.keyword] = p.weight; });

    // 2. Administrative Reset
    await supabase.rpc('clear_hub_linkage', { p_user_id: userId });

    // 3. Cadence & Guest Filtering
    const routineEvents = events.filter(e => {
        const isRecurring = e.metadata?.recurring === true;
        const isSoloGeneric = ['dinner', 'lunch', 'meeting'].some(t => e.title.toLowerCase().includes(t)) &&
            (!e.attendees || e.attendees.length <= 1);
        return isRecurring || isSoloGeneric;
    });
    const activeEvents = events.filter(e => !routineEvents.includes(e));

    // 4. Initial Anchors (Gravity Wells)
    const anchors: HubAnchor[] = activeEvents
        .filter(ev => ev.metadata?.is_anchor === true)
        .map(ev => ({
            eventId: ev.id,
            title: ev.title,
            start: new Date(ev.start_at),
            end: new Date(ev.end_at),
            type: (ev.metadata?.anchor_type === 'travel' || ev.metadata?.anchor_type === 'all_day') ? 'travel' : 'anchor',
            location: ev.location
        }));

    // 5. Clustering Loop (Work Order 6.0)
    const hubsPrepared: any[] = [];
    let currentHub: any = null;

    anchors.forEach(anchor => {
        if (!currentHub) {
            currentHub = {
                type: anchor.type,
                start: anchor.start,
                end: anchor.end,
                anchorIds: [anchor.eventId],
                location: anchor.location
            };
        } else {
            const gap = anchor.start.getTime() - currentHub.end.getTime();
            const sameLoc = anchor.location && currentHub.location && anchor.location.includes(currentHub.location);

            if (gap < 2 * 24 * 60 * 60 * 1000 && sameLoc) {
                currentHub.end = anchor.end;
                currentHub.anchorIds.push(anchor.eventId);
            } else {
                hubsPrepared.push(currentHub);
                currentHub = {
                    type: anchor.type,
                    start: anchor.start,
                    end: anchor.end,
                    anchorIds: [anchor.eventId],
                    location: anchor.location
                };
            }
        }
    });
    if (currentHub) hubsPrepared.push(currentHub);

    // 6. Enrichment & Sovereignty
    for (const hub of hubsPrepared) {
        const associatedEvents = activeEvents.filter(e =>
            new Date(e.start_at) >= hub.start && new Date(e.end_at) <= hub.end
        );

        const superAnchors = findSuperAnchors(transcripts || [], hub.start, hub.end, weights);
        const entities = extractEntities(associatedEvents);

        hub.title = deriveSovereignTitle(associatedEvents, anchors.filter(a => hub.anchorIds.includes(a.eventId)), superAnchors, weights);
        hub.eventCount = associatedEvents.length;
        hub.metadata = {
            ...entities,
            super_anchors: superAnchors,
            priority_shift: Object.keys(weights).length > 0,
            reset_at: new Date().toISOString()
        };
    }

    // 7. Persistence
    let linkageCount = 0;
    for (const hubData of hubsPrepared) {
        try {
            const { data: hub, error: hubError } = await supabase
                .from('context_hubs')
                .upsert({
                    user_id: userId,
                    title: hubData.title,
                    type: hubData.type,
                    start_at: hubData.start.toISOString(),
                    end_at: hubData.end.toISOString(),
                    metadata: hubData.metadata
                }, { onConflict: 'user_id, title, start_at' })
                .select('id')
                .single();

            if (hubError) throw hubError;

            const { error: linkError } = await supabase.rpc('apply_hub_linkage', {
                p_user_id: userId,
                target_hub_id: hub.id,
                envelope_start: new Date(hubData.start.getTime() - (6 * 60 * 60 * 1000)).toISOString(),
                envelope_end: new Date(hubData.end.getTime() + (6 * 60 * 60 * 1000)).toISOString()
            });

            if (!linkError) linkageCount++;
        } catch (e) {
            await logError(supabase, userId, `Failed to persist sovereign hub: ${hubData.title}`, e);
        }
    }

    return hubsPrepared.length;
}

/**
 * Relational Connectivity Report
 */
export async function generateIntegrityReport(userId: string) {
    const supabase = await createServerSupabaseClient();
    try {
        const { data: hubs } = await supabase.from('context_hubs').select('metadata').eq('user_id', userId);
        const totalPeople = new Set(hubs?.flatMap(h => h.metadata?.people || [])).size;
        const totalOrgs = new Set(hubs?.flatMap(h => h.metadata?.orgs || [])).size;

        return {
            people_nodes: totalPeople,
            organization_nodes: totalOrgs,
            status: 'Sovereign Brain v6.0 Active'
        };
    } catch (e) {
        return null;
    }
}
