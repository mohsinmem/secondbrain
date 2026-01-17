/**
 * Calendar Map Generation API Endpoint
 * POST /api/reflection/calendar/map
 * 
 * CRITICAL ENGINEERING GUARDRAIL:
 * This endpoint MUST remain descriptive only.
 * Any prioritization, ranking, scoring, or urgency inference
 * is considered a critical epistemic violation.
 * Fail closed if unsure.
 * 
 * This generates orientation maps from calendar data:
 * - Participants (who you met with)
 * - Themes (what types of events)
 * - Time patterns (when events cluster)
 * - Reflection zones (areas that might contain insights)
 * - Guardrails (ambiguity warnings)
 * - Readiness (quality indicators)
 */

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

// Prohibited terms that indicate ranking/prioritization
const PROHIBITED_TERMS = [
    'top',
    'priority',
    'important',
    'score',
    'urgent',
    'critical',
    'must',
    'should',
    'essential',
    'key',
    'major',
    'significant',
];

interface CalendarMapRequest {
    source_id: string;
    date_range_start?: string;
    date_range_end?: string;
}

export async function POST(req: NextRequest) {
    try {
        const supabase = await createServerSupabaseClient();

        // 1. Check authentication
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json(
                { error: 'Unauthorized. Please log in.' },
                { status: 401 }
            );
        }

        // 2. Parse request body
        const body: CalendarMapRequest = await req.json();
        const { source_id, date_range_start, date_range_end } = body;

        if (!source_id) {
            return NextResponse.json(
                { error: 'Missing source_id.' },
                { status: 400 }
            );
        }

        // 3. Fetch calendar source (verify ownership)
        const { data: calendarSource, error: sourceError } = await supabase
            .from('calendar_sources')
            .select('*')
            .eq('id', source_id)
            .eq('user_id', user.id)
            .single();

        if (sourceError || !calendarSource) {
            return NextResponse.json(
                { error: 'Calendar source not found or access denied.' },
                { status: 404 }
            );
        }

        // 4. Fetch events from the source
        let eventsQuery = supabase
            .from('calendar_events')
            .select('*')
            .eq('source_id', source_id)
            .order('start_at', { ascending: true });

        if (date_range_start) {
            eventsQuery = eventsQuery.gte('start_at', date_range_start);
        }
        if (date_range_end) {
            eventsQuery = eventsQuery.lte('end_at', date_range_end);
        }

        const { data: events, error: eventsError } = await eventsQuery;

        if (eventsError) {
            console.error('Failed to fetch events:', eventsError);
            return NextResponse.json(
                { error: 'Failed to fetch events.' },
                { status: 500 }
            );
        }

        if (!events || events.length === 0) {
            return NextResponse.json(
                { error: 'No events found for the specified date range.' },
                { status: 404 }
            );
        }

        // 5. Generate map data via AI (orientation only)
        const aiStartTime = new Date();

        // TODO: Call AI service to generate map
        // For now, using deterministic analysis as stub
        const mapData = await generateCalendarMapDeterministic(events);

        // 6. Validate map output (fail-closed)
        const violations = detectProhibitedTerms(JSON.stringify(mapData));
        if (violations.length > 0) {
            // Log AI run as failed
            await supabase.from('ai_runs').insert({
                user_id: user.id,
                run_type: 'calendar_map',
                model: 'deterministic-v0',
                status: 'failed',
                error_type: 'epistemic_violation',
                error_message: `Map output contains prohibited terms: ${violations.join(', ')}`,
                input_data: { source_id, event_count: events.length },
                output_data: mapData,
                started_at: aiStartTime.toISOString(),
                completed_at: new Date().toISOString(),
            });

            return NextResponse.json(
                {
                    error: 'Map generation failed validation.',
                    violations,
                    details: 'Output contained ranking or prioritization language, which violates system constraints.',
                },
                { status: 422 }
            );
        }

        // 7. Log successful AI run
        const { data: aiRun } = await supabase.from('ai_runs').insert({
            user_id: user.id,
            run_type: 'calendar_map',
            model: 'deterministic-v0',
            status: 'success',
            input_data: { source_id, event_count: events.length, date_range_start, date_range_end },
            output_data: mapData,
            started_at: aiStartTime.toISOString(),
            completed_at: new Date().toISOString(),
        }).select('id').single();

        // 8. Store map in calendar_maps table
        const { data: storedMap, error: mapError } = await supabase
            .from('calendar_maps')
            .upsert({
                user_id: user.id,
                source_id,
                date_range_start: date_range_start || null,
                date_range_end: date_range_end || null,
                map_data: mapData,
                ai_run_id: aiRun?.id || null,
            }, {
                onConflict: 'source_id,date_range_start,date_range_end',
            })
            .select('id')
            .single();

        if (mapError) {
            console.error('Failed to store calendar map:', mapError);
            return NextResponse.json(
                { error: 'Failed to store map.' },
                { status: 500 }
            );
        }

        // 9. Return success
        return NextResponse.json({
            success: true,
            map_id: storedMap.id,
            map_data: mapData,
            ai_run_id: aiRun?.id,
        }, { status: 200 });

    } catch (error: any) {
        console.error('Calendar map generation error:', error);
        return NextResponse.json(
            { error: 'Internal server error.', details: error.message },
            { status: 500 }
        );
    }
}

