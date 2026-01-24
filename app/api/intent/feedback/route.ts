import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { intent_card_id, action } = await req.json();

        if (!intent_card_id || !action) {
            return NextResponse.json({ error: 'Card ID and action required' }, { status: 400 });
        }

        if (!['save', 'dismiss'].includes(action)) {
            return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
        }

        // 1. Insert Feedback
        const { error: feedbackError } = await supabase
            .from('intent_feedback')
            .insert({
                intent_card_id,
                action
            });

        if (feedbackError) throw feedbackError;

        // 2. If 'dismiss', update the card status
        if (action === 'dismiss') {
            const { error: updateError } = await supabase
                .from('intent_cards')
                .update({ dismissed_at: new Date().toISOString() })
                .eq('id', intent_card_id);

            if (updateError) throw updateError;
        }

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('[Intent Feedback] Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
