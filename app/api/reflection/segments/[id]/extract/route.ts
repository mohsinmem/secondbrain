import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

type ValidationResult = {
  valid: boolean;
  errors: string[];
  status: 'success' | 'partial' | 'failed';
  errorType?: 'invalid_json' | 'missing_required_fields' | 'timeout' | 'rate_limit' | 'other';
};

function validateAIResponse(response: any): ValidationResult {
  const errors: string[] = [];

  if (typeof response !== 'object' || response === null) {
    return { valid: false, errors: ['Response must be a JSON object'], status: 'failed', errorType: 'invalid_json' };
  }

  if (!response.status || !['success', 'partial', 'failed'].includes(response.status)) {
    errors.push('Missing or invalid status field');
  }

  if (!Array.isArray(response.candidates)) errors.push('candidates must be an array');
  if (!Array.isArray(response.errors)) errors.push('errors must be an array');

  if (Array.isArray(response.candidates)) {
    const requiredFields = [
      'signal_type',
      'label',
      'description',
      'confidence_level', // IMPORTANT: we use confidence_level in DB
      'excerpt',
      'risk_of_misinterpretation',
    ];

    const validSignalTypes = ['pattern', 'opportunity', 'warning', 'insight', 'promise'];
    const validConfidence = ['explicit', 'inferred'];
    const validRisk = ['low', 'medium', 'high'];

    response.candidates.forEach((candidate: any, index: number) => {
      const prefix = `Candidate ${index + 1}:`;

      requiredFields.forEach((field) => {
        if (!candidate?.[field]) errors.push(`${prefix} Missing required field '${field}'`);
      });

      if (candidate.signal_type && !validSignalTypes.includes(candidate.signal_type)) {
        errors.push(`${prefix} Invalid signal_type '${candidate.signal_type}'`);
      }

      if (candidate.confidence_level && !validConfidence.includes(candidate.confidence_level)) {
        errors.push(`${prefix} Invalid confidence_level '${candidate.confidence_level}'`);
      }

      if (candidate.risk_of_misinterpretation && !validRisk.includes(candidate.risk_of_misinterpretation)) {
        errors.push(`${prefix} Invalid risk_of_misinterpretation '${candidate.risk_of_misinterpretation}'`);
      }

      if (candidate.label && (candidate.label.length < 5 || candidate.label.length > 100)) {
        errors.push(`${prefix} label must be 5-100 characters`);
      }

      if (candidate.description && (candidate.description.length < 10 || candidate.description.length > 500)) {
        errors.push(`${prefix} description must be 10-500 characters`);
      }

      if (candidate.excerpt && candidate.excerpt.length === 0) {
        errors.push(`${prefix} excerpt cannot be empty`);
      }
    });
  }

  if (errors.length > 0) {
    return { valid: false, errors, status: 'partial', errorType: 'missing_required_fields' };
  }

  return { valid: true, errors: [], status: 'success' };
}

/**
 * POST /api/reflection/segments/[id]/extract
 * v0: AI call is stubbed, but contract + audit + candidate insert is real.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createServerSupabaseClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const segmentId = params.id;

    const { data: segment, error: fetchError } = await supabase
      .from('conversation_segments')
      .select('id, user_id, conversation_id, segment_text, extraction_status')
      .eq('id', segmentId)
      .eq('user_id', user.id)
      .single();

    if (fetchError || !segment) {
      return NextResponse.json({ error: 'Segment not found' }, { status: 404 });
    }

    if (segment.extraction_status === 'completed' || segment.extraction_status === 'processing') {
      return NextResponse.json({ error: 'Segment already processed or processing' }, { status: 409 });
    }

    await supabase
      .from('conversation_segments')
      .update({ extraction_status: 'processing' })
      .eq('id', segmentId);

    const body = await request.json().catch(() => ({}));
    const model = body?.model || 'claude-sonnet-4';

    // =========================
    // v0 STUB AI RESPONSE
    // =========================
    const start = Date.now();

    // This is where your actual Claude call will go later.
    // For now, we return zero candidates but a valid contract.
    const aiResponse = {
      status: 'success',
      candidates: [],
      errors: [],
    };

    const execMs = Date.now() - start;

    // Validate response (fail-closed)
    const validation = validateAIResponse(aiResponse);

    // Record AI run (audit always)
    const { data: aiRun, error: aiRunError } = await supabase
      .from('ai_runs')
      .insert({
        user_id: user.id,
        conversation_id: segment.conversation_id,
        segment_id: segmentId,
        model,
        status: validation.status,
        error_type: validation.errorType ?? null,
        error_details: validation.errors.length ? validation.errors.join('; ') : null,
        raw_output: aiResponse,
        candidates_generated: Array.isArray(aiResponse.candidates) ? aiResponse.candidates.length : 0,
        execution_time_ms: execMs,
      })
      .select()
      .single();

    if (aiRunError || !aiRun) {
      await supabase
        .from('conversation_segments')
        .update({ extraction_status: 'failed' })
        .eq('id', segmentId);

      return NextResponse.json({ error: 'Failed to record AI run' }, { status: 500 });
    }

    // If invalid, fail-closed
    if (!validation.valid) {
      await supabase
        .from('conversation_segments')
        .update({ extraction_status: 'failed' })
        .eq('id', segmentId);

      return NextResponse.json(
        { error: 'AI extraction failed validation', details: validation.errors, ai_run_id: aiRun.id },
        { status: 422 }
      );
    }

    // Insert candidates (if any)
    const candidates = Array.isArray(aiResponse.candidates) ? aiResponse.candidates : [];

    if (candidates.length === 0) {
      await supabase
        .from('conversation_segments')
        .update({ extraction_status: 'no_signals_found' })
        .eq('id', segmentId);

      return NextResponse.json(
        { data: { ai_run: aiRun, candidates_generated: 0 } },
        { status: 200 }
      );
    }

    const rows = candidates.map((c: any) => ({
      user_id: user.id,
      signal_type: c.signal_type,
      label: c.label,
      description: c.description ?? null,

      // IMPORTANT: existing table has numeric confidence; we keep it optional (null)
      confidence: null,

      // Existing provenance fields in your schema:
      source_conversation_id: segment.conversation_id,
      source_excerpt: c.excerpt,

      // New v0 fields:
      segment_id: segmentId,
      ai_run_id: aiRun.id,
      confidence_level: c.confidence_level,
      risk_of_misinterpretation: c.risk_of_misinterpretation,
      excerpt_location: c.excerpt_location ?? null,
      constraint_type: c.constraint_type ?? 'none',
      trust_evidence: c.trust_evidence ?? null,
      action_suggested: !!c.action_suggested,
      related_themes: Array.isArray(c.related_themes) ? c.related_themes : null,
      temporal_context: c.temporal_context ?? null,
      suggested_links: c.suggested_links ?? null,

      review_status: 'pending',
      is_reviewed: false,
    }));

    const { error: insertCandidatesError } = await supabase
      .from('signal_candidates')
      .insert(rows);

    if (insertCandidatesError) {
      await supabase
        .from('conversation_segments')
        .update({ extraction_status: 'failed' })
        .eq('id', segmentId);

      return NextResponse.json(
        { error: insertCandidatesError.message, ai_run_id: aiRun.id },
        { status: 500 }
      );
    }

    await supabase
      .from('conversation_segments')
      .update({ extraction_status: 'completed' })
      .eq('id', segmentId);

    return NextResponse.json(
      { data: { ai_run: aiRun, candidates_generated: candidates.length } },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Unknown error' }, { status: 500 });
  }
}
