import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

/**
 * GET /api/reflection/signals
 * Query:
 * - source_conversation_id (required)
 * - action_required (optional: 'true'|'false')
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const sp = request.nextUrl.searchParams;
    const sourceConversationId = sp.get('source_conversation_id');
    const actionRequiredParam = sp.get('action_required'); // optional

    if (!sourceConversationId) {
      return NextResponse.json(
        { error: 'source_conversation_id is required' },
        { status: 400 }
      );
    }

    let q = supabase
      .from('signals')
      .select('id, label, action_required, created_at')
      .eq('user_id', user.id)
      .eq('source_conversation_id', sourceConversationId)
      .order('created_at', { ascending: true });

    if (actionRequiredParam !== null) {
      q = q.eq('action_required', actionRequiredParam === 'true');
    }

    const { data, error } = await q;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Unknown error' }, { status: 500 });
  }
}