/**
 * Detect prohibited terms in map output
 */
function detectProhibitedTerms(output: string): string[] {
    const lowerOutput = output.toLowerCase();
    return PROHIBITED_TERMS.filter(term => {
        // Match whole words only
        const regex = new RegExp(`\\b${term}\\b`, 'i');
        return regex.test(lowerOutput);
    });
}

/**
 * Generate calendar map using deterministic analysis
 * (Stub for v0 - will be replaced with AI in later iteration)
 */
async function generateCalendarMapDeterministic(events: any[]) {
    // Extract participants from attendees
    const participantCounts = new Map<string, number>();
    events.forEach(event => {
        if (event.attendees) {
            event.attendees.forEach((attendee: string) => {
                participantCounts.set(attendee, (participantCounts.get(attendee) || 0) + 1);
            });
        }
    });

    const participants = Array.from(participantCounts.entries())
        .map(([name, frequency]) => ({
            name,
            frequency,
            confidence: 'explicit' as const,
        }))
        .sort((a, b) => b.frequency - a.frequency)
        .slice(0, 20); // Top 20 by frequency (descriptive, not prescriptive)

    // Extract themes from titles/locations
    const titleWords = new Map<string, number>();
    events.forEach(event => {
        const words = event.title.toLowerCase().split(/\\s+/)
            .filter((w: string) => w.length > 3);
        words.forEach((word: string) => {
            titleWords.set(word, (titleWords.get(word) || 0) + 1);
        });
    });

    const themes = Array.from(titleWords.entries())
        .filter(([_, count]) => count >= 2)
        .map(([topic, event_count]) => ({ topic, event_count }))
        .sort((a, b) => b.event_count - a.event_count)
        .slice(0, 10);

    // Identify time patterns
    const eventsByWeek = new Map<string, number>();
    events.forEach(event => {
        const date = new Date(event.start_at);
        const weekKey = `${date.getFullYear()}-W${getWeekNumber(date)}`;
        eventsByWeek.set(weekKey, (eventsByWeek.get(weekKey) || 0) + 1);
    });

    const avgEventsPerWeek = Array.from(eventsByWeek.values()).reduce((a, b) => a + b, 0) / eventsByWeek.size;
    const denseWeeks = Array.from(eventsByWeek.entries())
        .filter(([_, count]) => count > avgEventsPerWeek * 1.5)
        .map(([week]) => week)
        .slice(0, 5);

    // Identify reflection zones (high-density periods)
    const reflectionZones = denseWeeks.map(week => ({
        description: `High event density in ${week}`,
        event_ids: events
            .filter(e => {
                const date = new Date(e.start_at);
                return `${date.getFullYear()}-W${getWeekNumber(date)}` === week;
            })
            .map(e => e.id)
            .slice(0, 10),
        ambiguity_warning: 'High density could indicate routine scheduled events, not necessarily strategic activity',
    }));

    // Determine readiness
    const hasAttendees = events.some(e => e.attendees && e.attendees.length > 0);
    const hasLocations = events.some(e => e.location);

    let quality: 'low' | 'medium' | 'high' = 'low';
    const reasons: string[] = [];

    if (events.length > 50) {
        quality = 'medium';
        reasons.push('Good event density');
    } else if (events.length < 20) {
        reasons.push('Limited event count');
    }

    if (!hasAttendees) {
        reasons.push('Limited attendee data');
    }
    if (!hasLocations) {
        reasons.push('Limited location data');
    }
    if (hasAttendees && hasLocations) {
        quality = 'high';
    }

    return {
        participants,
        themes,
        time_patterns: {
            dense_weeks: denseWeeks,
            gaps: [], // Could be calculated from event gaps
        },
        event_clusters: [], // TODO: Identify recurring events
        reflection_zones: reflectionZones,
        guardrails: [
            'Event frequency does not indicate value or meaning',
            'Participant counts reflect scheduling, not relationship depth',
            'Title keywords may not represent actual content or outcomes',
        ],
        readiness: {
            quality,
            reasons: reasons.length > 0 ? reasons : ['Sufficient data for extraction'],
            suggested_next_step: 'You can extract candidates or attach context if useful',
        },
    };
}

/**
 * Get ISO week number
 */
function getWeekNumber(date: Date): number {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}
