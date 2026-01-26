/**
 * Google Calendar Callback Route
 * GET /api/calendar/callback
 * 
 * Handles the redirect back from Google OAuth, exchanges code for tokens,
 * and initializes the calendar source.
 */

import { NextRequest, NextResponse } from 'next/server';
import { exchangeCodeForTokens, validateConfig } from '@/lib/calendar/google-client';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { syncGoogleCalendar } from '@/lib/services/calendar_sync';

export async function GET(req: NextRequest) {
    const searchParams = req.nextUrl.searchParams;
    const code = searchParams.get('code');
    const error = searchParams.get('error');

    if (error) {
        console.error('OAuth error callback:', error);
        return NextResponse.redirect(`${process.env.NEXT_PUBLIC_BASE_URL}/settings/calendars?status=error&message=${error}`);
    }

    if (!code) {
        return NextResponse.json({ error: 'No code provided' }, { status: 400 });
    }

    try {
        const supabase = await createServerSupabaseClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // 0. PRIVACY & AUDIT: Validate configuration before proceeding
        // This ensures redirect_uri alignment and credential presence
        try {
            validateConfig();
        } catch (configError: any) {
            return NextResponse.redirect(`${process.env.NEXT_PUBLIC_BASE_URL}/settings/calendars?status=error&message=config_error&details=${encodeURIComponent(configError.message)}`);
        }

        // 1. Exchange code for tokens
        const tokens = await exchangeCodeForTokens(code);

        // 2. Get user info from Google (to name the source)
        const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
            headers: { Authorization: `Bearer ${tokens.access_token}` },
        });
        const googleUser = await userRes.json();
        const email = googleUser.email || 'Google Calendar';

        // 3. Upsert calendar_source (one Google source per user for now)
        const { data: source, error: sourceError } = await supabase
            .from('calendar_sources')
            .upsert({
                user_id: user.id,
                provider: 'google',
                sync_mode: 'oauth',
                status: 'active',
                // We don't specify date_range_start/end yet, sync will fill it
            }, {
                onConflict: 'user_id,provider', // Assumes a unique index or logic handles this
            })
            .select('id')
            .single();

        if (sourceError || !source) {
            console.error('Source upsert error:', sourceError);
            throw new Error('Failed to create calendar source');
        }

        // 4. Store tokens
        const { error: tokenError } = await supabase
            .from('calendar_tokens')
            .upsert({
                source_id: source.id,
                user_id: user.id,
                access_token: tokens.access_token,
                refresh_token: tokens.refresh_token,
                expires_at: tokens.expires_at,
                token_type: tokens.token_type,
                scope: tokens.scope,
            }, {
                onConflict: 'source_id',
            });

        if (tokenError) {
            console.error('Token storage error:', tokenError);
            throw new Error('Failed to store OAuth tokens');
        }

        // 5. Trigger initial "Retroactive Intent" sync (90 days)
        // Note: In a large app, this might be a background job.
        // For now, we run it inline (it might timeout if there are MANY events, 
        // but 90 days is usually small).
        try {
            await syncGoogleCalendar(source.id, 90);
        } catch (syncErr) {
            console.error('Initial sync failed:', syncErr);
            // We still proceed, as the connection is established.
        }

        // 6. Redirect back to settings
        return NextResponse.redirect(`${process.env.NEXT_PUBLIC_BASE_URL}/settings/calendars?status=success`);

    } catch (error: any) {
        console.error('Callback error:', error);
        return NextResponse.redirect(`${process.env.NEXT_PUBLIC_BASE_URL}/settings/calendars?status=error&message=internal_server_error`);
    }
}
