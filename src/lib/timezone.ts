// Timezone utilities for nhimbe

export interface UserTimezone {
  timezone: string;
  offset: string;
  city?: string;
  country?: string;
}

// Get user's timezone info
export function getUserTimezone(): UserTimezone {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const now = new Date();
  const offsetMinutes = -now.getTimezoneOffset();
  const offsetHours = Math.floor(Math.abs(offsetMinutes) / 60);
  const offsetMins = Math.abs(offsetMinutes) % 60;
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const offset = `GMT${sign}${offsetHours}${offsetMins > 0 ? `:${offsetMins.toString().padStart(2, "0")}` : ""}`;

  // Extract city from timezone (e.g., "America/New_York" -> "New York")
  const parts = timezone.split("/");
  const city = parts[parts.length - 1]?.replace(/_/g, " ");

  return { timezone, offset, city };
}

// Format time for display in user's timezone
export function formatTime(date: Date | string, options?: Intl.DateTimeFormatOptions): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    ...options,
  });
}

// Format date for display
export function formatDate(date: Date | string, options?: Intl.DateTimeFormatOptions): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    ...options,
  });
}

// Get relative date string (Today, Tomorrow, or date)
export function getRelativeDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const targetDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.floor((targetDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  if (diffDays > 1 && diffDays <= 6) {
    return d.toLocaleDateString("en-US", { weekday: "long" });
  }
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

// Format event datetime for card display (e.g., "Tomorrow, 3:00 PM" or "Sat, Jan 10, 9:00 AM")
export function formatEventDateTime(dateStr: string, timeStr?: string): string {
  // Parse the date - handle various formats
  const date = new Date(dateStr);

  // If we have a time string, try to parse it
  if (timeStr) {
    const timeParts = timeStr.match(/(\d{1,2}):?(\d{2})?\s*(AM|PM)?/i);
    if (timeParts) {
      let hours = parseInt(timeParts[1], 10);
      const minutes = parseInt(timeParts[2] || "0", 10);
      const meridiem = timeParts[3]?.toUpperCase();

      if (meridiem === "PM" && hours < 12) hours += 12;
      if (meridiem === "AM" && hours === 12) hours = 0;

      date.setHours(hours, minutes);
    }
  }

  const relativeDate = getRelativeDate(date);
  const time = formatTime(date);

  return `${relativeDate}, ${time}`;
}

// Get current time formatted with timezone
export function getCurrentTimeWithTimezone(): string {
  const { offset } = getUserTimezone();
  const time = formatTime(new Date());
  return `${time} ${offset}`;
}

// Weather has moved to the shared Mukoko weather embed
// (`weather.mukoko.com/embed/widget`) — see `src/lib/weather.ts` and
// `src/components/ui/weather-embed.tsx`. The old wttr.in `getWeather` fetch and
// its `WeatherData` shape were removed with that migration.

/**
 * Venue-timezone-aware wall-clock <-> UTC conversion for the create/edit event
 * forms (NYU: "3pm in Harare" must become 13:00 UTC, not whatever offset the
 * organiser's own browser happens to be in). `tzOffsetMinutes` resolves what
 * offset a given IANA zone was actually at for a specific instant (DST-aware)
 * via the same two-pass `Intl.DateTimeFormat` trick `date-fns-tz` uses.
 */
function tzOffsetMinutes(utcGuess: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = dtf.formatToParts(utcGuess).reduce<Record<string, string>>((acc, p) => {
    acc[p.type] = p.value;
    return acc;
  }, {});
  const asIfUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return (asIfUtc - utcGuess.getTime()) / 60000;
}

/**
 * Interpret a `YYYY-MM-DD` date + `HH:MM` wall-clock time as local time in
 * `timeZone` and return the equivalent UTC ISO string. Falls back to treating
 * the input as already-UTC if `timeZone` isn't a recognised IANA name.
 */
export function zonedTimeToUtcIso(dateStr: string, timeStr: string, timeZone: string): string {
  const naiveUtcGuess = new Date(`${dateStr}T${timeStr}:00Z`);
  if (Number.isNaN(naiveUtcGuess.getTime())) return naiveUtcGuess.toISOString();
  let offsetMinutes = 0;
  try {
    offsetMinutes = tzOffsetMinutes(naiveUtcGuess, timeZone);
  } catch {
    offsetMinutes = 0; // Unknown zone name — treat the input as UTC.
  }
  return new Date(naiveUtcGuess.getTime() - offsetMinutes * 60000).toISOString();
}

/**
 * Single primary IANA timezone per country, for countries that only span one
 * zone (covers the app's core African markets plus other common single-zone
 * countries). Deliberately excludes multi-zone countries (US, Canada, Russia,
 * Brazil, Australia, Mexico, …) where a country-level guess would be wrong —
 * those are resolved from coordinates instead (`tz-lookup` in `geocode.ts`).
 */
export const COUNTRY_TIMEZONES: Record<string, string> = {
  Zimbabwe: "Africa/Harare",
  "South Africa": "Africa/Johannesburg",
  Kenya: "Africa/Nairobi",
  Nigeria: "Africa/Lagos",
  Zambia: "Africa/Lusaka",
  Botswana: "Africa/Gaborone",
  Namibia: "Africa/Windhoek",
  Mozambique: "Africa/Maputo",
  Malawi: "Africa/Blantyre",
  Tanzania: "Africa/Dar_es_Salaam",
  Uganda: "Africa/Kampala",
  Rwanda: "Africa/Kigali",
  Ghana: "Africa/Accra",
  Egypt: "Africa/Cairo",
  Ethiopia: "Africa/Addis_Ababa",
  Eswatini: "Africa/Mbabane",
  Lesotho: "Africa/Maseru",
  Angola: "Africa/Luanda",
  "United Kingdom": "Europe/London",
  Ireland: "Europe/Dublin",
  Portugal: "Europe/Lisbon",
  France: "Europe/Paris",
  Germany: "Europe/Berlin",
  Netherlands: "Europe/Amsterdam",
  Belgium: "Europe/Brussels",
  Spain: "Europe/Madrid",
  Italy: "Europe/Rome",
  Switzerland: "Europe/Zurich",
  Sweden: "Europe/Stockholm",
  Norway: "Europe/Oslo",
  Denmark: "Europe/Copenhagen",
  Poland: "Europe/Warsaw",
  "United Arab Emirates": "Asia/Dubai",
  "Saudi Arabia": "Asia/Riyadh",
  India: "Asia/Kolkata",
  Singapore: "Asia/Singapore",
  "New Zealand": "Pacific/Auckland",
};

/** Look up a single-zone country's primary IANA timezone, if known. */
export function timezoneForCountry(country: string): string | undefined {
  return COUNTRY_TIMEZONES[country.trim()];
}
