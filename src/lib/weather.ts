/**
 * Mukoko weather embed helpers.
 *
 * nhimbe surfaces live weather via the shared Mukoko weather widget at
 * `weather.mukoko.com/embed/widget`, replacing the old wttr.in JSON fetch. The
 * widget is an embeddable iframe keyed by a **place slug** and a widget `type`
 * (probed against the live service):
 *
 *   https://weather.mukoko.com/embed/widget?type=current&location=harare
 *
 * These helpers turn a human city name ("Victoria Falls", "Harare, Zimbabwe")
 * into the slug the widget expects and build the URL. Because the widget takes
 * a place string rather than raw coordinates, the browser-geolocation entry
 * point reverse-geocodes the device position to a city first (see
 * `reverseGeocode` in `src/app/actions/geocode.ts`).
 */

export type WeatherWidgetType = "current" | "today" | "5day" | "7day";

export const WEATHER_EMBED_ORIGIN = "https://weather.mukoko.com";

/**
 * Normalise a city name to the widget's location slug: drop any ", Country"
 * suffix, lowercase, and hyphenate. "Victoria Falls" -> "victoria-falls".
 */
export function slugifyLocation(city: string): string {
  return (city ?? "")
    .split(",")[0]
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Build the Mukoko weather-widget embed URL for a location + widget type. */
export function weatherEmbedUrl(location: string, type: WeatherWidgetType = "current"): string {
  const slug = slugifyLocation(location);
  const params = new URLSearchParams({ type, location: slug });
  return `${WEATHER_EMBED_ORIGIN}/embed/widget?${params.toString()}`;
}
