/**
 * PII Scrubber Middleware
 * 
 * Deterministic regex-based utility to strip sensitive data from calendar events
 * before storage or LLM processing.
 * 
 * CRITICAL: This must run BEFORE any data reaches:
 * - Supabase storage
 * - LLM APIs (OpenAI, etc.)
 * - Any external service
 */

/**
 * Patterns for detecting and redacting PII
 * Each pattern is designed to be conservative (prefer false positives over false negatives)
 */
const PII_PATTERNS = {
    // Video conferencing links
    zoom_links: /https?:\/\/([a-z0-9-]+\.)?zoom\.us\/j\/\d+(\?pwd=[^\s]+)?/gi,
    meet_links: /https?:\/\/meet\.google\.com\/[a-z-]+/gi,
    teams_links: /https?:\/\/teams\.microsoft\.com\/l\/meetup-join\/[^\s]+/gi,
    webex_links: /https?:\/\/([a-z0-9-]+\.)?webex\.com\/meet\/[^\s]+/gi,

    // Passwords and passcodes
    passwords: /password[:\s]+[\w!@#$%^&*]+/gi,
    passcodes: /passcode[:\s]+[\w!@#$%^&*]+/gi,
    pins: /\bpin[:\s]+\d{4,}/gi,

    // API keys and tokens (generic long alphanumeric strings)
    api_keys: /\b[A-Za-z0-9]{32,}\b/g,
} as const;

/**
 * Scrub PII from text using deterministic regex patterns
 * 
 * @param text - The text to scrub
 * @returns Scrubbed text with PII replaced by redaction markers
 */
export function scrubPII(text: string | null | undefined): string {
    if (!text) return '';

    return Object.entries(PII_PATTERNS).reduce(
        (cleaned, [type, pattern]) =>
            cleaned.replace(pattern, `[${type}_redacted]`),
        text
    );
}

/**
 * Scrub PII from calendar event data
 * 
 * @param event - Calendar event object
 * @returns Event with PII scrubbed from sensitive fields
 */
export function scrubEventPII<T extends { description?: string | null; location?: string | null }>(
    event: T
): T {
    return {
        ...event,
        description: event.description ? scrubPII(event.description) : event.description,
        // Note: We don't scrub location as it's structural data, not PII
        // Location like "Zoom" or "Google Meet" is metadata, not a sensitive link
    };
}

/**
 * Batch scrub PII from multiple events
 * 
 * @param events - Array of calendar events
 * @returns Events with PII scrubbed
 */
export function scrubEventsPII<T extends { description?: string | null; location?: string | null }>(
    events: T[]
): T[] {
    return events.map(scrubEventPII);
}

/**
 * Test utility to verify scrubbing patterns
 * Returns true if text contains any PII patterns
 */
export function containsPII(text: string): boolean {
    return Object.values(PII_PATTERNS).some(pattern => pattern.test(text));
}
