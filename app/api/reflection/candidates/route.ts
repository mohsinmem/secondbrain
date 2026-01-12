import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

/**
 * GET /api/reflection/candidates
 * Query:
 * - conversation_id (required)
 * - review_status (optional, default: 'pending')
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) return jsonError('Unauthorized', 401);

    const sp = request.nextUrl.searchParams;
    const conversationId = sp.get('conversation_id');
    const reviewStatus = sp.get('review_status') ?? 'pending';

    if (!conversationId) return jsonError('conversation_id is required', 400);

    // Verify ownership of conversation
    const { data: convo, error: convoError } = await supabase
      .from('raw_conversations')
      .select('id')
      .eq('id', conversationId)
      .eq('user_id', user.id)
      .single();

    if (convoError || !convo) return jsonError('Conversation not found', 404);

    const { data, error } = await supabase
      .from('signal_candidates')
      .select(`
        id,
        user_id,
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
        source_conversation_id,
        source_excerpt,
        excerpt_location,
        segment_id,
        review_status,
        deferred_until,
        created_at,
        updated_at
      `)
      .eq('source_conversation_id', conversationId)
      .eq('user_id', user.id)
      .eq('review_status', reviewStatus)
      .order('created_at', { ascending: true });

    if (error) return jsonError(error.message, 500);

    return NextResponse.json({ data: data ?? [] }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Unknown error' }, { status: 500 });
  }
}
