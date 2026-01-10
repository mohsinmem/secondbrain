import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

/**
 * GET /api/reflection/candidates
 * Query:
 * - conversation_id (required)
 * - review_status (optional, default: 'pending')
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const sp = request.nextUrl.searchParams;
    const conversationId = sp.get('conversation_id');
    const reviewStatus = sp.get('review_status') ?? 'pending';

    if (!conversationId) {
      return NextResponse.json({ error: 'conversation_id is required' }, { status: 400 });
    }

    // Ownership check
    const { data: convo, error: convoError } = await supabase
      .from('raw_conversations')
      .select('id')
      .eq('id', conversationId)
      .eq('user_id', user.id)
      .single();

    if (convoError || !convo) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    // Deterministic ordering
    const { data, error } = await supabase
      .from('signal_candidates')
      .select(`
        id,
        signal_type,
        label,
        description,
        confidence,
        confidence_level,
        risk_of_misinterpretation,
        constraint_type,
        trust_evidence,
        action_suggested,
        related_themes,
        temporal_context,
        suggested_links,
        source_excerpt,
        excerpt_location,
        segment_id,
        created_at,
        review_status
      `)
      .eq('source_conversation_id', conversationId)
      .eq('review_status', reviewStatus)
      .order('created_at', { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Unknown error' }, { status: 500 });
  }
}
