/**
 * PII Scrubber Test Suite
 * 
 * CRITICAL: These tests validate that sensitive data is NEVER stored in the database.
 * If any test fails, the ingestion pipeline must be considered compromised.
 * 
 * Test Coverage:
 * - Video conferencing links (Zoom, Meet, Teams, Webex)
 * - Passwords and passcodes
 * - API keys and tokens
 * - Edge cases and false positives
 */

import { describe, it, expect } from 'vitest';
import { scrubPII, scrubEventPII, scrubEventsPII, containsPII } from '@/lib/middleware/pii_scrubber';

describe('PII Scrubber - Video Conferencing Links', () => {
    it('should redact Zoom meeting links with password', () => {
        const input = 'Join: https://zoom.us/j/1234567890?pwd=abcdef123456';
        const result = scrubPII(input);
        expect(result).toBe('Join: [zoom_links_redacted]');
        expect(result).not.toContain('zoom.us');
        expect(result).not.toContain('pwd=');
    });

    it('should redact Zoom meeting links without password', () => {
        const input = 'Meeting: https://zoom.us/j/9876543210';
        const result = scrubPII(input);
        expect(result).toBe('Meeting: [zoom_links_redacted]');
    });

    it('should redact Zoom links with subdomain', () => {
        const input = 'Link: https://company.zoom.us/j/1234567890';
        const result = scrubPII(input);
        expect(result).toBe('Link: [zoom_links_redacted]');
    });

    it('should redact Google Meet links', () => {
        const input = 'Join here: https://meet.google.com/abc-defg-hij';
        const result = scrubPII(input);
        expect(result).toBe('Join here: [meet_links_redacted]');
    });

    it('should redact Microsoft Teams links', () => {
        const input = 'Teams: https://teams.microsoft.com/l/meetup-join/19%3ameeting_abc123';
        const result = scrubPII(input);
        expect(result).toBe('Teams: [teams_links_redacted]');
    });

    it('should redact Webex links', () => {
        const input = 'Webex: https://company.webex.com/meet/username';
        const result = scrubPII(input);
        expect(result).toBe('Webex: [webex_links_redacted]');
    });

    it('should redact multiple video links in same text', () => {
        const input = 'Zoom: https://zoom.us/j/123 or Meet: https://meet.google.com/abc-def';
        const result = scrubPII(input);
        expect(result).not.toContain('zoom.us');
        expect(result).not.toContain('meet.google.com');
        expect(result).toContain('[zoom_links_redacted]');
        expect(result).toContain('[meet_links_redacted]');
    });
});

describe('PII Scrubber - Passwords and Credentials', () => {
    it('should redact password with colon separator', () => {
        const input = 'Password: MySecret123!';
        const result = scrubPII(input);
        expect(result).toBe('[passwords_redacted]');
        expect(result).not.toContain('MySecret123');
    });

    it('should redact password with space separator', () => {
        const input = 'password abc123def';
        const result = scrubPII(input);
        expect(result).toBe('[passwords_redacted]');
    });

    it('should redact passcode', () => {
        const input = 'Passcode: 987654';
        const result = scrubPII(input);
        expect(result).toBe('[passcodes_redacted]');
    });

    it('should redact PIN numbers', () => {
        const input = 'PIN: 1234';
        const result = scrubPII(input);
        expect(result).toBe('[pins_redacted]');
    });

    it('should redact case-insensitive passwords', () => {
        const input = 'PASSWORD: Secret123';
        const result = scrubPII(input);
        expect(result).not.toContain('Secret123');
    });
});

describe('PII Scrubber - API Keys and Tokens', () => {
    it('should redact long alphanumeric strings (API keys)', () => {
        const input = 'API Key: abcdef1234567890abcdef1234567890abcdef12';
        const result = scrubPII(input);
        expect(result).not.toContain('abcdef1234567890abcdef1234567890abcdef12');
        expect(result).toContain('[api_keys_redacted]');
    });

    it('should NOT redact normal words or short strings', () => {
        const input = 'This is a normal sentence with regular words.';
        const result = scrubPII(input);
        expect(result).toBe(input); // Should be unchanged
    });
});

