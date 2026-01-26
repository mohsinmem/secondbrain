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
    // Video conferencing links - Redact only the password/token parameters for privacy, keep base URL for context
    zoom_links: /(\?pwd=[^\s"']+)/gi,
    meet_links: /(\?authuser=[^\s"']+)/gi,
    teams_links: /(threadId=[^\s"']+)/gi, // Example of specific parameter scrubbing

    // Passwords and passcodes
    passwords: /password[:\s]+[\w!@#$%^&*]+/gi,
    passcodes: /passcode[:\s]+[\w!@#$%^&*]+/gi,
    pins: /\bpin[:\s]+\d{4,}/gi,

    // API keys and tokens (Look for high-entropy strings or common prefixes)
    // Matches 32+ char alphanumeric strings that HAVE numbers AND mixed casing (indicating high entropy)
    api_keys: /\b(?=[A-Za-z0-9]*[A-Z])(?=[A-Za-z0-9]*[a-z])(?=[A-Za-z0-9]*[0-9])[A-Za-z0-9]{32,}\b/g,
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
        // MANDATORY AUDIT (Phase 4.4.6): Process location for PII while preserving semantic context
        location: event.location ? scrubPII(event.location) : event.location,
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
