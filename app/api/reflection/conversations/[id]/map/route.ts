import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

/**
 * Conversation Map Structure
 * Strictly structural/orientational. No ranking.
 */
interface ConversationMapData {
  participants: string[];
  themes: string[];
  phases: {
    name: string;
    summary: string;
    line_start?: number;
    line_end?: number;
  }[];
  signal_zones: {
    phase_idx: number; // reference to phase array index
    reason: string;
  }[];
  guardrails: string[];
  readiness: {
    quality: 'low' | 'medium' | 'high';
    reason: string;
  };
  metadata?: {
    length_chars: number;
    message_count: number;
    detected_language: string;
  };
}

const FORBIDDEN_TERMS = ['rank', 'priority', 'score', 'urgent', 'importance', 'top insight', 'recommended action'];

function validateMapResponse(data: any): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // 1. Structure check
  if (!data || typeof data !== 'object') {
    return { valid: false, errors: ['Invalid JSON object'] };
  }
  if (!Array.isArray(data.participants)) errors.push('Missing participants array');
  if (!Array.isArray(data.themes)) errors.push('Missing themes array');
  if (!Array.isArray(data.phases)) errors.push('Missing phases array');
  if (!Array.isArray(data.guardrails)) errors.push('Missing guardrails array');
  if (!data.readiness || typeof data.readiness !== 'object') errors.push('Missing readiness object');

  // 2. Forbidden Term Check (Recursive or string search)
  const jsonString = JSON.stringify(data).toLowerCase();
  for (const term of FORBIDDEN_TERMS) {
    if (jsonString.includes(term)) {
      errors.push(`Forbidden term detected: "${term}". AI ranking/scoring is not allowed.`);
    }
  }

  // 3. Logic checks
  if (data.readiness && !['low', 'medium', 'high'].includes(data.readiness.quality)) {
    errors.push('Invalid readiness quality');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Heuristic Mapper (v0 Placeholder for LLM)
 * Extracts structure without interpretation.
 */
function heuristicMap(text: string): ConversationMapData {
  const lines = text.split('\n').filter(l => l.trim());
  const length = text.length;

  // 1. Participants extraction (simple regex for "Name:")
  const participants = new Set<string>();
  const speakerRegex = /^([^:]{2,20}):\s/;
  for (const line of lines.slice(0, 500)) { // Verify first 500 lines
    const m = line.match(speakerRegex);
    if (m) participants.add(m[1].trim());
  }

  // 2. Phases (Naive: split by thirds)
  const totalLines = lines.length;
  const third = Math.floor(totalLines / 3);
  const phases = [
    {
      name: 'Opening / Context',
      summary: 'Initial exchange and context setting.',
      line_start: 1,
      line_end: third
    },
    {
      name: 'Core Discussion',
      summary: 'Main exchange of information and points.',
      line_start: third + 1,
      line_end: third * 2
    },
    {
      name: 'Closing / Next Steps',
      summary: 'Wrap up and potential follow-ups.',
      line_start: third * 2 + 1,
      line_end: totalLines
    }
  ];

  // 3. Themes (Naive: Keyword frequency or static for v0)
  // In a real LLM run, this would be dynamic.
  const themes = ['General Discussion'];
  if (text.match(/schedule|time|meet/i)) themes.push('Scheduling');
  if (text.match(/price|cost|budget/i)) themes.push('Financial');
  if (text.match(/plan|strategy|roadmap/i)) themes.push('Strategy');

  // 4. Signal Zones (Just point to the middle for now)
  const signal_zones = [
    { phase_idx: 1, reason: 'High density of discussion turns.' }
  ];

  // 5. Guardrails
  const guardrails = ['Verify speaker identities (inferred from text).'];
  if (participants.size === 0) guardrails.push('No clear speakers detected; transcript might be raw prose.');

  // 6. Readiness
  let quality: 'low' | 'medium' | 'high' = 'medium';
  if (length < 100) quality = 'low';
  if (participants.size > 1) quality = 'high';

  return {
    participants: Array.from(participants),
    themes,
    phases,
    signal_zones,
    guardrails,
    readiness: {
      quality,
      reason: participants.size > 0 ? 'Speakers identified' : 'Unstructured text'
    },
    metadata: {
      length_chars: length,
      message_count: lines.length,
      detected_language: 'en' // stub
    }
  };
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const conversationId = params.id;
  console.log('[Map] Request received for conversation:', conversationId);

  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 1. Fetch Conversation
    const { data: conversation, error: fetchError } = await supabase
      .from('raw_conversations')
      .select('id, raw_text, user_id')
      .eq('id', conversationId)
      .eq('user_id', user.id)
      .single();

    if (fetchError || !conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    const model = 'map-heuristic-v0';
    const start = Date.now();

    // 2. Generate Map (Logic)
    const mapData = heuristicMap(conversation.raw_text || '');
    const execMs = Date.now() - start;

    // 3. Validation (Fail-Closed)
    const validation = validateMapResponse(mapData);

    // 4. Audit Run
    const { data: aiRun, error: aiRunError } = await supabase
      .from('ai_runs')
      .insert({
        user_id: user.id,
        conversation_id: conversationId,
        model,
        status: validation.valid ? 'success' : 'failed',
        error_type: validation.valid ? null : 'forbidden_content',
        error_details: validation.errors.join('; '),
        raw_output: mapData,
        execution_time_ms: execMs
        // segment_id is null for conversation map
      })
      .select()
      .single();

    if (aiRunError) {
      console.error('[Map] Failed to log AI run', aiRunError);
      return NextResponse.json({ error: 'Audit failure' }, { status: 500 });
    }

    if (!validation.valid) {
      console.error('[Map] Validation failed (ranking/safety guard)', validation.errors);
      return NextResponse.json(
        { error: 'Map generation rejected by safety guard', details: validation.errors, ai_run_id: aiRun?.id },
        { status: 422 }
      );
    }

    // 5. Save Map
    const { error: saveError } = await supabase
      .from('conversation_maps')
      .upsert({
        conversation_id: conversationId,
        user_id: user.id,
        map_data: mapData as any
      }, { onConflict: 'conversation_id' });

    if (saveError) {
      console.error('[Map] Database save failed', saveError);
      return NextResponse.json({ error: 'Failed to save map' }, { status: 500 });
    }

    return NextResponse.json({
      data: {
        map: mapData,
        ai_run: aiRun
      }
    });

  } catch (e: any) {
    console.error('[Map] Unexpected error:', e);
    return NextResponse.json({ error: e.message || 'Unknown error' }, { status: 500 });
  }
}
