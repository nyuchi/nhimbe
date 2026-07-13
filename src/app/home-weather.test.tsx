import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ReverseGeocodeResult } from "@/app/actions/geocode";

const reverseGeocode = vi.fn<(lat: number, lng: number) => Promise<ReverseGeocodeResult | null>>();
vi.mock("@/app/actions/geocode", () => ({
  reverseGeocode: (lat: number, lng: number) => reverseGeocode(lat, lng),
}));

import { HomeWeather } from "./home-weather";

function setGeolocation(
  impl: ((success: PositionCallback, error?: PositionErrorCallback) => void) | null,
) {
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: impl ? { getCurrentPosition: impl } : undefined,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => {
  setGeolocation(null);
});

describe("HomeWeather", () => {
  it("seeds the button with the fallback (timezone) city", () => {
    render(<HomeWeather fallbackCity="Harare" />);
    expect(screen.getByRole("button", { name: /Weather · Harare/i })).toBeInTheDocument();
  });

  it("upgrades to the geolocated city via reverse-geocode", async () => {
    setGeolocation((success) =>
      success({ coords: { latitude: -20.13, longitude: 28.63 } } as GeolocationPosition),
    );
    reverseGeocode.mockResolvedValue({
      city: "Bulawayo",
      country: "Zimbabwe",
      displayName: "Bulawayo, Zimbabwe",
      latitude: -20.13,
      longitude: 28.63,
    });

    render(<HomeWeather fallbackCity="Harare" />);
    fireEvent.click(screen.getByRole("button", { name: /Weather/i }));
    fireEvent.click(screen.getByRole("button", { name: /use my location/i }));

    await waitFor(() =>
      expect(reverseGeocode).toHaveBeenCalledWith(-20.13, 28.63),
    );
    await screen.findByTitle("Weather for Bulawayo");
  });

  it("falls back to the timezone city when permission is denied", async () => {
    setGeolocation((_success, error) =>
      error?.({ code: 1, message: "denied" } as GeolocationPositionError),
    );

    render(<HomeWeather fallbackCity="Harare" />);
    fireEvent.click(screen.getByRole("button", { name: /Weather/i }));
    fireEvent.click(screen.getByRole("button", { name: /use my location/i }));

    expect(await screen.findByText(/access denied/i)).toBeInTheDocument();
    // Still shows the fallback city's weather.
    expect(screen.getByTitle("Weather for Harare")).toBeInTheDocument();
    expect(reverseGeocode).not.toHaveBeenCalled();
  });

  it("reports gracefully when geolocation is unavailable", async () => {
    setGeolocation(null); // no navigator.geolocation
    render(<HomeWeather fallbackCity="Harare" />);
    fireEvent.click(screen.getByRole("button", { name: /Weather/i }));
    fireEvent.click(screen.getByRole("button", { name: /use my location/i }));
    expect(await screen.findByText(/couldn't determine your location/i)).toBeInTheDocument();
  });
});
