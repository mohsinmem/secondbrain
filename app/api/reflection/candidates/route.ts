import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const ALLOWED_REVIEW_STATUSES = new Set(['pending', 'accepted', 'rejected', 'deferred']);

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

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const sp = request.nextUrl.searchParams;
    const conversationId = sp.get('conversation_id');
    const reviewStatus = (sp.get('review_status') ?? 'pending').toLowerCase();

    if (!conversationId) {
      return NextResponse.json({ error: 'conversation_id is required' }, { status: 400 });
    }

    if (!ALLOWED_REVIEW_STATUSES.has(reviewStatus)) {
      return NextResponse.json(
        { error: `Invalid review_status. Must be one of: ${Array.from(ALLOWED_REVIEW_STATUSES).join(', ')}` },
        { status: 400 }
      );
    }

    // Ownership check (conversation)
    const { data: convo, error: convoError } = await supabase
      .from('raw_conversations')
      .select('id')
      .eq('id', conversationId)
      .eq('user_id', user.id)
      .single();

    if (convoError || !convo) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    // Deterministic ordering (v1): created_at ASC
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
        source_excerpt,
        excerpt_location,
        segment_id,
        source_conversation_id,
        created_at,
        review_status
      `)
      .eq('source_conversation_id', conversationId)
      .eq('user_id', user.id) // defense-in-depth
      .eq('review_status', reviewStatus)
      .order('created_at', { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: data ?? [] }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Unknown error' }, { status: 500 });
  }
}