describe('PII Scrubber - Event Scrubbing', () => {
    it('should scrub PII from event description', () => {
        const event = {
            title: 'Team Meeting',
            description: 'Join: https://zoom.us/j/123456 Password: secret123',
            location: 'Virtual',
        };

        const scrubbed = scrubEventPII(event);
        expect(scrubbed.description).not.toContain('zoom.us');
        expect(scrubbed.description).not.toContain('secret123');
        expect(scrubbed.title).toBe('Team Meeting'); // Title unchanged
        expect(scrubbed.location).toBe('Virtual'); // Location unchanged
    });

    it('should handle null/undefined description', () => {
        const event = {
            title: 'Meeting',
            description: null,
            location: 'Office',
        };

        const scrubbed = scrubEventPII(event);
        expect(scrubbed.description).toBeNull();
    });

    it('should scrub multiple events in batch', () => {
        const events = [
            { description: 'Zoom: https://zoom.us/j/111' },
            { description: 'Meet: https://meet.google.com/abc' },
            { description: 'Password: test123' },
        ];

        const scrubbed = scrubEventsPII(events);
        scrubbed.forEach(event => {
            expect(event.description).not.toContain('zoom.us');
            expect(event.description).not.toContain('meet.google.com');
            expect(event.description).not.toContain('test123');
        });
    });
});

describe('PII Scrubber - Detection Utility', () => {
    it('should detect PII in text', () => {
        expect(containsPII('https://zoom.us/j/123')).toBe(true);
        expect(containsPII('Password: secret')).toBe(true);
        expect(containsPII('Normal text')).toBe(false);
    });
});

describe('PII Scrubber - Edge Cases', () => {
    it('should handle empty string', () => {
        expect(scrubPII('')).toBe('');
    });

    it('should handle null input', () => {
        expect(scrubPII(null)).toBe('');
    });

    it('should handle undefined input', () => {
        expect(scrubPII(undefined)).toBe('');
    });

    it('should preserve non-PII URLs', () => {
        const input = 'Check out https://example.com for more info';
        const result = scrubPII(input);
        expect(result).toBe(input); // Should be unchanged
    });

    it('should handle text with only whitespace', () => {
        const input = '   \n\t  ';
        const result = scrubPII(input);
        expect(result).toBe(input);
    });

    it('should handle mixed content', () => {
        const input = 'Meeting at 3pm. Zoom: https://zoom.us/j/123 Password: abc123. See you there!';
        const result = scrubPII(input);
        expect(result).toContain('Meeting at 3pm');
        expect(result).toContain('See you there!');
        expect(result).not.toContain('zoom.us');
        expect(result).not.toContain('abc123');
    });
});

describe('PII Scrubber - Fail-Closed Validation', () => {
    it('CRITICAL: must redact all standard meeting patterns', () => {
        const criticalPatterns = [
            'https://zoom.us/j/1234567890?pwd=abcdef',
            'https://meet.google.com/abc-defg-hij',
            'https://teams.microsoft.com/l/meetup-join/19%3ameeting',
            'Password: MySecret123',
            'Passcode: 987654',
        ];

        criticalPatterns.forEach(pattern => {
            const result = scrubPII(pattern);
            expect(result).not.toContain('zoom.us');
            expect(result).not.toContain('meet.google.com');
            expect(result).not.toContain('teams.microsoft.com');
            expect(result).not.toContain('MySecret123');
            expect(result).not.toContain('987654');
        });
    });

    it('CRITICAL: must never leak credentials in any form', () => {
        const sensitiveInputs = [
            'pwd=secretpassword123',
            'password: admin123',
            'PASSCODE: 999888',
        ];

        sensitiveInputs.forEach(input => {
            const result = scrubPII(input);
            expect(result.toLowerCase()).not.toContain('secret');
            expect(result.toLowerCase()).not.toContain('admin');
            expect(result).not.toContain('999888');
        });
    });
});
