import { describe, it, expect } from "vitest";
import {
  escapeIcsText,
  formatIcsDateUtc,
  foldIcsLine,
  trimIcsDescription,
  buildCalendarIcs,
} from "./ics";

describe("escapeIcsText (RFC 5545 §3.3.11)", () => {
  it("escapes commas and semicolons", () => {
    expect(escapeIcsText("Harare Gardens, Park Lane; Gate 2")).toBe(
      "Harare Gardens\\, Park Lane\\; Gate 2",
    );
  });

  it("escapes newlines (all flavours) as literal \\n", () => {
    expect(escapeIcsText("line one\nline two\r\nline three\rline four")).toBe(
      "line one\\nline two\\nline three\\nline four",
    );
  });

  it("escapes backslashes first so escapes never double up", () => {
    expect(escapeIcsText("a\\b;c")).toBe("a\\\\b\\;c");
  });

  it("passes plain text through untouched", () => {
    expect(escapeIcsText("Sunday Jam Session")).toBe("Sunday Jam Session");
  });
});

describe("formatIcsDateUtc", () => {
  it("renders a UTC instant as YYYYMMDDTHHMMSSZ", () => {
    expect(formatIcsDateUtc(new Date("2026-08-01T09:05:07Z"))).toBe("20260801T090507Z");
  });

  it("normalizes offset instants to UTC", () => {
    // 18:30 at +02:00 is 16:30 UTC.
    expect(formatIcsDateUtc(new Date("2026-12-24T18:30:00+02:00"))).toBe("20261224T163000Z");
  });

  it("zero-pads every component", () => {
    expect(formatIcsDateUtc(new Date("2026-01-02T03:04:05Z"))).toBe("20260102T030405Z");
  });
});

describe("foldIcsLine (75-octet folding)", () => {
  it("leaves short lines unfolded", () => {
    expect(foldIcsLine("SUMMARY:Short")).toBe("SUMMARY:Short");
  });

  it("folds long lines with CRLF + space continuations at 75 octets", () => {
    const line = `DESCRIPTION:${"a".repeat(200)}`;
    const folded = foldIcsLine(line);
    const segments = folded.split("\r\n");
    expect(segments.length).toBeGreaterThan(1);
    expect(segments[0].length).toBe(75);
    for (const cont of segments.slice(1)) {
      expect(cont.startsWith(" ")).toBe(true);
      expect(new TextEncoder().encode(cont).length).toBeLessThanOrEqual(75);
    }
    // Reassembling (dropping CRLF+space) restores the original content.
    expect(folded.replace(/\r\n /g, "")).toBe(line);
  });

  it("never splits a multi-byte character in half", () => {
    const line = `SUMMARY:${"é".repeat(100)}`; // 2 bytes each
    const folded = foldIcsLine(line);
    expect(folded.replace(/\r\n /g, "")).toBe(line);
    for (const segment of folded.split("\r\n")) {
      // Every segment must decode cleanly on its own (no orphan bytes).
      expect(segment.includes("�")).toBe(false);
    }
  });
});

describe("trimIcsDescription", () => {
  it("keeps short descriptions intact", () => {
    expect(trimIcsDescription("A short blurb.")).toBe("A short blurb.");
  });

  it("trims long descriptions with an ellipsis at the cap", () => {
    const trimmed = trimIcsDescription("x".repeat(600), 500);
    expect(trimmed.length).toBeLessThanOrEqual(500);
    expect(trimmed.endsWith("…")).toBe(true);
  });
});

describe("buildCalendarIcs", () => {
  const now = new Date("2026-07-14T12:00:00Z");
  const events = [
    {
      uid: "event-1@nhimbe.com",
      start: new Date("2026-08-01T09:00:00Z"),
      end: new Date("2026-08-01T13:00:00Z"),
      summary: "Farmers Market; opening day",
      location: "Harare Gardens, Park Lane",
      url: "https://nhimbe.com/events/event-1",
      description: "Fresh produce\nLive music",
    },
  ];

  it("emits a complete VCALENDAR wrapper with the calendar identity", () => {
    const ics = buildCalendarIcs({ name: "Harare Live, Music", events: [], now });
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("VERSION:2.0");
    expect(ics).toContain("PRODID:-//nhimbe//calendars//EN");
    expect(ics).toContain("METHOD:PUBLISH");
    expect(ics).toContain("X-WR-CALNAME:Harare Live\\, Music");
    // No events → no VEVENT blocks, still a valid (empty) calendar.
    expect(ics).not.toContain("BEGIN:VEVENT");
  });

  it("emits one VEVENT per event with UID, UTC dates, and escaped text", () => {
    const ics = buildCalendarIcs({ name: "Markets", description: "Weekly; fresh", events, now });
    expect(ics).toContain("X-WR-CALDESC:Weekly\\; fresh");
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("UID:event-1@nhimbe.com");
    expect(ics).toContain("DTSTAMP:20260714T120000Z");
    expect(ics).toContain("DTSTART:20260801T090000Z");
    expect(ics).toContain("DTEND:20260801T130000Z");
    expect(ics).toContain("SUMMARY:Farmers Market\\; opening day");
    expect(ics).toContain("LOCATION:Harare Gardens\\, Park Lane");
    expect(ics).toContain("URL:https://nhimbe.com/events/event-1");
    expect(ics).toContain("DESCRIPTION:Fresh produce\\nLive music");
    expect(ics).toContain("END:VEVENT");
  });

  it("uses CRLF line endings throughout", () => {
    const ics = buildCalendarIcs({ name: "Markets", events, now });
    // Every LF is preceded by a CR.
    expect(ics.replace(/\r\n/g, "")).not.toContain("\n");
  });

  it("omits optional VEVENT fields that are absent", () => {
    const ics = buildCalendarIcs({
      name: "Markets",
      events: [{ ...events[0], location: null, description: null }],
      now,
    });
    expect(ics).not.toContain("LOCATION:");
    expect(ics).not.toContain("DESCRIPTION:");
  });

  it("emits a DTSTART-only VEVENT when endDate is missing (L3)", () => {
    // A single event with no end must not kill the whole feed — RFC 5545 §3.6.1
    // permits a VEVENT with only DTSTART.
    for (const end of [undefined, null]) {
      const ics = buildCalendarIcs({
        name: "Markets",
        events: [{ ...events[0], end }],
        now,
      });
      expect(ics).toContain("DTSTART:20260801T090000Z");
      expect(ics).not.toContain("DTEND:");
      expect(ics).toContain("BEGIN:VEVENT");
      expect(ics).toContain("END:VEVENT");
    }
  });

  it("skips DTEND for an invalid end date rather than emitting a broken line", () => {
    const ics = buildCalendarIcs({
      name: "Markets",
      events: [{ ...events[0], end: new Date("not-a-date") }],
      now,
    });
    expect(ics).not.toContain("DTEND:");
    expect(ics).not.toContain("NaN");
  });

  it("keeps building the rest of the feed when one event lacks an end", () => {
    const ics = buildCalendarIcs({
      name: "Markets",
      events: [{ ...events[0], uid: "no-end@nhimbe.com", end: null }, events[0]],
      now,
    });
    // Both events render; only the complete one carries a DTEND.
    expect(ics).toContain("UID:no-end@nhimbe.com");
    expect(ics).toContain("UID:event-1@nhimbe.com");
    expect((ics.match(/BEGIN:VEVENT/g) ?? []).length).toBe(2);
    expect((ics.match(/DTEND:/g) ?? []).length).toBe(1);
  });
});
