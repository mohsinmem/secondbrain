import { createServerSupabaseClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/reflection/conversations/[id]/map
 * v0 stub: stores a deterministic "reflection_map" into raw_conversations.source_metadata
 *
 * Rules:
 * - Idempotent: if reflection_map exists, return it
 * - No AI calls yet
 * - Stores versioned payload for forward compatibility
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createServerSupabaseClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const conversationId = params.id;

    const { data: conversation, error: fetchError } = await supabase
      .from('raw_conversations')
      .select('id, user_id, raw_text, platform, participants, source_metadata')
      .eq('id', conversationId)
      .eq('user_id', user.id)
      .single();

    if (fetchError || !conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    // Guard: too short to map
    if (!conversation.raw_text || conversation.raw_text.trim().length < 50) {
      return NextResponse.json({ error: 'Conversation text too short to map' }, { status: 400 });
    }

    // Idempotency: return existing
    const existing = conversation.source_metadata?.reflection_map;
    if (existing) {
      return NextResponse.json({
        data: {
          map: existing.map,
          version: existing.version,
          generated_at: existing.generated_at,
          already_existed: true,
        }
      }, { status: 200 });
    }

    const startTime = Date.now();
    const stubMap = generateStubMap(
      conversation.raw_text,
      conversation.participants || [],
      conversation.platform
    );
    const executionTime = Date.now() - startTime;

    const reflectionMap = {
      version: 'v0',
      generated_at: new Date().toISOString(),
      model: 'stub_v0',
      execution_time_ms: executionTime,
      map: stubMap
    };

    const updatedMetadata = {
      ...(conversation.source_metadata || {}),
      reflection_map: reflectionMap
    };

    // Return DB truth
    const { data: updatedConversation, error: updateError } = await supabase
      .from('raw_conversations')
      .update({ source_metadata: updatedMetadata })
      .eq('id', conversationId)
      .select('source_metadata')
      .single();

    if (updateError || !updatedConversation) {
      return NextResponse.json(
        { error: updateError?.message || 'Failed to store map' },
        { status: 500 }
      );
    }

    const persisted = updatedConversation.source_metadata?.reflection_map;

    return NextResponse.json({
      data: {
        map: persisted.map,
        version: persisted.version,
        generated_at: persisted.generated_at,
        execution_time_ms: persisted.execution_time_ms,
        already_existed: false
      }
    }, { status: 200 });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

function generateStubMap(
  rawText: string,
  participants: string[],
  platform: string
) {
  const textLength = rawText.length;
  const lineCount = rawText.split('\n').length;

  let quality: 'rich' | 'moderate' | 'sparse' = 'sparse';
  let readiness: 'high' | 'medium' | 'low' = 'low';

  if (lineCount > 100 && textLength > 2000) {
    quality = 'rich';
    readiness = 'high';
  } else if (lineCount > 20 && textLength > 500) {
    quality = 'moderate';
    readiness = 'medium';
  }

  return {
    participants: participants.map(name => ({
      name,
      inferred_role: 'unknown',
      engagement_pattern: 'unknown'
    })),
    themes: ['professional discussion', 'relationship building'],
    timeline_phases: [
      {
        phase: 'Full conversation',
        approximate_timeframe: 'Entire range',
        summary: 'v0 stub: conversation requires AI mapping for detailed analysis'
      }
    ],
    relationship_trajectory: 'active conversation',
    signal_hotspots: [
      {
        location: 'Throughout conversation',
        type: 'pattern',
        reason: 'v0 stub: real hotspot detection requires AI analysis'
      }
    ],
    interpretation_guardrails: [
      'v0 stub: detailed guardrails require AI context analysis',
      'Treat all extractions as preliminary until AI mapping is enabled'
    ],
    conversation_quality: quality,
    extraction_readiness: readiness
  };
}
