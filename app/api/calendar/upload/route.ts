/**
 * Calendar Upload API Endpoint
 * POST /api/calendar/upload
 * 
 * Accepts .ics files and imports events into the calendar truth layer.
 * 
 * CRITICAL ENGINEERING GUARDRAIL:
 * This endpoint performs ZERO interpretation or summarization.
 * It is a truth-ingestion mechanism only.
 */

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { parseICS, validateICSFileSize, validateICSFormat } from '@/lib/calendar/ics-parser';
import { scrubEventsPII } from '@/lib/middleware/pii_scrubber';
import { NextRequest, NextResponse } from 'next/server';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

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

        // 2. Parse form data
        const formData = await req.formData();
        const file = formData.get('file') as File;
        const dateRangeStartStr = formData.get('date_range_start') as string | null;
        const dateRangeEndStr = formData.get('date_range_end') as string | null;

        if (!file) {
            return NextResponse.json(
                { error: 'No file provided. Please upload a .ics file.' },
                { status: 400 }
            );
        }

        // 3. Validate file
        if (!validateICSFileSize(file.size)) {
            return NextResponse.json(
                { error: 'File too large. Maximum size is 10MB.' },
                { status: 413 }
            );
        }

        if (!file.name.endsWith('.ics') && file.type !== 'text/calendar') {
            return NextResponse.json(
                { error: 'Invalid file type. Please upload a .ics file.' },
                { status: 400 }
            );
        }

        // 4. Read and parse ICS content
        const icsContent = await file.text();

        if (!validateICSFormat(icsContent)) {
            return NextResponse.json(
                { error: 'Invalid ICS format. File must be a valid iCalendar file.' },
                { status: 400 }
            );
        }

        const dateRangeStart = dateRangeStartStr ? new Date(dateRangeStartStr) : undefined;
        const dateRangeEnd = dateRangeEndStr ? new Date(dateRangeEndStr) : undefined;

        const parseResult = parseICS(icsContent, dateRangeStart, dateRangeEnd);

        if (parseResult.errors.length > 0 && parseResult.events.length === 0) {
            return NextResponse.json(
                {
                    error: 'Failed to parse ICS file.',
                    details: parseResult.errors
                },
                { status: 400 }
            );
        }

        // 5. Create calendar_source record
        const startDateString = parseResult.dateRange.earliest && !isNaN(parseResult.dateRange.earliest.getTime())
            ? parseResult.dateRange.earliest.toISOString().split('T')[0]
            : null;
        const endDateString = parseResult.dateRange.latest && !isNaN(parseResult.dateRange.latest.getTime())
            ? parseResult.dateRange.latest.toISOString().split('T')[0]
            : null;

        const { data: calendarSource, error: sourceError } = await supabase
            .from('calendar_sources')
            .insert({
                user_id: user.id,
                provider: 'upload',
                sync_mode: 'upload',
                date_range_start: startDateString,
                date_range_end: endDateString,
                last_synced_at: new Date().toISOString(),
                status: 'active',
            })
            .select('id')
            .single();

        if (sourceError || !calendarSource) {
            console.error('Failed to create calendar source:', JSON.stringify(sourceError));

            // Explicitly check for relation not found
            const errorMessage = sourceError?.message || '';
            if (errorMessage.includes('relation') || errorMessage.includes('does not exist')) {
                return NextResponse.json(
                    {
                        error: 'Database tables not found. Please run the Phase 3 migration first.',
                        details: 'Run: supabase db push or apply migration supabase/migrations/20260117143000_phase3_calendar_schema.sql',
                        technical_error: errorMessage
                    },
                    { status: 500 }
                );
            }

            return NextResponse.json(
                {
                    error: 'Failed to create calendar source.',
                    details: errorMessage || 'Unknown database error'
                },
                { status: 500 }
            );
        }

        // 6. PRIVACY GUARD: Scrub PII from events before storage
        const scrubbedEvents = scrubEventsPII(parseResult.events);

        // 7. Insert events (with deduplication via ON CONFLICT)
        const eventsToInsert = scrubbedEvents.map(event => ({
            user_id: user.id,
            source_id: calendarSource.id,
            external_event_id: event.external_event_id,
            title: event.title,
            start_at: event.start_at.toISOString(),
            end_at: event.end_at.toISOString(),
            location: event.location || null,
            attendees: event.attendees || null,
            raw_payload: event.raw_payload,
        }));

        let insertedCount = 0;
        let totalProcessed = 0;

        // Insert in batches to avoid payload size limits
        const BATCH_SIZE = 50; // Smaller batches for safety
        for (let i = 0; i < eventsToInsert.length; i += BATCH_SIZE) {
            const batch = eventsToInsert.slice(i, i + BATCH_SIZE);
            totalProcessed += batch.length;

            const { data: inserted, error: insertError } = await supabase
                .from('calendar_events')
                .upsert(batch, {
                    onConflict: 'source_id,external_event_id',
                    ignoreDuplicates: false,
                })
                .select('id');

            if (insertError) {
                console.error('Failed to insert events batch:', JSON.stringify(insertError));
                // If the whole batch fails, we skip it but keep going
                continue;
            }

            if (inserted) {
                insertedCount += inserted.length;
            }
        }

        const duplicateCount = parseResult.events.length - insertedCount;

        // 7. Return success response
        return NextResponse.json({
            success: true,
            source_id: calendarSource.id,
            events_imported: insertedCount,
            events_duplicate: duplicateCount,
            total_events_found: parseResult.totalFound,
            date_range: {
                start: parseResult.dateRange.earliest && !isNaN(parseResult.dateRange.earliest.getTime())
                    ? parseResult.dateRange.earliest.toISOString()
                    : undefined,
                end: parseResult.dateRange.latest && !isNaN(parseResult.dateRange.latest.getTime())
                    ? parseResult.dateRange.latest.toISOString()
                    : undefined,
            },
            parse_errors: parseResult.errors.length > 0 ? parseResult.errors : undefined,
        }, { status: 200 });

    } catch (error: any) {
        console.error('Calendar upload stack trace:', error);
        return NextResponse.json(
            {
                error: 'Internal server error.',
                details: error.message || 'An unexpected error occurred during upload.',
                type: error.name
            },
            { status: 500 }
        );
    }
}
