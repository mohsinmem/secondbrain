/**
 * Google Calendar Connect Route
 * GET /api/calendar/connect
 * 
 * Initiates the OAuth2 flow by redirecting the user to Google's consent screen.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUrl } from '@/lib/calendar/google-client';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
    console.log('[OAuth Connect] Starting connection handshake...');
    try {
        const supabase = await createServerSupabaseClient();
        console.log('[OAuth Connect] Supabase client initialized');

        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError) {
            console.error('[OAuth Connect] Auth error:', authError.message);
            return NextResponse.json({ error: 'Auth failed', details: authError.message }, { status: 401 });
        }

        if (!user) {
            console.warn('[OAuth Connect] No user found in session');
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        console.log('[OAuth Connect] Authenticated user:', user.id);

        // Audit configuration (Safe logs only)
        console.log('[OAuth Connect] Validating environment keys...');
        const hasClientId = !!process.env.GOOGLE_CLIENT_ID;
        const hasClientSecret = !!process.env.GOOGLE_CLIENT_SECRET;
        const hasBaseUrl = !!process.env.NEXT_PUBLIC_BASE_URL;

        console.log(`[OAuth Connect] Config status - ClientID: ${hasClientId}, Secret: ${hasClientSecret}, BaseURL: ${hasBaseUrl}`);

        // Generate the Auth URL and redirect
        const authUrl = getAuthUrl();
        console.log('[OAuth Connect] Generated Auth URL successfully');

        return NextResponse.redirect(authUrl);
    } catch (error: any) {
        console.error('[OAuth Connect Error CRITICAL]:', error.message);
        console.error('[OAuth Connect Error STACK]:', error.stack);

        if (error.message.includes('Configuration Missing')) {
            return NextResponse.json({
                error: 'Server Configuration Error',
                details: error.message
            }, { status: 500 });
        }

        return NextResponse.json({ error: 'Failed to initiate connection', details: error.message }, { status: 500 });
    }
}
