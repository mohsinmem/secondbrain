import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createServerSupabaseClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const conversationId = params.id;

    const { data: conversation, error: fetchError } = await supabase
      .from('raw_conversations')
      .select('id, user_id, status')
      .eq('id', conversationId)
      .eq('user_id', user.id)
      .single();

    if (fetchError || !conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    if (conversation.status === 'processing') {
      return NextResponse.json({ error: 'Conversation is already being processed' }, { status: 409 });
    }

    const body = await request.json().catch(() => ({}));
    const time_window_days = Number(body?.time_window_days ?? 90);
    const message_cap = Number(body?.message_cap ?? 1000);

    await supabase
      .from('raw_conversations')
      .update({ status: 'processing' })
      .eq('id', conversationId);

    const { data: segments, error: chunkError } = await supabase
      .rpc('auto_chunk_conversation', {
        p_conversation_id: conversationId,
        p_time_window_days: time_window_days,
        p_message_cap: message_cap,
      });

    if (chunkError) {
      await supabase
        .from('raw_conversations')
        .update({ status: 'failed' })
        .eq('id', conversationId);

      return NextResponse.json({ error: chunkError.message }, { status: 500 });
    }

    await supabase
      .from('raw_conversations')
      .update({
        status: 'processed',
        is_processed: true,
        processed_at: new Date().toISOString(),
      })
      .eq('id', conversationId);

    return NextResponse.json({ data: { segments } }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Unknown error' }, { status: 500 });
  }
}
