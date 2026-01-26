/**
 * Google Calendar API Client (Lightweight)
 * 
 * Handles OAuth2 handshake and basic Calendar API calls without heavy dependencies.
 */

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
const REDIRECT_URI = `${BASE_URL.replace(/\/$/, '')}/api/calendar/callback`;

/**
 * Validate that all required Google OAuth environment variables are present.
 * Throws a descriptive error if any are missing.
 */
export function validateConfig() {
    const missing = [];
    if (!GOOGLE_CLIENT_ID) missing.push('GOOGLE_CLIENT_ID');
    if (!GOOGLE_CLIENT_SECRET) missing.push('GOOGLE_CLIENT_SECRET');
    if (!process.env.NEXT_PUBLIC_BASE_URL) {
        // We warn but don't strictly block if it's localhost, but for Netlify it's critical
        if (process.env.NODE_ENV === 'production') {
            missing.push('NEXT_PUBLIC_BASE_URL');
        }
    }

    if (missing.length > 0) {
        const error = `Configuration Missing: ${missing.join(', ')}`;
        console.error(`[OAuth Audit] ${error}`);
        console.error(`[OAuth Audit] Redirect URI expected in Google Console: ${REDIRECT_URI}`);
        throw new Error(error);
    }

    return {
        clientId: GOOGLE_CLIENT_ID!,
        clientSecret: GOOGLE_CLIENT_SECRET!,
        redirectUri: REDIRECT_URI
    };
}

/**
 * Generate the Google Auth URL
 */
export function getAuthUrl() {
    const { clientId, redirectUri } = validateConfig();
    const scopes = [
        'https://www.googleapis.com/auth/calendar.readonly',
        'https://www.googleapis.com/auth/userinfo.email',
    ];

    const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: scopes.join(' '),
        access_type: 'offline', // Required for refresh token
        prompt: 'consent', // Required to reliably get refresh token
    });

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

/**
 * Exchange auth code for tokens
 */
export async function exchangeCodeForTokens(code: string) {
    const { clientId, clientSecret, redirectUri } = validateConfig();
    const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
            code,
            client_id: clientId,
            client_secret: clientSecret,
            redirect_uri: redirectUri,
            grant_type: 'authorization_code',
        }),
    });

    const data = await res.json();
    if (!res.ok) {
        throw new Error(data.error_description || data.error || 'Failed to exchange code for tokens');
    }

    return {
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
        scope: data.scope,
        token_type: data.token_type,
    };
}

/**
 * Refresh the access token
 */
export async function refreshAccessToken(refreshToken: string) {
    const { clientId, clientSecret } = validateConfig();
    const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            refresh_token: refreshToken,
            grant_type: 'refresh_token',
        }),
    });

    const data = await res.json();
    if (!res.ok) {
        throw new Error(data.error_description || data.error || 'Failed to refresh access token');
    }

    return {
        access_token: data.access_token,
        expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
    };
}

/**
 * Fetch calendar events from Google API
 */
export async function fetchGoogleEvents(accessToken: string, timeMin: string, timeMax?: string) {
    const params = new URLSearchParams({
        timeMin,
        singleEvents: 'true', // Expand recurring events
        orderBy: 'startTime',
    });

    if (timeMax) {
        params.append('timeMax', timeMax);
    }

    const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params.toString()}`, {
        headers: {
            Authorization: `Bearer ${accessToken}`,
        },
    });

    const data = await res.json();
    if (!res.ok) {
        throw new Error(data.error?.message || 'Failed to fetch Google events');
    }

    return data.items || [];
}
