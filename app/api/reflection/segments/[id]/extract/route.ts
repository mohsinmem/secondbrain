import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

type ValidationResult = {
  valid: boolean;
  errors: string[];
  status: 'success' | 'partial' | 'failed';
  errorType?: 'invalid_json' | 'missing_required_fields' | 'timeout' | 'rate_limit' | 'other' | 'forbidden_content';
};

const FORBIDDEN_TERMS = ['rank', 'priority', 'score', 'urgent', 'importance', 'top insight', 'recommended action'];

function validateAIResponse(response: any): ValidationResult {
  const errors: string[] = [];

  if (typeof response !== 'object' || response === null) {
    return {
      valid: false,
      errors: ['Response must be a JSON object'],
      status: 'failed',
      errorType: 'invalid_json',
    };
  }

  // Forbidden Term Check (Recursive or string search)
  const jsonString = JSON.stringify(response).toLowerCase();
  for (const term of FORBIDDEN_TERMS) {
    if (jsonString.includes(term)) {
      return {
        valid: false,
        errors: [`Forbidden term detected: "${term}". AI ranking/scoring is not allowed.`],
        status: 'failed',
        errorType: 'forbidden_content'
      };
    }
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
      'confidence_level',
      'excerpt',
      'risk_of_misinterpretation',
      // New fields required
      'why_surfaced',
      'ambiguity_note'
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

function clampText(input: string, maxLen: number) {
  const s = (input ?? '').trim();
  return s.length > maxLen ? s.slice(0, maxLen - 1).trimEnd() + '…' : s;
}

/**
 * Extremely simple WhatsApp-ish line parser:
 * Example:
 * "08/09/17, 9:12 am - Joel: Yes we can..."
 */
function parseTranscriptLines(text: string) {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

  const parsed: Array<{ speaker?: string; message: string; raw: string }> = [];

  for (const raw of lines) {
    const m = raw.match(/^\d{1,2}\/\d{1,2}\/\d{2,4},?\s.*?\s-\s([^:]+):\s(.+)$/);
    if (m) {
      parsed.push({ speaker: m[1]?.trim(), message: m[2]?.trim(), raw });
      continue;
    }
    // fallback: "Name: message"
    const m2 = raw.match(/^([^:]{2,40}):\s(.+)$/);
    if (m2) {
      parsed.push({ speaker: m2[1]?.trim(), message: m2[2]?.trim(), raw });
      continue;
    }
    parsed.push({ message: raw, raw });
  }

  return parsed;
}

type CandidateOut = {
  signal_type: 'pattern' | 'opportunity' | 'warning' | 'insight' | 'promise';
  label: string;
  description: string;
  confidence_level: 'explicit' | 'inferred';
  excerpt: string;
  excerpt_location?: string | null;
  risk_of_misinterpretation: 'low' | 'medium' | 'high';
  constraint_type?: string | null;
  trust_evidence?: string | null;
  action_suggested?: boolean;
  related_themes?: string[] | null;
  temporal_context?: string | null;
  suggested_links?: any;
  // new
  why_surfaced: string;
  ambiguity_note: string;
};

function makeCandidate(partial: Partial<CandidateOut>): CandidateOut {
  // hard defaults that satisfy validation
  const excerpt = (partial.excerpt ?? '').trim();
  const label = clampText(partial.label ?? 'Untitled signal', 100);
  const description = clampText(partial.description ?? 'Candidate extracted from conversation context.', 500);

  return {
    signal_type: partial.signal_type ?? 'insight',
    label: label.length < 5 ? 'Untitled signal' : label,
    description: description.length < 10 ? 'Candidate extracted from conversation context.' : description,
    confidence_level: partial.confidence_level ?? 'inferred',
    excerpt: excerpt.length ? excerpt : clampText(partial.description ?? 'Excerpt unavailable', 200),
    excerpt_location: partial.excerpt_location ?? null,
    risk_of_misinterpretation: partial.risk_of_misinterpretation ?? 'medium',
    constraint_type: partial.constraint_type ?? 'none',
    trust_evidence: partial.trust_evidence ?? null,
    action_suggested: partial.action_suggested ?? false,
    related_themes: partial.related_themes ?? null,
    temporal_context: partial.temporal_context ?? null,
    suggested_links: partial.suggested_links ?? null,
    why_surfaced: partial.why_surfaced ?? 'Heuristic pattern match',
    ambiguity_note: partial.ambiguity_note ?? 'Automated extraction without semantic understanding.',
  };
}

/**
 * v0 deterministic extractor:
 * - Produces reviewable candidates without calling Claude yet
 * - Goal: 8–15 candidates for normal transcripts
 */
function heuristicExtract(segmentText: string): CandidateOut[] {
  const parsed = parseTranscriptLines(segmentText);
  const candidates: CandidateOut[] = [];

  const pushUnique = (c: CandidateOut) => {
    const key = (c.label + '|' + c.excerpt).toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push(c);
  };

  const seen = new Set<string>();

  // Helpers: detect intent
  const isQuestion = (s: string) => /\?\s*$/.test(s) || /\b(can|could|would|should|shall)\b/i.test(s);
  const isCommitment = (s: string) => /\b(i('| a)?ll|i will|we will|let's|lets|sure|yes)\b/i.test(s);
  const isScheduling = (s: string) => /\b(am|pm|tomorrow|today|monday|tuesday|wednesday|thursday|friday|saturday|sunday|at\s\d{1,2}|\d{1,2}:\d{2})\b/i.test(s);
  const isFollowUp = (s: string) => /\b(follow up|connect|call|meet|sync|quick chat|catch up)\b/i.test(s);
  const isDecisionOrNext = (s: string) => /\b(next step|we should|we need|plan|proceed|move ahead|start)\b/i.test(s);
  const isRiskOrBlocker = (s: string) => /\b(blocked|issue|problem|concern|risk|stuck|can't)\b/i.test(s);

  // Use the first ~60 meaningful messages
  const top = parsed.slice(0, 80);

  // 1) Scheduling / coordination candidates
  for (const item of top) {
    const msg = item.message || '';
    if (msg.length < 6) continue;

    if (isScheduling(msg)) {
      pushUnique(
        makeCandidate({
          signal_type: 'opportunity',
          label: 'Scheduling / coordination',
          description: 'Conversation includes time coordination. Capture scheduling intent and next-step alignment.',
          confidence_level: 'explicit',
          excerpt: clampText(item.raw, 220),
          risk_of_misinterpretation: 'low',
          trust_evidence: item.speaker ? `Message by ${item.speaker}` : null,
          action_suggested: true,
          related_themes: ['scheduling', 'coordination'],
          why_surfaced: 'Detected time/date keywords indicating scheduling.',
          ambiguity_note: 'Might be a past event reference, not a future plan.'
        })
      );
    }
  }

  // 2) Follow-up / relationship continuity
  for (const item of top) {
    const msg = item.message || '';
    if (msg.length < 6) continue;

    if (isFollowUp(msg)) {
      pushUnique(
        makeCandidate({
          signal_type: 'pattern',
          label: 'Follow-up loop',
          description: 'There is an explicit follow-up loop (connect/sync/call) indicating an open thread that should be tracked.',
          confidence_level: 'explicit',
          excerpt: clampText(item.raw, 220),
          risk_of_misinterpretation: 'low',
          trust_evidence: item.speaker ? `Message by ${item.speaker}` : null,
          action_suggested: true,
          related_themes: ['follow-up', 'relationship'],
          why_surfaced: 'Detected follow-up vocabulary.',
          ambiguity_note: 'Could be a courtesy closing rather than a firm plan.'
        })
      );
    }
  }

  // 3) Questions / information requests (potential open loops)
  for (const item of top) {
    const msg = item.message || '';
    if (msg.length < 10) continue;

    if (isQuestion(msg)) {
      pushUnique(
        makeCandidate({
          signal_type: 'insight',
          label: 'Open question / request',
          description: 'A direct question or request appears; this may represent an unresolved loop or dependency.',
          confidence_level: 'explicit',
          excerpt: clampText(item.raw, 220),
          risk_of_misinterpretation: 'medium',
          trust_evidence: item.speaker ? `Message by ${item.speaker}` : null,
          action_suggested: true,
          related_themes: ['open-loop'],
          why_surfaced: 'Detected question phrasing.',
          ambiguity_note: 'Question might be rhetorical or already answered.'
        })
      );
    }
  }

  // 4) Commitments / promises
  for (const item of top) {
    const msg = item.message || '';
    if (msg.length < 8) continue;

    if (isCommitment(msg) && (isFollowUp(msg) || isScheduling(msg) || isDecisionOrNext(msg))) {
      pushUnique(
        makeCandidate({
          signal_type: 'promise',
          label: 'Commitment made',
          description: 'A commitment/affirmation is present. Track as a promise or agreed next action.',
          confidence_level: 'explicit',
          excerpt: clampText(item.raw, 220),
          risk_of_misinterpretation: 'low',
          trust_evidence: item.speaker ? `Message by ${item.speaker}` : null,
          action_suggested: true,
          related_themes: ['commitment', 'next-steps'],
          why_surfaced: 'Strong commitment language detected.',
          ambiguity_note: 'Commitment might be casual or conditional.'
        })
      );
    }
  }

  // 5) Decisions / next steps / intents
  for (const item of top) {
    const msg = item.message || '';
    if (msg.length < 10) continue;

    if (isDecisionOrNext(msg)) {
      pushUnique(
        makeCandidate({
          signal_type: 'opportunity',
          label: 'Next-step intent',
          description: 'A concrete next-step or intent is stated. This can be promoted into an actionable signal if important.',
          confidence_level: 'explicit',
          excerpt: clampText(item.raw, 220),
          risk_of_misinterpretation: 'medium',
          trust_evidence: item.speaker ? `Message by ${item.speaker}` : null,
          action_suggested: true,
          related_themes: ['planning', 'execution'],
          why_surfaced: 'Explicit intent or planning language.',
          ambiguity_note: 'Action might be hypothetical.'
        })
      );
    }
  }

  // 6) Risks / blockers
  for (const item of top) {
    const msg = item.message || '';
    if (msg.length < 10) continue;

    if (isRiskOrBlocker(msg)) {
      pushUnique(
        makeCandidate({
          signal_type: 'warning',
          label: 'Potential blocker',
          description: 'A blocker/concern is mentioned. Track as a warning signal to revisit.',
          confidence_level: 'explicit',
          excerpt: clampText(item.raw, 220),
          risk_of_misinterpretation: 'medium',
          trust_evidence: item.speaker ? `Message by ${item.speaker}` : null,
          action_suggested: true,
          related_themes: ['risk', 'blocker'],
          why_surfaced: 'Negative sentiment or block words detected.',
          ambiguity_note: 'Context might mitigate the risk.'
        })
      );
    }
  }

  // 7) If still too few, add “context anchor” candidates from representative lines
  if (candidates.length < 8) {
    const anchors = top
      .filter((x) => (x.message || '').length > 25)
      .slice(0, 8 - candidates.length);

    for (const a of anchors) {
      pushUnique(
        makeCandidate({
          signal_type: 'insight',
          label: 'Context anchor',
          description: 'General context captured for review. Use accept/reject to keep only what matters.',
          confidence_level: 'inferred',
          excerpt: clampText(a.raw, 220),
          risk_of_misinterpretation: 'high',
          trust_evidence: a.speaker ? `Message by ${a.speaker}` : null,
          action_suggested: false,
          related_themes: ['context'],
          why_surfaced: 'Representative sample for low-signal conversation.',
          ambiguity_note: 'May not contain actionable insight.'
        })
      );
    }
  }

  // Cap to keep UI usable
  return candidates.slice(0, 15);
}

/**
 * POST /api/reflection/segments/[id]/extract
 * v0: deterministic extractor (no Claude yet) + audit + candidate insert.
 *
 * NOTE:
 * We allow re-run if extraction_status is 'failed' OR 'no_signals_found'.
 * We block only if 'processing' or 'completed'.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const segmentId = params.id;
  console.log('[Extract] Request received for segment:', segmentId);

  try {
    const supabase = await createServerSupabaseClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      console.log('[Extract] Auth failed:', authError?.message);
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.log('[Extract] User authenticated:', user.id);

    const { data: segment, error: fetchError } = await supabase
      .from('conversation_segments')
      .select('id, user_id, conversation_id, segment_text, extraction_status')
      .eq('id', segmentId)
      .eq('user_id', user.id)
      .single();

    if (fetchError || !segment) {
      console.log('[Extract] Segment not found or error:', fetchError?.message);
      return NextResponse.json({ error: 'Segment not found' }, { status: 404 });
    }
    console.log('[Extract] Segment found, status:', segment.extraction_status, 'len:', segment.segment_text?.length);

    // If force is false, block re-runs
    const processingOrCompleted = segment.extraction_status === 'completed' || segment.extraction_status === 'processing';
    const force = request.nextUrl.searchParams.get('force') === 'true';

    if (processingOrCompleted && !force) {
      console.log('[Extract] Segment already processed, blocking re-run');
      return NextResponse.json({ error: 'Segment already processed or processing' }, { status: 409 });
    }

    // Mark processing
    await supabase
      .from('conversation_segments')
      .update({ extraction_status: 'processing' })
      .eq('id', segmentId)
      .eq('user_id', user.id);

    console.log('[Extract] Set status to processing');

    let body = {};
    try {
      body = await request.json();
    } catch (e) {
      console.log('[Extract] No JSON body or invalid');
    }
    const model = (body as any)?.model || 'heuristic-v0';

    console.log('[Extract] Model:', model);

    const start = Date.now();

    // === v0 deterministic extraction ===
    const extracted = heuristicExtract(segment.segment_text || '');

    const aiResponse = {
      status: 'success',
      candidates: extracted,
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
      console.log('[Extract] Failed to record AI run:', aiRunError?.message);
      await supabase
        .from('conversation_segments')
        .update({ extraction_status: 'failed' })
        .eq('id', segmentId)
        .eq('user_id', user.id);

      return NextResponse.json({ error: 'Failed to record AI run' }, { status: 500 });
    }

    // If invalid, fail-closed
    if (!validation.valid) {
      console.log('[Extract] Validation failed:', validation.errors);
      await supabase
        .from('conversation_segments')
        .update({ extraction_status: 'failed' })
        .eq('id', segmentId)
        .eq('user_id', user.id);

      return NextResponse.json(
        { error: 'AI extraction failed validation', details: validation.errors, ai_run_id: aiRun.id },
        { status: 422 }
      );
    }

    // Insert candidates (if any)
    const candidates = Array.isArray(aiResponse.candidates) ? aiResponse.candidates : [];

    if (candidates.length === 0) {
      console.log('[Extract] No candidates found, marking no_signals_found');
      await supabase
        .from('conversation_segments')
        .update({ extraction_status: 'no_signals_found' })
        .eq('id', segmentId)
        .eq('user_id', user.id);

      return NextResponse.json(
        { data: { ai_run: aiRun, candidates_generated: 0 } },
        { status: 200 }
      );
    }

    // CHECK IDEMPOTENCY: Delete existing candidates for this segment before inserting new ones
    console.log('[Extract] Clearing existing candidates for segment:', segmentId);
    const { error: deleteError } = await supabase
      .from('signal_candidates')
      .delete()
      .eq('segment_id', segmentId)
      .eq('user_id', user.id); // Safety check

    if (deleteError) {
      console.log('[Extract] Failed to clear existing candidates:', deleteError.message);
      // We continue? Or fail? Fail safe is better.
      await supabase
        .from('conversation_segments')
        .update({ extraction_status: 'failed' })
        .eq('id', segmentId)
        .eq('user.id', user.id);

      return NextResponse.json({ error: 'Failed to clear old candidates' }, { status: 500 });
    }

    // Prepare rows
    console.log('[Extract] Inserting candidates:', candidates.length);
    const rows = candidates.map((c: any) => ({
      user_id: user.id,
      signal_type: c.signal_type,
      label: c.label,
      description: c.description ?? null,

      // numeric confidence (optional for now)
      confidence: null,

      source_conversation_id: segment.conversation_id,
      source_excerpt: c.excerpt,

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

      // new fields
      why_surfaced: c.why_surfaced,
      ambiguity_note: c.ambiguity_note,

      review_status: 'pending',
      is_reviewed: false,
    }));

    const { error: insertCandidatesError } = await supabase
      .from('signal_candidates')
      .insert(rows);

    if (insertCandidatesError) {
      console.log('[Extract] Insert candidates failed:', insertCandidatesError.message);
      await supabase
        .from('conversation_segments')
        .update({ extraction_status: 'failed' })
        .eq('id', segmentId)
        .eq('user_id', user.id);

      return NextResponse.json(
        { error: insertCandidatesError.message, ai_run_id: aiRun.id },
        { status: 500 }
      );
    }

    console.log('[Extract] Success. Marking completed.');
    await supabase
      .from('conversation_segments')
      .update({ extraction_status: 'completed' })
      .eq('id', segmentId)
      .eq('user_id', user.id);

    return NextResponse.json(
      { data: { ai_run: aiRun, candidates_generated: candidates.length } },
      { status: 200 }
    );
  } catch (e: any) {
    console.log('[Extract] Unexpected error:', e);
    return NextResponse.json({ error: e?.message ?? 'Unknown error' }, { status: 500 });
  }
}
