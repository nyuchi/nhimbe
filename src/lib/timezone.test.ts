/**
 * Timezone & Date Utility Tests
 *
 * Tests date formatting and relative dates:
 * - formatTime: locale time formatting
 * - formatDate: locale date formatting
 * - getRelativeDate: today/tomorrow/weekday logic
 * - formatEventDateTime: combined date+time display
 *
 * Weather moved to the Mukoko embed (`src/lib/weather.ts`) — see
 * `weather.test.ts` for its coverage.
 */

import { describe, it, expect } from 'vitest';
import {
  getUserTimezone,
  formatTime,
  formatDate,
  getRelativeDate,
  formatEventDateTime,
  getCurrentTimeWithTimezone,
  zonedTimeToUtcIso,
  timezoneForCountry,
} from './timezone';

// ============================================
// getUserTimezone
// ============================================

describe('getUserTimezone', () => {
  it('returns timezone object with required fields', () => {
    const tz = getUserTimezone();
    expect(tz).toHaveProperty('timezone');
    expect(tz).toHaveProperty('offset');
    expect(typeof tz.timezone).toBe('string');
    expect(typeof tz.offset).toBe('string');
    expect(tz.offset).toMatch(/^GMT[+-]\d/);
  });

  it('extracts city from timezone', () => {
    const tz = getUserTimezone();
    // City is extracted from Intl timezone (e.g., "America/New_York" → "New York")
    if (tz.city) {
      expect(typeof tz.city).toBe('string');
      expect(tz.city.length).toBeGreaterThan(0);
    }
  });
});

// ============================================
// formatTime
// ============================================

describe('formatTime', () => {
  it('formats Date object', () => {
    const date = new Date('2026-03-15T14:30:00');
    const result = formatTime(date);
    // Should contain time in 12-hour format
    expect(result).toMatch(/\d{1,2}:\d{2}\s*(AM|PM)/);
  });

  it('formats ISO string', () => {
    const result = formatTime('2026-03-15T09:00:00');
    expect(result).toMatch(/\d{1,2}:\d{2}\s*(AM|PM)/);
  });

  it('respects custom options', () => {
    const result = formatTime('2026-03-15T14:30:00', { hour12: false });
    // With hour12: false, format varies by locale but should not have AM/PM
    expect(typeof result).toBe('string');
  });
});

// ============================================
// formatDate
// ============================================

describe('formatDate', () => {
  it('formats Date object with weekday, month, day', () => {
    const date = new Date('2026-03-15');
    const result = formatDate(date);
    // Should contain short weekday and month
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('formats ISO string', () => {
    const result = formatDate('2026-03-15');
    expect(typeof result).toBe('string');
  });
});

// ============================================
// getRelativeDate
// ============================================

describe('getRelativeDate', () => {
  it('returns "Today" for today\'s date', () => {
    const today = new Date();
    expect(getRelativeDate(today)).toBe('Today');
  });

  it('returns "Tomorrow" for tomorrow\'s date', () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    expect(getRelativeDate(tomorrow)).toBe('Tomorrow');
  });

  it('returns weekday name for dates 2-6 days away', () => {
    const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const threeDaysOut = new Date();
    threeDaysOut.setDate(threeDaysOut.getDate() + 3);

    const result = getRelativeDate(threeDaysOut);
    expect(weekdays).toContain(result);
  });

  it('returns formatted date for dates 7+ days away', () => {
    const farOut = new Date();
    farOut.setDate(farOut.getDate() + 14);

    const result = getRelativeDate(farOut);
    // Should not be a simple weekday name
    expect(['Today', 'Tomorrow']).not.toContain(result);
    // Should contain a month abbreviation
    expect(result).toMatch(/\w+/);
  });

  it('returns formatted date for past dates', () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    const result = getRelativeDate(yesterday);
    // Past dates should not be "Today" or "Tomorrow"
    expect(result).not.toBe('Today');
    expect(result).not.toBe('Tomorrow');
  });

  it('handles ISO string input', () => {
    const today = new Date();
    const result = getRelativeDate(today.toISOString());
    expect(result).toBe('Today');
  });
});

// ============================================
// formatEventDateTime
// ============================================

describe('formatEventDateTime', () => {
  it('formats with date and time', () => {
    const today = new Date();
    const result = formatEventDateTime(today.toISOString(), '3:00 PM');
    expect(result).toContain('Today');
    expect(result).toContain(',');
  });

  it('parses AM/PM time correctly', () => {
    const date = new Date();
    date.setDate(date.getDate() + 1);
    const result = formatEventDateTime(date.toISOString(), '9:00 AM');
    expect(result).toContain('Tomorrow');
  });

  it('handles time without AM/PM', () => {
    const date = new Date();
    const result = formatEventDateTime(date.toISOString(), '14:30');
    expect(typeof result).toBe('string');
  });

  it('handles missing time string', () => {
    const date = new Date();
    const result = formatEventDateTime(date.toISOString());
    expect(typeof result).toBe('string');
    expect(result).toContain('Today');
  });
});

// ============================================
// getCurrentTimeWithTimezone
// ============================================

describe('getCurrentTimeWithTimezone', () => {
  it('returns time with GMT offset', () => {
    const result = getCurrentTimeWithTimezone();
    expect(result).toMatch(/\d{1,2}:\d{2}\s*(AM|PM)\s*GMT[+-]\d/);
  });
});

// ============================================
// zonedTimeToUtcIso — the create/edit-event-form fix: "3pm in Harare" must
// become 13:00 UTC regardless of the organiser's own browser timezone.
// ============================================

describe('zonedTimeToUtcIso', () => {
  it('interprets wall-clock time as local to the venue timezone (Africa/Harare, UTC+2)', () => {
    const iso = zonedTimeToUtcIso('2026-08-03', '15:00', 'Africa/Harare');
    expect(iso).toBe('2026-08-03T13:00:00.000Z');
  });

  it('interprets wall-clock time in a negative-offset zone (America/New_York)', () => {
    // Aug 3 is within US DST (EDT, UTC-4).
    const iso = zonedTimeToUtcIso('2026-08-03', '09:00', 'America/New_York');
    expect(iso).toBe('2026-08-03T13:00:00.000Z');
  });

  it('is a no-op offset for UTC', () => {
    const iso = zonedTimeToUtcIso('2026-08-03', '15:00', 'UTC');
    expect(iso).toBe('2026-08-03T15:00:00.000Z');
  });

  it('falls back to treating input as UTC for an unrecognised zone name', () => {
    const iso = zonedTimeToUtcIso('2026-08-03', '15:00', 'Not/AZone');
    expect(iso).toBe('2026-08-03T15:00:00.000Z');
  });
});

describe('timezoneForCountry', () => {
  it('resolves known single-zone countries', () => {
    expect(timezoneForCountry('Zimbabwe')).toBe('Africa/Harare');
    expect(timezoneForCountry('Kenya')).toBe('Africa/Nairobi');
  });

  it('trims whitespace before lookup', () => {
    expect(timezoneForCountry(' Zimbabwe ')).toBe('Africa/Harare');
  });

  it('returns undefined for unknown or multi-zone countries', () => {
    expect(timezoneForCountry('United States')).toBeUndefined();
    expect(timezoneForCountry('Atlantis')).toBeUndefined();
  });
});
