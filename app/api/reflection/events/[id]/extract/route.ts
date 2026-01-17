import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const FORBIDDEN_TERMS = [
    'top', 'priority', 'important', 'importance', 'critical', 'urgent',
    'must', 'should', 'high-impact', 'low-impact', 'key', 'strategic',
    'score', 'rating', 'rank', 'best', 'worst'
];

interface SignalCandidate {
    candidate_text: string;
    why_surfaced: string;
    ambiguity_note: string;
}

/**
 * Heuristic Signal Proposer (v0-safe)
 * Strictly observational. No interpretion.
 */
function proposeHeuristicCandidates(event: any, contexts: any[]): SignalCandidate[] {
    const candidates: SignalCandidate[] = [];
    const allText = contexts.map(c => c.content).join(' ').toLowerCase();

    // 1. Commitment/Action Hypotheses
    if (/i will|we will|let's|lets|promise|committed to/i.test(allText)) {
        candidates.push({
            candidate_text: "The context indicates a possible commitment or forward-looking intent associated with this event.",
            why_surfaced: "Detected commitment-oriented language ('i will', 'let's', etc.) in the attached notes or conversations.",
            ambiguity_note: "Commitments expressed in text may be casual, aspirational, or already superseded by subsequent actions."
        });
    }

    // 2. Question/Open Loop Hypotheses
    if (allText.includes('?') || /question|ask|wonder|verify|check/i.test(allText)) {
        candidates.push({
            candidate_text: "An open question or unresolved inquiry appears to be anchored to this event context.",
            why_surfaced: "Detected interrogative punctuation or inquiry-related terms in the context.",
            ambiguity_note: "The question might be rhetorical, historical, or already resolved within the uncaptured part of the context."
        });
    }

    // 3. Blocker/Risk Hypotheses
    if (/blocked|issue|problem|concern|stuck|risk|delay/i.test(allText)) {
        candidates.push({
            candidate_text: "A possible structural blocker or identified concern is referenced in relation to this event.",
            why_surfaced: "Detected terms associated with friction or constraints (e.g., 'blocked', 'issue').",
            ambiguity_note: "The concern might be minor, temporary, or already mitigated by other factors not present in this truth atom."
        });
    }

    // 4. Participant-specific Hypotheses (if context mentions names)
    if (event.attendees && event.attendees.length > 0) {
        for (const attendee of event.attendees) {
            if (allText.includes(attendee.toLowerCase())) {
                candidates.push({
                    candidate_text: `A specific observation regarding ${attendee} is present in the context.`,
                    why_surfaced: `Direct mention of participant '${attendee}' found in the attached context.`,
                    ambiguity_note: "Mentions of participants are structural; the significance of the mention remains entirely user-defined."
                });
            }
        }
    }

    return candidates;
}

function containsProhibitedTerms(data: any): string | null {
    const jsonString = JSON.stringify(data).toLowerCase();
    for (const term of FORBIDDEN_TERMS) {
        if (jsonString.includes(term)) return term;
    }
    return null;
}

export async function POST(
    req: NextRequest,
    { params }: { params: { id: string } }
) {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        // 1. Fetch Event + Contexts
        const { data: event, error: eventError } = await supabase
            .from('calendar_events')
            .select('*')
            .eq('id', params.id)
            .eq('user_id', user.id)
            .single();

        if (eventError || !event) {
            return NextResponse.json({ error: 'Event not found' }, { status: 404 });
        }

        const { data: contexts, error: contextError } = await supabase
            .from('event_contexts')
            .select('*')
            .eq('event_id', params.id);

        if (contextError) throw contextError;

        const start = Date.now();
        const candidates = proposeHeuristicCandidates(event, contexts || []);
        const execMs = Date.now() - start;

        // 3. Fail-Closed Validation
        const prohibitedTerm = containsProhibitedTerms(candidates);
        if (prohibitedTerm) {
            console.error(`[Extraction] Rejected: Prohibited term "${prohibitedTerm}" detected.`);
            return NextResponse.json({
                error: 'Extraction failed safety guard',
                details: `Prohibited term detected: ${prohibitedTerm}`
            }, { status: 422 });
        }

        // 4. Log AI Run (Traceability)
        const { data: aiRun, error: aiRunError } = await supabase
            .from('ai_runs')
            .insert({
                user_id: user.id,
                // event_id likely doesn't exist in schema yet; we link via signal_candidates
                model: 'heuristic-proposer-v0',
                status: 'success',
                raw_output: candidates,
                candidates_generated: candidates.length,
                execution_time_ms: execMs
            })
            .select()
            .single();

        // 5. Store Candidates (Review Required)
        if (candidates.length > 0) {
            // Clear existing for idempotency
            await supabase
                .from('signal_candidates')
                .delete()
                .eq('source_event_id', params.id)
                .eq('user_id', user.id);

            const rows = candidates.map(c => ({
                user_id: user.id,
                source_event_id: event.id,
                ai_run_id: aiRun?.id,
                label: c.candidate_text,
                why_surfaced: c.why_surfaced,
                ambiguity_note: c.ambiguity_note,
                review_status: 'pending'
            }));

            const { error: insertError } = await supabase
                .from('signal_candidates')
                .insert(rows);

            if (insertError) throw insertError;
        }

        return NextResponse.json({
            candidates,
            ai_run_id: aiRun?.id
        });

    } catch (error: any) {
        console.error('[Extraction Error]:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
