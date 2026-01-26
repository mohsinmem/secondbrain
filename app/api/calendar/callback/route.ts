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

    console.log('[OAuth Callback] Received callback from Google');

    if (error) {
        console.error('[OAuth Callback] Error parameter from Google:', error);
        return NextResponse.redirect(`${process.env.NEXT_PUBLIC_BASE_URL}/settings/calendars?status=error&message=${error}`);
    }

    if (!code) {
        console.warn('[OAuth Callback] No code provided in query string');
        return NextResponse.json({ error: 'No code provided' }, { status: 400 });
    }

    try {
        const supabase = await createServerSupabaseClient();
        console.log('[OAuth Callback] Supabase client initialized');

        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            console.error('[OAuth Callback] Auth state invalid:', authError?.message || 'No user');
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        console.log('[OAuth Callback] Validated user session:', user.id);

        // 0. PRIVACY & AUDIT: Validate configuration before proceeding
        console.log('[OAuth Callback] Validating server configuration...');
        try {
            validateConfig();
            console.log('[OAuth Callback] Config validation passed');
        } catch (configError: any) {
            console.error('[OAuth Callback] Config validation failed:', configError.message);
            return NextResponse.redirect(`${process.env.NEXT_PUBLIC_BASE_URL}/settings/calendars?status=error&message=config_error&details=${encodeURIComponent(configError.message)}`);
        }

        // 1. Exchange code for tokens
        console.log('[OAuth Callback] Exchanging code for tokens...');
        const tokens = await exchangeCodeForTokens(code);
        console.log('[OAuth Callback] Token exchange successful');

        // 2. Get user info from Google (to name the source)
        console.log('[OAuth Callback] Fetching Google user profile...');
        const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
            headers: { Authorization: `Bearer ${tokens.access_token}` },
        });
        const googleUser = await userRes.json();
        const email = googleUser.email || 'Google Calendar';
        console.log('[OAuth Callback] Fetched profile for:', email);

        // 3. Upsert calendar_source
        console.log('[OAuth Callback] Upserting calendar source...');
        const { data: source, error: sourceError } = await supabase
            .from('calendar_sources')
            .upsert({
                user_id: user.id,
                provider: 'google',
                sync_mode: 'oauth',
                status: 'active',
            }, {
                onConflict: 'user_id,provider',
            })
            .select('id')
            .single();

        if (sourceError || !source) {
            console.error('[OAuth Callback] DB Error (calendar_sources):', {
                message: sourceError?.message,
                code: sourceError?.code,
                details: sourceError?.details,
                hint: sourceError?.hint
            });
            throw new Error(`Failed to create calendar source: ${sourceError?.message || 'Unknown DB error'}`);
        }
        console.log('[OAuth Callback] Source record ready:', source.id);

        // 4. Store tokens
        console.log('[OAuth Callback] Storing OAuth tokens...');
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
            console.error('[OAuth Callback] DB Error (calendar_tokens):', {
                message: tokenError?.message,
                code: tokenError?.code,
                details: tokenError?.details,
                hint: tokenError?.hint
            });
            throw new Error(`Failed to store OAuth tokens: ${tokenError?.message || 'Unknown DB error'}`);
        }
        console.log('[OAuth Callback] Token record ready');

        // 5. Trigger initial "Retroactive Intent" sync (90 days)
        console.log('[OAuth Callback] Triggering initial 90-day sync...');
        try {
            const syncCount = await syncGoogleCalendar(source.id, 90);
            console.log(`[OAuth Callback] Initial sync complete. Processed ${syncCount} events.`);
        } catch (syncErr: any) {
            console.error('[OAuth Callback] Initial sync failed (non-blocking):', syncErr.message);
        }

        // 6. Redirect back to settings
        console.log('[OAuth Callback] Flow complete. Redirecting to settings UI.');
        return NextResponse.redirect(`${process.env.NEXT_PUBLIC_BASE_URL}/settings/calendars?status=success`);

    } catch (error: any) {
        console.error('[OAuth Callback Error CRITICAL]:', error.message);
        console.error('[OAuth Callback Error STACK]:', error.stack);
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || '';
        return NextResponse.redirect(`${baseUrl}/settings/calendars?status=error&message=internal_server_error&details=${encodeURIComponent(error.message)}`);
    }
}
