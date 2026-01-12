import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const supabase = await createServerSupabaseClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sp = request.nextUrl.searchParams;
  const conversationId = sp.get('conversation_id');
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

  // Counts by status (using source_conversation_id)
  const { data: rows, error: rowsError } = await supabase
    .from('signal_candidates')
    .select('id, review_status, created_at, source_conversation_id, segment_id, label')
    .eq('source_conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(50);

  if (rowsError) {
    return NextResponse.json({ error: rowsError.message }, { status: 500 });
  }

  const counts: Record<string, number> = {};
  for (const r of rows ?? []) {
    const k = r.review_status ?? 'null';
    counts[k] = (counts[k] ?? 0) + 1;
  }

  return NextResponse.json({
    ok: true,
    conversation_id: conversationId,
    count_in_first_50: (rows ?? []).length,
    counts_in_first_50: counts,
    sample: rows ?? [],
  });
}
