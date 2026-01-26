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
        // This will now throw a descriptive "Configuration Missing" error if env vars are not set
        const authUrl = getAuthUrl();

        return NextResponse.redirect(authUrl);
    } catch (error: any) {
        console.error('[OAuth Connect Error]:', error.message);

        if (error.message.includes('Configuration Missing')) {
            return NextResponse.json({
                error: 'Server Configuration Error',
                details: error.message
            }, { status: 500 });
        }

        return NextResponse.json({ error: 'Failed to initiate connection' }, { status: 500 });
    }
}
