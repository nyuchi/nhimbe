/**
 * Minimal RFC 5545 (iCalendar) feed builder for calendar ICS exports
 * (NYU-25). Pure — no I/O, no server-only — so the escaping and date rules
 * are directly unit-testable. The route handler feeds it raw event docs.
 *
 * Deliberately small: VCALENDAR + VEVENTs with the fields calendar apps
 * actually consume (UID/DTSTAMP/DTSTART/DTEND/SUMMARY/LOCATION/URL/
 * DESCRIPTION). All times are emitted as UTC instants (`...Z`), text values
 * are escaped per RFC 5545 §3.3.11, and content lines are folded at 75
 * octets (§3.1).
 */

/** Escape TEXT values per RFC 5545 §3.3.11: backslash, semicolon, comma, newline. */
export function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

/** Format an instant as an RFC 5545 UTC DATE-TIME: `YYYYMMDDTHHMMSSZ`. */
export function formatIcsDateUtc(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  );
}

/**
 * Fold a content line at 75 octets (RFC 5545 §3.1): continuation lines start
 * with a single space. Splits on UTF-8 byte length, backing up so a multi-byte
 * character is never cut in half.
 */
export function foldIcsLine(line: string): string {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder("utf-8", { fatal: false });
  let bytes = encoder.encode(line);
  if (bytes.length <= 75) return line;

  const parts: string[] = [];
  let limit = 75;
  while (bytes.length > limit) {
    let cut = limit;
    // Never split inside a multi-byte sequence (continuation bytes are 10xxxxxx).
    while (cut > 0 && (bytes[cut] & 0xc0) === 0x80) cut--;
    parts.push(decoder.decode(bytes.slice(0, cut)));
    bytes = bytes.slice(cut);
    limit = 74; // continuation lines lose one octet to the leading space
  }
  parts.push(decoder.decode(bytes));
  return parts.join("\r\n ");
}

/** Trim a free-text description for the feed (calendar apps choke on essays). */
export function trimIcsDescription(text: string, max = 500): string {
  const collapsed = text.trim();
  if (collapsed.length <= max) return collapsed;
  return `${collapsed.slice(0, max - 1).trimEnd()}…`;
}

export interface IcsEventInput {
  /** Stable UID — the event's iCalUid. */
  uid: string;
  start: Date;
  end: Date;
  summary: string;
  location?: string | null;
  url?: string | null;
  description?: string | null;
}

export interface IcsCalendarInput {
  /** X-WR-CALNAME — the calendar's display name. */
  name: string;
  description?: string | null;
  events: IcsEventInput[];
  /** DTSTAMP source; defaults to now (injectable for deterministic tests). */
  now?: Date;
}

/** Build a complete `text/calendar` VCALENDAR document (CRLF line endings). */
export function buildCalendarIcs(input: IcsCalendarInput): string {
  const stamp = formatIcsDateUtc(input.now ?? new Date());
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//nhimbe//calendars//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeIcsText(input.name)}`,
  ];
  if (input.description) {
    lines.push(`X-WR-CALDESC:${escapeIcsText(trimIcsDescription(input.description))}`);
  }

  for (const event of input.events) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${escapeIcsText(event.uid)}`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${formatIcsDateUtc(event.start)}`,
      `DTEND:${formatIcsDateUtc(event.end)}`,
      `SUMMARY:${escapeIcsText(event.summary)}`,
    );
    if (event.location) lines.push(`LOCATION:${escapeIcsText(event.location)}`);
    if (event.url) lines.push(`URL:${escapeIcsText(event.url)}`);
    if (event.description) {
      lines.push(`DESCRIPTION:${escapeIcsText(trimIcsDescription(event.description))}`);
    }
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.map(foldIcsLine).join("\r\n") + "\r\n";
}
