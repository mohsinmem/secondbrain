/**
 * Reflection Promote API
 * POST /api/reflection/promote
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { promoteToSignal } from '@/lib/services/reflection_engine';

export async function POST(req: NextRequest) {
    try {
        const supabase = await createServerSupabaseClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { event_id, metadata = {} } = await req.json();
        if (!event_id) return NextResponse.json({ error: 'Missing event_id' }, { status: 400 });

        const result = await promoteToSignal(user.id, event_id, metadata);

        if (result.error) throw result.error;

        return NextResponse.json({ success: true, signal: result.signal });

    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
