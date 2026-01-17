import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

/**
 * GET /api/events/[id]/contexts
 * List all contexts for a specific event
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
            .from('event_contexts')
            .select('*')
            .eq('event_id', params.id)
            .eq('user_id', user.id)
            .order('created_at', { ascending: true });

        if (error) throw error;

        return NextResponse.json(data);
    } catch (error: any) {
        console.error('[Contexts GET] Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

/**
 * POST /api/events/[id]/contexts
 * Attach a new context (note or conversation link) to an event
 */
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
        const { context_type, content } = await req.json();

        if (!context_type || !content) {
            return NextResponse.json({ error: 'Missing context_type or content' }, { status: 400 });
        }

        // 1. Verify event ownership
        const { data: event, error: eventError } = await supabase
            .from('calendar_events')
            .select('id')
            .eq('id', params.id)
            .eq('user_id', user.id)
            .single();

        if (eventError || !event) {
            return NextResponse.json({ error: 'Event not found or access denied' }, { status: 404 });
        }

        // 2. Insert context
        const { data, error } = await supabase
            .from('event_contexts')
            .insert({
                event_id: params.id,
                user_id: user.id,
                context_type,
                content
            })
            .select()
            .single();

        if (error) throw error;

        return NextResponse.json(data);
    } catch (error: any) {
        console.error('[Contexts POST] Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
