import { Suspense } from "react";
import { MapClient } from "./map-client";
import { getEventsAction } from "@/app/actions/discovery";

export const metadata = {
  title: "Map",
  description: "Discover events across the map with terrain-banded clusters.",
};

export default async function MapPage() {
  // Server-fetched events as the initial payload — the client takes over
  // from there for filter / selection state.
  let initialEvents: Awaited<ReturnType<typeof getEventsAction>>["events"] = [];
  try {
    const res = await getEventsAction({ limit: 100 });
    initialEvents = res.events;
  } catch {
    initialEvents = [];
  }

  return (
    <Suspense fallback={null}>
      <MapClient initialEvents={initialEvents} />
    </Suspense>
  );
}
