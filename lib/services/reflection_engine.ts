/**
 * Reflection Engine (Work Order 5)
 * 
 * Implements the Weighted Proximity Algorithm to generate signal candidates
 * from Contextual Hubs and weighted events.
 */

import { createServerSupabaseClient } from '@/lib/supabase/server';

interface Candidate {
    eventId: string;
    title: string;
    weight: number;
    reason: string;
}

export async function generateReflectionCandidates(hubId: string) {
    const supabase = await createServerSupabaseClient();

    // 1. Fetch Hub and its events (Filter out already processed ones)
    const { data: hub } = await supabase
        .from('context_hubs')
        .select('*')
        .eq('id', hubId)
        .single();

    if (!hub) return [];

    // Filter out:
    // 1. Explicitly dismissed events
    // 2. Events that are already part of a signal
    const { data: events } = await supabase
        .from('calendar_events')
        .select('*')
        .eq('hub_id', hubId)
        .is('dismissed_at', null);

    if (!events) return [];

    // Further precision: Check signals table for processed events
    const { data: existingSignals } = await supabase
        .from('signals')
        .select('source_event_id')
        .eq('user_id', hub.user_id);

    const processedEventIds = new Set(existingSignals?.map(s => s.source_event_id) || []);
    const unProcessedEvents = events.filter(e => !processedEventIds.has(e.id));

    // 2. Weights Matrix
    const WEIGHTS = {
        PRIMARY_ANCHOR: 1.0,  // Flights/Hotels
        SECONDARY_SPIKE: 0.8, // High-duration (>2h)
        ASSOCIATIVE_PULSE: 0.5 // Routine
    };

    // 3. Candidate Generation Logic
    const candidates: Candidate[] = unProcessedEvents.map(ev => {
        let weight = WEIGHTS.ASSOCIATIVE_PULSE;
        let reason = 'Contextual occurrence';

        const lowerTitle = ev.title.toLowerCase();
        const durationMin = (new Date(ev.end_at).getTime() - new Date(ev.start_at).getTime()) / 60000;

        // Anchor Check
        if (ev.metadata?.is_anchor) {
            weight = WEIGHTS.PRIMARY_ANCHOR;
            reason = 'Primary Hub Anchor';
        }
        // Secondary Spike (Duration)
        else if (durationMin >= 120) {
            weight = WEIGHTS.SECONDARY_SPIKE;
            reason = 'High-duration activity spike';
        }
        // Keyword Pulse (Projects/Themes)
        else if (lowerTitle.includes('sync') || lowerTitle.includes('review') || lowerTitle.includes('workshop')) {
            weight = 0.7;
            reason = 'Synchronicity pulse';
        }

        return {
            eventId: ev.id,
            title: ev.title,
            weight,
            reason
        };
    });

    // Sort by weight (highest priority first)
    return candidates.sort((a, b) => b.weight - a.weight);
}

/**
 * Promote an event to a Signal (Cognition Layer)
 */
export async function promoteToSignal(userId: string, eventId: string, metadata: any = {}, attributes: string[] = []) {
    const supabase = await createServerSupabaseClient();

    // 1. Fetch original event for context (includes hub_id)
    const { data: event } = await supabase
        .from('calendar_events')
        .select('*, hub_id')
        .eq('id', eventId)
        .single();

    if (!event) return { error: 'Event not found' };

    // 2. Persist Wisdom to the Hub (Direct Persistence)
    if (event.hub_id && attributes.length > 0) {
        const { data: hub } = await supabase
            .from('context_hubs')
            .select('relational_metadata')
            .eq('id', event.hub_id)
            .single();

        const existingMetadata = Array.isArray(hub?.relational_metadata) ? hub.relational_metadata : [];
        const updatedMetadata = Array.from(new Set([...existingMetadata, ...attributes]));

        await supabase
            .from('context_hubs')
            .update({ relational_metadata: updatedMetadata })
            .eq('id', event.hub_id);

        // 3. TRIGGER WISDOM PROPAGATION (Work Order 6.1)
        // Dynamically import to avoid circular dependency
        const { propagateWisdom } = await import('./hub_service');
        await propagateWisdom(userId, attributes, event.title);
    }

    // 4. Create signal in public.signals (Phase 5 Cognition Layer)
    const { data: signal, error } = await supabase
        .from('signals')
        .insert({
            user_id: userId,
            source_event_id: eventId,
            title: event.title,
            origin_type: 'reflection_swipe',
            metadata: {
                ...metadata,
                start_at: event.start_at,
                location: event.location,
                wisdom_attributes: attributes
            }
        })
        .select()
        .single();

    return { signal, error };
}

/**
 * Permanently dismiss an event as noise
 */
export async function dismissEvent(userId: string, eventId: string) {
    const supabase = await createServerSupabaseClient();

    const { error } = await supabase
        .from('calendar_events')
        .update({ dismissed_at: new Date().toISOString() })
        .eq('id', eventId)
        .eq('user_id', userId);

    return { error };
}
