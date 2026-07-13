import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { GeocodeSuggestion } from "@/app/actions/geocode";

// Resolve addresses through a mocked geocode action (no Mongo / network).
const geocodeAddress = vi.fn<(q: string, o?: unknown) => Promise<GeocodeSuggestion[]>>();
vi.mock("@/app/actions/geocode", () => ({
  geocodeAddress: (q: string, o?: unknown) => geocodeAddress(q, o),
}));

// Stub Leaflet — we assert on the rendered chrome/links, not tile rendering.
vi.mock("leaflet", () => {
  const chain = { addTo: vi.fn(() => chain) };
  const map = { remove: vi.fn() };
  return {
    default: {
      map: vi.fn(() => map),
      tileLayer: vi.fn(() => chain),
      marker: vi.fn(() => chain),
      divIcon: vi.fn(() => ({})),
    },
  };
});

import { EventMap } from "./event-map";

const COORD_HIT: GeocodeSuggestion = {
  source: "db",
  placeId: "place-1",
  name: "Rainbow Towers",
  address: "1 Pennefather Ave",
  city: "Harare",
  country: "Zimbabwe",
  displayName: "Rainbow Towers, Harare, Zimbabwe",
  latitude: -17.83,
  longitude: 31.05,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("EventMap", () => {
  it("renders the OSM-backed map with an openstreetmap directions link", async () => {
    geocodeAddress.mockResolvedValue([COORD_HIT]);
    render(<EventMap venue="Rainbow Towers" address="1 Pennefather Ave" city="Harare" country="Zimbabwe" />);

    const directions = await screen.findByRole("link", { name: /directions/i });
    expect(directions).toHaveAttribute("href", expect.stringContaining("openstreetmap.org/directions"));
    expect(directions.getAttribute("href")).not.toContain("google.com");
    expect(await screen.findByRole("application", { name: /map showing rainbow towers/i })).toBeInTheDocument();
  });

  it("falls back to an OSM search link when the address can't be geocoded", async () => {
    geocodeAddress.mockResolvedValue([]);
    render(<EventMap venue="Nowhere" address="" city="Atlantis" country="Nowhereland" />);

    const link = await screen.findByRole("link", { name: /view on openstreetmap/i });
    const href = link.getAttribute("href") ?? "";
    expect(href).toContain("openstreetmap.org/search");
    expect(href).not.toContain("google.com");
  });

  it("never emits a google.com URL", async () => {
    geocodeAddress.mockResolvedValue([COORD_HIT]);
    const { container } = render(
      <EventMap venue="Rainbow Towers" address="" city="Harare" country="Zimbabwe" />,
    );
    await waitFor(() => expect(geocodeAddress).toHaveBeenCalled());
    expect(container.innerHTML).not.toContain("google.com");
  });
});
