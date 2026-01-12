import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

function ok(data: any) {
  return NextResponse.json({ data }, { status: 200 });
}

function err(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

/**
 * GET /api/reflection/debug/candidates?conversation_id=...
 *
 * Purpose:
 * - Diagnose why /api/reflection/candidates returns empty
 * - Checks counts across possible columns and statuses
 *
 * Safe:
 * - Read-only
 * - Auth-gated
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return err('Unauthorized', 401);

    const sp = request.nextUrl.searchParams;
    const conversationId = sp.get('conversation_id');
    if (!conversationId) return err('conversation_id is required', 400);

    // Confirm user owns conversation
    const { data: convo, error: convoError } = await supabase
      .from('raw_conversations')
      .select('id, user_id')
      .eq('id', conversationId)
      .single();

    if (convoError || !convo) return err('Conversation not found', 404);
    if (convo.user_id !== user.id) return err('Forbidden', 403);

    // Try the "official" query your API uses
    const { data: pendingOfficial, error: officialErr } = await supabase
      .from('signal_candidates')
      .select('id, review_status, created_at, source_conversation_id, source_excerpt, label')
      .eq('source_conversation_id', conversationId)
      .eq('review_status', 'pending')
      .order('created_at', { ascending: true });

    // Also pull status distribution (official column)
    const { data: allOfficial, error: allOfficialErr } = await supabase
      .from('signal_candidates')
      .select('id, review_status, created_at, source_conversation_id, label')
      .eq('source_conversation_id', conversationId)
      .order('created_at', { ascending: true });

    // Optional: detect if table has a "conversation_id" column by trying a query
    // If it errors, we just report it.
    let convoIdColumnTest: any = { supported: false };
    try {
      const { data: byConversationId, error: byConversationIdErr } = await supabase
        .from('signal_candidates')
        .select('id, review_status, created_at, label')
        // @ts-ignore - if column doesn't exist, PostgREST returns error
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });

      if (!byConversationIdErr) {
        convoIdColumnTest = {
          supported: true,
          count: byConversationId?.length ?? 0,
          sample: (byConversationId ?? []).slice(0, 5),
        };
      } else {
        convoIdColumnTest = { supported: false, error: byConversationIdErr.message };
      }
    } catch (e: any) {
      convoIdColumnTest = { supported: false, error: e?.message ?? 'Unknown error' };
    }

    // Status distribution from allOfficial
    const statusCounts: Record<string, number> = {};
    for (const row of allOfficial ?? []) {
      const s = row.review_status ?? 'null';
      statusCounts[s] = (statusCounts[s] || 0) + 1;
    }

    return ok({
      conversation_id: conversationId,
      user_id: user.id,
      official_query: {
        error: officialErr?.message ?? null,
        pending_count: pendingOfficial?.length ?? 0,
        pending_sample: (pendingOfficial ?? []).slice(0, 5),
      },
      official_all: {
        error: allOfficialErr?.message ?? null,
        total_count: allOfficial?.length ?? 0,
        status_counts: statusCounts,
        sample: (allOfficial ?? []).slice(0, 5),
      },
      conversation_id_column_test: convoIdColumnTest,
    });
  } catch (e: any) {
    return err(e?.message ?? 'Unknown error', 500);
  }
}
