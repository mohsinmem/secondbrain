/**
 * Calendar Sync Service
 * 
 * Logic for fetching and persisting events from external providers.
 */

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { fetchGoogleEvents, refreshAccessToken } from '@/lib/calendar/google-client';
import { scrubEventPII } from '@/lib/middleware/pii_scrubber';

/**
 * Sync Google Calendar events for a specific source
 * 
 * @param sourceId - The ID of the calendar source in Supabase
 * @param lookbackDays - How many days to look back (default 90 per Phase 4.4)
 */
export async function syncGoogleCalendar(sourceId: string, lookbackDays: number = 90) {
    const supabase = await createServerSupabaseClient();

    // 1. Fetch tokens
    const { data: tokenData, error: tokenError } = await supabase
        .from('calendar_tokens')
        .select('*')
        .eq('source_id', sourceId)
        .single();

    if (tokenError || !tokenData) {
        throw new Error(`Failed to fetch tokens for source ${sourceId}`);
    }

    let accessToken = tokenData.access_token;

    // 2. Check token expiry and refresh if needed
    if (new Date(tokenData.expires_at) <= new Date(Date.now() + 60000)) { // 1 min buffer
        const refreshed = await refreshAccessToken(tokenData.refresh_token);
        accessToken = refreshed.access_token;

        // Update DB with new token
        await supabase
            .from('calendar_tokens')
            .update({
                access_token: accessToken,
                expires_at: refreshed.expires_at
            })
            .eq('id', tokenData.id);
    }

    // 3. Define time window (Phase 4.4: 90-day "Retroactive Intent" window)
    const now = new Date();
    const timeMin = new Date(now.getTime() - (lookbackDays * 24 * 60 * 60 * 1000)).toISOString();
    // No timeMax specified = fetch everything until infinity (usually limited by API)

    // 4. Fetch events from Google
    const googleEvents = await fetchGoogleEvents(accessToken, timeMin);

    // 5. Transform and Scrub
    const userId = tokenData.user_id;
    const eventsToInsert = googleEvents.map((gEvent: any) => {
        // Base event data
        const eventData = {
            user_id: userId,
            source_id: sourceId,
            external_event_id: gEvent.id,
            title: gEvent.summary || 'Untitled Event',
            start_at: gEvent.start?.dateTime || gEvent.start?.date,
            end_at: gEvent.end?.dateTime || gEvent.end?.date,
            location: gEvent.location || null,
            attendees: gEvent.attendees?.map((a: any) => a.email) || null,
            description: gEvent.description || null,
            raw_payload: gEvent,
        };

        // MANDATORY: Scrub PII before storage
        return scrubEventPII(eventData);
    });

    // 6. Batch Insert with Deduplication (UPSERT)
    if (eventsToInsert.length === 0) return 0;

    const BATCH_SIZE = 100;
    let insertedCount = 0;

    for (let i = 0; i < eventsToInsert.length; i += BATCH_SIZE) {
        const batch = eventsToInsert.slice(i, i + BATCH_SIZE);

        const { data, error } = await supabase
            .from('calendar_events')
            .upsert(batch, {
                onConflict: 'source_id,external_event_id',
                ignoreDuplicates: false, // Update existing records if they changed
            })
            .select('id');

        if (error) {
            console.error(`Batch insert error for source ${sourceId}:`, error);
        } else {
            insertedCount += data?.length || 0;
        }
    }

    // 7. Update last_synced_at
    await supabase
        .from('calendar_sources')
        .update({ last_synced_at: new Date().toISOString() })
        .eq('id', sourceId);

    return insertedCount;
}
