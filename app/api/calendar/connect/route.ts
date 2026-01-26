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
    try {
        const supabase = await createServerSupabaseClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Generate the Auth URL and redirect
        const authUrl = getAuthUrl();

        // We could store the user ID in a state parameter for extra security
        // but for now we rely on the session in the callback.

        return NextResponse.redirect(authUrl);
    } catch (error: any) {
        console.error('Connect error:', error);
        return NextResponse.json({ error: 'Failed to initiate connection' }, { status: 500 });
    }
}
