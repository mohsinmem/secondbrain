import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: conversations, error } = await supabase
      .from('raw_conversations')
      .select('id, title, platform, participants, created_at, source_filename')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ data: conversations });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Unknown error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const {
      platform,
      participants,
      raw_text,
      source_filename,
      date_range_start,
      date_range_end,
      message_count,
      source_metadata
    } = body ?? {};

    if (!platform || !participants || !raw_text) {
      return NextResponse.json(
        { error: 'Missing required fields: platform, participants, raw_text' },
        { status: 400 }
      );
    }

    if (!Array.isArray(participants) || participants.length === 0) {
      return NextResponse.json({ error: 'participants must be a non-empty array' }, { status: 400 });
    }

    if (typeof raw_text !== 'string' || raw_text.trim().length === 0) {
      return NextResponse.json({ error: 'raw_text must be a non-empty string' }, { status: 400 });
    }

    const { data: conversation, error: insertError } = await supabase
      .from('raw_conversations')
      .insert({
        user_id: user.id,
        raw_text,
        platform,
        participants,
        source_filename: source_filename ?? null,
        date_range_start: date_range_start ? new Date(date_range_start).toISOString() : null,
        date_range_end: date_range_end ? new Date(date_range_end).toISOString() : null,
        message_count: typeof message_count === 'number' ? message_count : null,
        source_metadata: source_metadata ?? null,
        status: 'unprocessed',

        // Backward compatibility with your existing fields:
        title: source_filename ?? null,
        conversation_date: date_range_start ? new Date(date_range_start).toISOString() : null,
        // Your schema uses source_type USER-DEFINED; we avoid forcing values here.
        // If your DB requires it NOT NULL, set it to whatever existing enum value you already use.
        is_processed: false,
      })
      .select()
      .single();

    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

    return NextResponse.json({ data: conversation }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Unknown error' }, { status: 500 });
  }
}
