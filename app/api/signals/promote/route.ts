import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

/**
 * Promotion API: Signal Candidate -> Durable Signal
 * Strictly anchors meaning to truth without salience creep.
 */
export async function POST(req: NextRequest) {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { candidate_id, linked_event_id, weights } = await req.json();

        if (!candidate_id || !linked_event_id) {
            return NextResponse.json({ error: 'Missing candidate_id or linked_event_id' }, { status: 400 });
        }

        // 1. Fetch and Verify Candidate
        const { data: candidate, error: candidateError } = await supabase
            .from('signal_candidates')
            .select('*')
            .eq('id', candidate_id)
            .eq('user_id', user.id)
            .single();

        if (candidateError || !candidate) {
            return NextResponse.json({ error: 'Candidate not found or access denied' }, { status: 404 });
        }

        // 2. Verify Event
        const { data: event, error: eventError } = await supabase
            .from('calendar_events')
            .select('id')
            .eq('id', linked_event_id)
            .eq('user_id', user.id)
            .single();

        if (eventError || !event) {
            return NextResponse.json({ error: 'Linked event not found' }, { status: 404 });
        }

        // 3. Create Durable Signal
        // We inherit the candidate's core content while adding traceability
        const { data: signal, error: signalError } = await supabase
            .from('signals')
            .insert({
                user_id: user.id,
                label: candidate.label,
                description: candidate.description,
                signal_type: candidate.signal_type,

                // Bidirectional Traceability (Step 4)
                linked_event_id: linked_event_id,
                source_candidate_id: candidate_id,
                source_ai_run_id: candidate.ai_run_id,

                // Context Traceability
                source_conversation_id: candidate.source_conversation_id,
                source_excerpt: candidate.source_excerpt,

                // Human Weights (Opt-in)
                relevance: weights?.relevance ?? null,
                energy_impact: weights?.energy_impact ?? null,
                confidence: weights?.confidence ?? 'Med' // Epistemic humility
            })
            .select()
            .single();

        if (signalError) throw signalError;

        // 4. Update Candidate Promotion Status
        const { error: updateError } = await supabase
            .from('signal_candidates')
            .update({
                promotion_status: 'promoted',
                review_status: 'reviewed' // Sync with v0 status if needed
            })
            .eq('id', candidate_id);

        if (updateError) throw updateError;

        return NextResponse.json({
            success: true,
            signal_id: signal.id
        });

    } catch (error: any) {
        console.error('[Promotion Error]:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
