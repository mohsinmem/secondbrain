import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

type Action = 'accept' | 'reject' | 'defer' | 'edit';

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

/**
 * POST /api/reflection/candidates/[id]/review
 * Actions:
 * - accept: promotes candidate -> signals
 * - reject: marks candidate rejected
 * - defer: marks candidate deferred until date
 * - edit: updates safe fields on candidate
 *
 * Body:
 * {
 *   action: 'accept'|'reject'|'defer'|'edit',
 *   review_notes?: string,
 *   user_notes?: string,
 *   elevated?: boolean,
 *   reflection_data?: { elevated?: boolean, ... },
 *   deferred_until?: string,
 *   updates?: { ... }
 * }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createServerSupabaseClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) return jsonError('Unauthorized', 401);

    const candidateId = params.id;

    const body = await request.json().catch(() => ({}));

    const action: Action | undefined = body?.action;
    const review_notes: string | null = body?.review_notes ?? null;
    const user_notes: string | null = body?.user_notes ?? null;
    const deferred_until: string | null = body?.deferred_until ?? null;
    const updates: Record<string, any> | null = body?.updates ?? null;

    const elevatedFlag: boolean = body?.elevated === true;
    const reflection_data: any = body?.reflection_data ?? null;

    if (!action || !['accept', 'reject', 'defer', 'edit'].includes(action)) {
      return jsonError('Invalid action. Must be: accept, reject, defer, edit', 400);
    }

    // Fetch candidate and verify ownership (schema includes signal_candidates.user_id)
    const { data: candidate, error: fetchError } = await supabase
      .from('signal_candidates')
      .select('*')
      .eq('id', candidateId)
      .eq('user_id', user.id)
      .single();

    if (fetchError || !candidate) return jsonError('Candidate not found', 404);

    const now = new Date().toISOString();

    // ACCEPT: idempotency check MUST happen before review-status guard
    if (action === 'accept') {
      const { data: existingSignal, error: existingErr } = await supabase
        .from('signals')
        .select('id')
        .eq('approved_from_candidate_id', candidateId)
        .maybeSingle();

      if (existingErr) {
        // Not fatal; continue to attempt accept
        console.warn('Idempotency check failed:', existingErr.message);
      }

      if (existingSignal?.id) {
        return NextResponse.json(
          {
            data: {
              status: 'accepted',
              signal_id: existingSignal.id,
              already_existed: true,
            },
          },
          { status: 200 }
        );
      }
    }

    // Guard: reject/defer/edit only allowed for pending or deferred
    if (action !== 'accept') {
      const status = candidate.review_status ?? 'pending';
      if (!['pending', 'deferred'].includes(status)) {
        return jsonError('Candidate already reviewed', 409);
      }
    }

    // REJECT
    if (action === 'reject') {
      const { error } = await supabase
        .from('signal_candidates')
        .update({
          review_status: 'rejected',
          review_notes,
          reviewed_at: now,
          reviewed_by: user.id,
          is_reviewed: true,
          is_accepted: false,
        })
        .eq('id', candidateId)
        .eq('user_id', user.id);

      if (error) return jsonError(error.message, 500);

      return NextResponse.json({ data: { status: 'rejected' } }, { status: 200 });
    }

    // DEFER
    if (action === 'defer') {
      if (!deferred_until) return jsonError('deferred_until required for defer action', 400);

      const { error } = await supabase
        .from('signal_candidates')
        .update({
          review_status: 'deferred',
          deferred_until,
          review_notes,
          reviewed_at: now,
          reviewed_by: user.id,
          is_reviewed: false,
          is_accepted: null,
        })
        .eq('id', candidateId)
        .eq('user_id', user.id);

      if (error) return jsonError(error.message, 500);

      return NextResponse.json(
        { data: { status: 'deferred', deferred_until } },
        { status: 200 }
      );
    }

    // EDIT
    if (action === 'edit') {
      if (!updates || typeof updates !== 'object' || Object.keys(updates).length === 0) {
        return jsonError('updates object required', 400);
      }

      // Safe editable fields only
      const allowed = new Set([
        'label',
        'description',
        'confidence_level',
        'risk_of_misinterpretation',
        'constraint_type',
        'trust_evidence',
        'action_suggested',
        'related_themes',
        'temporal_context',
        'suggested_links',
        'source_excerpt',
        'excerpt_location',
      ]);

      const sanitized: Record<string, any> = {};
      for (const [k, v] of Object.entries(updates)) {
        if (allowed.has(k)) sanitized[k] = v;
      }

      if (Object.keys(sanitized).length === 0) {
        return jsonError('No editable fields provided', 400);
      }

      const { error } = await supabase
        .from('signal_candidates')
        .update({
          ...sanitized,
          review_notes,
          updated_at: now,
        })
        .eq('id', candidateId)
        .eq('user_id', user.id);

      if (error) return jsonError(error.message, 500);

      return NextResponse.json({ data: { status: 'updated' } }, { status: 200 });
    }

    // ACCEPT (promote to signals)
    // IMPORTANT: action_required determined ONLY from user gesture flags
    const isElevated =
      elevatedFlag === true || reflection_data?.elevated === true;

    // 1) Create signal FIRST (so failure doesn't mutate candidate; safe retry)
    const { data: signal, error: signalError } = await supabase
      .from('signals')
      .insert({
        user_id: user.id,
        signal_type: candidate.signal_type,
        label: candidate.label,
        description: candidate.description ?? null,

        confidence: candidate.confidence ?? null,

        extracted_at: now,
        extraction_method: 'reflection_engine_v0',
        constraint_type: candidate.constraint_type ?? 'none',
        trust_evidence: candidate.trust_evidence ?? candidate.trust_evidence_type ?? null,

        action_required: isElevated,
        user_notes: user_notes,

        status: 'open',

        // provenance
        source_conversation_id: candidate.source_conversation_id ?? null,
        source_segment_id: candidate.segment_id ?? null,
        source_excerpt: candidate.source_excerpt ?? null,
        approved_from_candidate_id: candidateId,
        risk_of_misinterpretation: candidate.risk_of_misinterpretation ?? null,
      })
      .select()
      .single();

    if (signalError || !signal) {
      return jsonError(signalError?.message ?? 'Failed to create signal', 500);
    }

    // 2) Update candidate -> accepted (non-fatal if it fails; idempotency protects)
    const { error: updErr } = await supabase
      .from('signal_candidates')
      .update({
        review_status: 'accepted',
        review_notes,
        reviewed_at: now,
        reviewed_by: user.id,
        is_reviewed: true,
        is_accepted: true,
      })
      .eq('id', candidateId)
      .eq('user_id', user.id);

    if (updErr) {
      console.warn('Candidate update failed after signal creation:', updErr.message);
    }

    return NextResponse.json(
      {
        data: {
          status: 'accepted',
          signal_id: signal.id,
          already_existed: false,
        },
      },
      { status: 201 }
    );
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Unknown error' }, { status: 500 });
  }
}
