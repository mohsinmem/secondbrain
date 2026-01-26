/**
 * Hub Rename API
 * PATCH /api/hubs/[id]
 * 
 * Allows manual overwrite of Hub titles for semantic clarity.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function PATCH(
    req: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const supabase = await createServerSupabaseClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { title } = await req.json();
        const hubId = params.id;

        if (!title) {
            return NextResponse.json({ error: 'Title is required' }, { status: 400 });
        }

        const { error: updateError } = await supabase
            .from('context_hubs')
            .update({ title })
            .eq('id', hubId)
            .eq('user_id', user.id);

        if (updateError) throw updateError;

        return NextResponse.json({ success: true });

    } catch (error: any) {
        console.error('Failed to rename hub:', error);
        return NextResponse.json({ error: error.message || 'Failed to rename hub' }, { status: 500 });
    }
}
