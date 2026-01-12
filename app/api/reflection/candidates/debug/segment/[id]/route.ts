import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

/**
 * GET /api/reflection/debug/segment/[id]
 * Quick debug snapshot:
 * - segment preview/length
 * - latest ai_run info + raw_output (trimmed)
 * - candidate counts linked to this segment
 *
 * Query:
 * - include_raw=1 (optional) include raw_output.candidates (may be large)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return jsonError('Unauthorized', 401);

    const segmentId = params.id;
    const includeRaw = request.nextUrl.searchParams.get('include_raw') === '1';

    // Segment (ownership via user_id on conversation_segments)
    const { data: segment, error: segErr } = await supabase
      .from('conversation_segments')
      .select('id, user_id, conversation_id, segment_number, segment_text, extraction_status, created_at')
      .eq('id', segmentId)
      .single();

    if (segErr || !segment) return jsonError('Segment not found', 404);
    if (segment.user_id !== user.id) return jsonError('Forbidden', 403);

    // Latest AI run for this segment
    const { data: aiRun, error: runErr } = await supabase
      .from('ai_runs')
      .select('id, status, error_type, error_details, candidates_generated, executed_at, raw_output')
      .eq('segment_id', segmentId)
      .order('executed_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    // Candidates count for this segment
    const { count: candCount, error: candCountErr } = await supabase
      .from('signal_candidates')
      .select('id', { count: 'exact', head: true })
      .eq('segment_id', segmentId)
      .eq('user_id', user.id);

    if (candCountErr) console.warn('Candidate count error:', candCountErr.message);

    const segText: string = segment.segment_text || '';
    const preview = segText.slice(0, 400);

    let rawSummary: any = null;
    if (aiRun?.raw_output) {
      rawSummary = {
        status: (aiRun.raw_output as any)?.status ?? null,
        errors: (aiRun.raw_output as any)?.errors ?? null,
        candidates_count: Array.isArray((aiRun.raw_output as any)?.candidates)
          ? (aiRun.raw_output as any).candidates.length
          : null,
      };

      if (includeRaw) {
        rawSummary.candidates = (aiRun.raw_output as any)?.candidates ?? null;
      }
    }

    return NextResponse.json({
      ok: true,
      segment: {
        id: segment.id,
        conversation_id: segment.conversation_id,
        segment_number: segment.segment_number,
        extraction_status: segment.extraction_status,
        chars: segText.length,
        preview,
        created_at: segment.created_at,
      },
      ai_run_latest: aiRun
        ? {
            id: aiRun.id,
            status: aiRun.status,
            error_type: aiRun.error_type,
            error_details: aiRun.error_details,
            candidates_generated: aiRun.candidates_generated,
            executed_at: aiRun.executed_at,
            raw_summary: rawSummary,
          }
        : null,
      candidates: {
        count: candCount ?? 0,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Unknown error' }, { status: 500 });
  }
}
