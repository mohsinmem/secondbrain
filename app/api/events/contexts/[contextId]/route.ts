import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

/**
 * PATCH /api/events/contexts/[contextId]
 * Update a specific context (mostly for notes)
 */
export async function PATCH(
    req: NextRequest,
    { params }: { params: { contextId: string } }
) {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { content } = await req.json();

        if (!content) {
            return NextResponse.json({ error: 'Missing content' }, { status: 400 });
        }

        const { data, error } = await supabase
            .from('event_contexts')
            .update({ content, updated_at: new Date().toISOString() })
            .eq('id', params.contextId)
            .eq('user_id', user.id)
            .select()
            .single();

        if (error) throw error;
        if (!data) return NextResponse.json({ error: 'Context not found' }, { status: 404 });

        return NextResponse.json(data);
    } catch (error: any) {
        console.error('[Context PATCH] Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

/**
 * DELETE /api/events/contexts/[contextId]
 * Remove a specific context attachment
 */
export async function DELETE(
    req: NextRequest,
    { params }: { params: { contextId: string } }
) {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { error } = await supabase
            .from('event_contexts')
            .delete()
            .eq('id', params.contextId)
            .eq('user_id', user.id);

        if (error) throw error;

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('[Context DELETE] Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
