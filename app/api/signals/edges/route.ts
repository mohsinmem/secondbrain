import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

/**
 * Causal Edge API: Create Consequence Threads
 * Strictly anchors meaning (signal) between two truth atoms (events).
 * Guardrails: Forward-only chronological constraint.
 */
export async function POST(req: NextRequest) {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { source_event_id, signal_id, target_event_id } = await req.json();

        if (!source_event_id || !signal_id || !target_event_id) {
            return NextResponse.json({ error: 'Missing required anchoring fields' }, { status: 400 });
        }

        // 1. Fetch source and target events to verify existence, ownership, and chronology
        const { data: events, error: eventsError } = await supabase
            .from('calendar_events')
            .select('id, start_at')
            .in('id', [source_event_id, target_event_id])
            .eq('user_id', user.id);

        if (eventsError || !events || events.length < 2) {
            // Edge case: if source and target are the same event, lengths might be 1.
            // But we generally want distinct events for consequence threads.
            if (source_event_id === target_event_id) {
                return NextResponse.json({ error: 'Source and target events must be distinct for consequence threads' }, { status: 400 });
            }
            return NextResponse.json({ error: 'One or both events not found or access denied' }, { status: 404 });
        }

        const sourceEvent = events.find(e => e.id === source_event_id)!;
        const targetEvent = events.find(e => e.id === target_event_id)!;

        // 2. Strict Chronological Guardrail
        const sourceTime = new Date(sourceEvent.start_at).getTime();
        const targetTime = new Date(targetEvent.start_at).getTime();

        if (sourceTime >= targetTime) {
            return NextResponse.json({
                error: 'Causal direction must be forward in time. Source event must precede target event.'
            }, { status: 400 });
        }

        // 3. Verify Signal ownership and anchoring to source event
        const { data: signal, error: signalError } = await supabase
            .from('signals')
            .select('id, linked_event_id')
            .eq('id', signal_id)
            .eq('user_id', user.id)
            .single();

        if (signalError || !signal) {
            return NextResponse.json({ error: 'Signal not found or access denied' }, { status: 404 });
        }

        if (signal.linked_event_id !== source_event_id) {
            return NextResponse.json({
                error: 'Signal must be anchored to the specified source event'
            }, { status: 400 });
        }

        // 4. Create the Edge
        const { data: edge, error: edgeError } = await supabase
            .from('signal_edges')
            .insert({
                user_id: user.id,
                source_event_id,
                signal_id,
                target_event_id,
                edge_type: 'consequence'
            })
            .select()
            .single();

        if (edgeError) throw edgeError;

        return NextResponse.json({
            success: true,
            edge_id: edge.id
        });

    } catch (error: any) {
        console.error('[Causal Edge Error]:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
