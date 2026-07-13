"use client";

import { WeatherEmbed } from "@/components/ui/weather-embed";
import type { WeatherWidgetType } from "@/lib/weather";

interface EventWeatherProps {
  city: string;
  eventDate: string;
}

/**
 * Venue weather for an event, rendered via the shared Mukoko weather embed
 * (replaces the old wttr.in fetch). Online events (no physical city) render
 * nothing. The widget variant tracks the event horizon: a multi-day forecast
 * for near-term events, current conditions otherwise (a forecast that far out
 * isn't meaningful).
 */
export function EventWeather({ city, eventDate }: EventWeatherProps) {
  if (!city || city === "Online") return null;

  const eventDateObj = new Date(eventDate);
  const now = new Date();
  const daysUntilEvent = Math.ceil(
    (eventDateObj.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
  );
  const type: WeatherWidgetType =
    daysUntilEvent >= 0 && daysUntilEvent <= 7 ? "5day" : "current";

  return (
    <div>
      <WeatherEmbed
        location={city}
        type={type}
        title={`Weather at ${city}`}
        height={type === "5day" ? 200 : 160}
      />
    </div>
  );
}
