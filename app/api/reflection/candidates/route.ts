/**
 * Reflection Candidates API
 * GET /api/reflection/candidates?hub_id=...
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { generateReflectionCandidates } from '@/lib/services/reflection_engine';

export async function GET(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const hubId = new URL(req.url).searchParams.get('hub_id');
    if (!hubId) return NextResponse.json({ error: 'Missing hub_id' }, { status: 400 });

    const candidates = await generateReflectionCandidates(hubId);
    return NextResponse.json({ success: true, candidates });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
