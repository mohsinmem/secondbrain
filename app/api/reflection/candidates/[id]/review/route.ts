import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

type Action = 'accept' | 'reject' | 'defer' | 'edit';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createServerSupabaseClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const candidateId = params.id;
    const body = await request.json().catch(() => ({}));

    const action: Action = body?.action;
    const review_notes: string | null = body?.review_notes ?? null;
    const deferred_until: string | null = body?.deferred_until ?? null;
    const updates: Record<string, any> | null = body?.updates ?? null;
    const user_notes: string | null = body?.user_notes ?? null;
    const elevated: boolean = body?.elevated === true;
    const reflection_data = body?.reflection_data ?? null;

    if (!action || !['accept', 'reject', 'defer', 'edit'].includes(action)) {
      return NextResponse.json(
        { error: 'Invalid action. Must be: accept, reject, defer, edit' },
        { status: 400 }
      );
    }

    const { data: candidate, error: fetchError } = await supabase
      .from('signal_candidates')
      .select('*')
      .eq('id', candidateId)
      .eq('user_id', user.id)
      .single();

    if (fetchError || !candidate) {
      return NextResponse.json({ error: 'Candidate not found' }, { status: 404 });
    }

    // Allow pending OR deferred to be actioned
    if (candidate.review_status && !['pending', 'deferred'].includes(candidate.review_status)) {
      return NextResponse.json({ error: 'Candidate already reviewed' }, { status: 409 });
    }

    const now = new Date().toISOString();

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
        .eq('id', candidateId);

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ data: { status: 'rejected' } }, { status: 200 });
    }

    if (action === 'defer') {
      if (!deferred_until) {
        return NextResponse.json(
          { error: 'deferred_until required for defer action' },
          { status: 400 }
        );
      }

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
        .eq('id', candidateId);

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ data: { status: 'deferred', deferred_until } }, { status: 200 });
    }

    if (action === 'edit') {
      if (!updates || typeof updates !== 'object' || Object.keys(updates).length === 0) {
        return NextResponse.json({ error: 'updates object required' }, { status: 400 });
      }

      // Only allow safe fields to be edited in v0
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
        return NextResponse.json({ error: 'No editable fields provided' }, { status: 400 });
      }

      const { error } = await supabase
        .from('signal_candidates')
        .update({
          ...sanitized,
          review_notes,
          updated_at: now,
        })
        .eq('id', candidateId);

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ data: { status: 'updated' } }, { status: 200 });
    }
      // Idempotency: if already promoted, return existing signal
      const { data: existingSignal, error: existingErr } = await supabase
        .from('signals')
        .select('id')
        .eq('approved_from_candidate_id', candidateId)
        .maybeSingle();

      if (existingSignal?.id) {
        return NextResponse.json(
          { data: { status: 'accepted', signal_id: existingSignal.id, already_existed: true } },
          { status: 200 }
        );
      }

    // accept
    // mark candidate accepted first
    {
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
        .eq('id', candidateId);
      const user_notes: string | null = body?.user_notes ?? null;
      const elevated: boolean = body?.elevated === true;
      const reflection_data = body?.reflection_data ?? null;

      if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });
    }

    const isElevated =
    elevated === true ||
    reflection_data?.elevated === true;
    
    // promote into signals
    // IMPORTANT: your signals table uses numeric confidence, trust_evidence TEXT, constraint_type enum.
    const { data: signal, error: signalError } = await supabase
      .from('signals')
      .insert({
        user_id: user.id,
        signal_type: candidate.signal_type,
        label: candidate.label,
        description: candidate.description ?? null,

        // Keep numeric confidence optional; you can backfill later
        confidence: candidate.confidence ?? null,

        extracted_at: now,
        extraction_method: 'reflection_engine_v0',
        constraint_type: candidate.constraint_type ?? 'none',
        trust_evidence: candidate.trust_evidence ?? candidate.trust_evidence_type ?? null,
        action_required: isElevated,
        user_notes: user_notes,
        status: 'open',

        // provenance fields added by migration
        source_conversation_id: candidate.source_conversation_id ?? null,
        source_segment_id: candidate.segment_id ?? null,
        source_excerpt: candidate.source_excerpt ?? null,
        approved_from_candidate_id: candidateId,
        risk_of_misinterpretation: candidate.risk_of_misinterpretation ?? null,
      })
      .select()
      .single();

    if (signalError || !signal) {
      return NextResponse.json({ error: signalError?.message ?? 'Failed to create signal' }, { status: 500 });
    }

    return NextResponse.json(
      { data: { status: 'accepted', signal_id: signal.id } },
      { status: 201 }
    );
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Unknown error' }, { status: 500 });
  }
}
