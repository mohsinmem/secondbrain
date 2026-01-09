import { createServerSupabaseClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/reflection/conversations/upload
 * Content-Type: multipart/form-data
 *
 * Fields:
 * - file: .txt file (required)
 * - platform: 'whatsapp' | 'linkedin' | 'email' | 'other' (required)
 * - participants: comma-separated string OR JSON array string (required)
 * - source_filename: optional (defaults to uploaded filename)
 * - date_range_start: optional ISO
 * - date_range_end: optional ISO
 * - message_count: optional number
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();

    // Auth
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const form = await request.formData();

    const platform = String(form.get('platform') || '').trim();
    const participantsRaw = String(form.get('participants') || '').trim();

    const file = form.get('file');
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: 'Missing file field (file)' }, { status: 400 });
    }

    if (!platform) {
      return NextResponse.json({ error: 'Missing platform' }, { status: 400 });
    }

    if (!participantsRaw) {
      return NextResponse.json({ error: 'Missing participants' }, { status: 400 });
    }

    // Participants: allow either JSON array string or comma-separated list
    let participants: string[] = [];
    try {
      const maybeJson = JSON.parse(participantsRaw);
      if (Array.isArray(maybeJson)) {
        participants = maybeJson.map(x => String(x).trim()).filter(Boolean);
      } else {
        throw new Error('not array');
      }
    } catch {
      participants = participantsRaw.split(',').map(s => s.trim()).filter(Boolean);
    }

    if (participants.length === 0) {
      return NextResponse.json({ error: 'participants must not be empty' }, { status: 400 });
    }

    const raw_text = await file.text();
    if (!raw_text || raw_text.trim().length === 0) {
      return NextResponse.json({ error: 'Uploaded file is empty' }, { status: 400 });
    }

    const source_filename = String(form.get('source_filename') || file.name || '').trim() || null;
    const date_range_start = String(form.get('date_range_start') || '').trim() || null;
    const date_range_end = String(form.get('date_range_end') || '').trim() || null;
    const message_count_raw = String(form.get('message_count') || '').trim();
    const message_count = message_count_raw ? Number(message_count_raw) : null;

    // Insert into raw_conversations (your schema already has these columns)
    const { data: conversation, error: insertError } = await supabase
      .from('raw_conversations')
      .insert({
        user_id: user.id,
        raw_text,
        platform,
        participants,
        source_filename,
        date_range_start: date_range_start ? new Date(date_range_start).toISOString() : null,
        date_range_end: date_range_end ? new Date(date_range_end).toISOString() : null,
        message_count: Number.isFinite(message_count as any) ? message_count : null,
        status: 'unprocessed',
        // keep existing legacy fields if your table still expects them
        title: source_filename,
        conversation_date: date_range_start ? new Date(date_range_start).toISOString() : null,
        is_processed: false
      })
      .select()
      .single();

    if (insertError) {
      console.error(insertError);
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({ data: conversation }, { status: 201 });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
