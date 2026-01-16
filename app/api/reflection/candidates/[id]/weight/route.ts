import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

/**
 * POST /api/reflection/candidates/[id]/weight
 * Saves user weights (relevance, importance, etc.) WITHOUT changing review status.
 */
export async function POST(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    const candidateId = params.id;

    try {
        const supabase = await createServerSupabaseClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();

        // Validate inputs
        const { relevance, importance, energy_impact, confidence, action_timing, notes } = body;

        const errors: string[] = [];
        if (relevance !== undefined && (relevance < 1 || relevance > 5)) errors.push('Relevance must be 1-5');
        if (importance !== undefined && (importance < 1 || importance > 5)) errors.push('Importance must be 1-5');
        if (energy_impact !== undefined && (energy_impact < -5 || energy_impact > 5)) errors.push('Energy impact must be -5 to 5');
        if (confidence && !['Low', 'Med', 'High'].includes(confidence)) errors.push('Invalid confidence');
        if (action_timing && !['now', 'later', 'no'].includes(action_timing)) errors.push('Invalid action_timing');

        if (errors.length > 0) {
            return NextResponse.json({ error: 'Validation failed', details: errors }, { status: 400 });
        }

        // Upsert weights
        const { error: saveError } = await supabase
            .from('candidate_weights')
            .upsert({
                candidate_id: candidateId,
                user_id: user.id,
                relevance,
                importance,
                energy_impact,
                confidence,
                action_timing,
                notes,
                updated_at: new Date().toISOString()
            }, { onConflict: 'candidate_id' });

        if (saveError) {
            console.error('[Weight] DB Error:', saveError.message);
            return NextResponse.json({ error: 'Failed to save weights' }, { status: 500 });
        }

        return NextResponse.json({ status: 'success' });

    } catch (e: any) {
        console.error('[Weight] Unexpected error:', e);
        return NextResponse.json({ error: e.message || 'Unknown error' }, { status: 500 });
    }
}
