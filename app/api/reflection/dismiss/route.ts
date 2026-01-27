/**
 * Reflection Dismiss API
 * POST /api/reflection/dismiss
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { dismissEvent } from '@/lib/services/reflection_engine';

export async function POST(req: NextRequest) {
    try {
        const supabase = await createServerSupabaseClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { event_id } = await req.json();
        if (!event_id) return NextResponse.json({ error: 'Missing event_id' }, { status: 400 });

        const { error } = await dismissEvent(user.id, event_id);

        if (error) throw error;

        return NextResponse.json({ success: true });

    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
