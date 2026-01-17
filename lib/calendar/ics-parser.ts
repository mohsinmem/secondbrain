/**
 * ICS Parser Utility
 * Parses .ics (iCalendar) files and extracts calendar events.
 * 
 * IMPORTANT: This is a truth-layer component.
 * - No interpretation or summarization
 * - Only structural parsing
 * - Preserves raw data for traceability
 */

import ICAL from 'ical.js';

export interface ParsedEvent {
    external_event_id: string;
    title: string;
    start_at: Date;
    end_at: Date;
    location?: string;
    attendees?: string[];
    raw_payload: Record<string, unknown>;
}

export interface ICSParseResult {
    events: ParsedEvent[];
    errors: string[];
    totalFound: number;
    dateRange: {
        earliest: Date | null;
        latest: Date | null;
    };
}

/**
 * Parse an ICS file and extract events
 * @param icsContent - The raw ICS file content as string
 * @param dateRangeStart - Optional: filter events starting from this date
 * @param dateRangeEnd - Optional: filter events ending before this date
 * @returns Parsed events with metadata
 */
export function parseICS(
    icsContent: string,
    dateRangeStart?: Date,
    dateRangeEnd?: Date
): ICSParseResult {
    const result: ICSParseResult = {
        events: [],
        errors: [],
        totalFound: 0,
        dateRange: {
            earliest: null,
            latest: null,
        },
    };

    try {
        // Fallback-safe import for ical.js
        let parser = ICAL;
        if (!parser || typeof parser.parse !== 'function') {
            // @ts-ignore - Fallback for internal bundler issues
            parser = (ICAL as any).default || ICAL;
        }

        const jcalData = parser.parse(icsContent);
        const comp = new parser.Component(jcalData);
        const vevents = comp.getAllSubcomponents('vevent');

        result.totalFound = vevents.length;

        for (const vevent of vevents) {
            try {
                const event = new parser.Event(vevent);

                // Extract basic fields
                const uid = event.uid;
                const summary = event.summary || '(No title)';
                const startDate = event.startDate?.toJSDate();
                const endDate = event.endDate?.toJSDate();

                if (!startDate || !endDate || isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
                    result.errors.push(`Event "${summary}" has missing or invalid start/end time`);
                    continue;
                }

                // --- START OF FIX: COMPOSITE EXTERNAL ID FOR RECURRING EVENTS ---
                // RECURRENCE-ID exists on overridden instances; fallback to DTSTART for normal instances
                const recurrenceIdDate = (event as any).recurrenceId?.toJSDate?.() || null;
                const occurrenceKeyDate = (recurrenceIdDate && !isNaN(recurrenceIdDate.getTime()))
                    ? recurrenceIdDate
                    : startDate;

                const occurrenceKey = occurrenceKeyDate.toISOString();
                const externalEventId = `${uid}::${occurrenceKey}`;
                // --- END OF FIX ---

                // Apply date range filter if provided
                if (dateRangeStart && endDate < dateRangeStart) continue;
                if (dateRangeEnd && startDate > dateRangeEnd) continue;

                // Extract location
                const location = event.location || undefined;

                // Extract attendees
                const attendeeProps = vevent.getAllProperties('attendee');
                const attendees = attendeeProps
                    .map((prop: any) => {
                        const cn = prop.getParameter('cn');
                        const email = prop.getFirstValue()?.replace('mailto:', '');
                        return cn || email || null;
                    })
                    .filter((a: string | null) => a !== null) as string[];

                // Build raw payload for traceability
                const raw_payload: Record<string, unknown> = {
                    uid,
                    summary,
                    dtstart: event.startDate?.toString(),
                    dtend: event.endDate?.toString(),
                    location: event.location,
                    description: event.description,
                    organizer: vevent.getFirstPropertyValue('organizer'),
                    rrule: vevent.getFirstPropertyValue('rrule')?.toString(),
                };

                // Track date range
                if (!result.dateRange.earliest || startDate < result.dateRange.earliest) {
                    result.dateRange.earliest = startDate;
                }
                if (!result.dateRange.latest || endDate > result.dateRange.latest) {
                    result.dateRange.latest = endDate;
                }

                result.events.push({
                    external_event_id: externalEventId,
                    title: summary,
                    start_at: startDate,
                    end_at: endDate,
                    location,
                    attendees: attendees.length > 0 ? attendees : undefined,
                    raw_payload,
                });
            } catch (err: any) {
                result.errors.push(`Failed to parse event: ${err.message}`);
            }
        }
    } catch (err: any) {
        result.errors.push(`Failed to parse ICS file: ${err.message}`);
    }

    return result;
}

/**
 * Validate ICS file size (prevent DoS via huge files)
 * @param sizeBytes - File size in bytes
 * @returns true if valid, false otherwise
 */
export function validateICSFileSize(sizeBytes: number): boolean {
    const MAX_SIZE = 10 * 1024 * 1024; // 10MB
    return sizeBytes <= MAX_SIZE;
}

/**
 * Basic ICS format validation
 * @param content - File content
 * @returns true if it looks like valid ICS, false otherwise
 */
export function validateICSFormat(content: string): boolean {
    // Very basic check - proper ICS files start with BEGIN:VCALENDAR
    const trimmed = content.trim();
    return trimmed.startsWith('BEGIN:VCALENDAR') && trimmed.includes('END:VCALENDAR');
}
