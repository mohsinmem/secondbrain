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

    // 1. Fetch Hub and its events
    const { data: hub } = await supabase
        .from('context_hubs')
        .select('*')
        .eq('id', hubId)
        .single();

    if (!hub) return [];

    const { data: events } = await supabase
        .from('calendar_events')
        .select('*')
        .eq('hub_id', hubId);

    if (!events) return [];

    // 2. Weights Matrix
    const WEIGHTS = {
        PRIMARY_ANCHOR: 1.0,  // Flights/Hotels
        SECONDARY_SPIKE: 0.8, // High-duration (>2h)
        ASSOCIATIVE_PULSE: 0.5 // Routine
    };

    // 3. Candidate Generation Logic
    const candidates: Candidate[] = events.map(ev => {
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
export async function promoteToSignal(userId: string, eventId: string, metadata: any = {}) {
    const supabase = await createServerSupabaseClient();

    // Fetch original event for context
    const { data: event } = await supabase
        .from('calendar_events')
        .select('*')
        .eq('id', eventId)
        .single();

    if (!event) return { error: 'Event not found' };

    // Create signal in public.signals (Phase 5 Cognition Layer)
    // Note: Assuming 'signals' table exists from earlier phases or WO 5 spec
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
            }
        })
        .select()
        .single();

    return { signal, error };
}
