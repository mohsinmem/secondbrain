import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

/**
 * GET /api/events/[id]/signals
 * Returns durable signals linked to the specified event.
 */
export async function GET(
    req: NextRequest,
    { params }: { params: { id: string } }
) {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { data, error } = await supabase
            .from('signals')
            .select('id, label, description, signal_type, created_at, linked_event_id')
            .eq('linked_event_id', params.id)
            .eq('user_id', user.id)
            .order('created_at', { ascending: false });

        if (error) throw error;

        return NextResponse.json(data);
    } catch (error: any) {
        console.error('[Fetch Event Signals Error]:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
