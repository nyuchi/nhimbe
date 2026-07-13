import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { axe } from "vitest-axe";
import type { GeocodeSuggestion } from "@/app/actions/geocode";

// The combobox resolves suggestions through the geocodeAddress server action;
// mock it so the component can be exercised without Mongo or the network.
const geocodeAddress = vi.fn<(q: string) => Promise<GeocodeSuggestion[]>>();
vi.mock("@/app/actions/geocode", () => ({
  geocodeAddress: (q: string) => geocodeAddress(q),
}));

import { AddressAutocomplete } from "./address-autocomplete";

const DB_HIT: GeocodeSuggestion = {
  source: "db",
  placeId: "place-1",
  name: "Rainbow Towers",
  address: "1 Pennefather Ave",
  city: "Harare",
  country: "Zimbabwe",
  displayName: "Rainbow Towers, 1 Pennefather Ave, Harare, Zimbabwe",
  latitude: -17.83,
  longitude: 31.05,
};
const OSM_HIT: GeocodeSuggestion = {
  source: "osm",
  placeId: "osm:relation/1",
  name: "Bulawayo",
  address: "",
  city: "Bulawayo",
  country: "Zimbabwe",
  displayName: "Bulawayo, Zimbabwe",
  latitude: -20.13,
  longitude: 28.63,
};

beforeEach(() => {
  vi.clearAllMocks();
  geocodeAddress.mockResolvedValue([]);
});

describe("AddressAutocomplete accessibility", () => {
  it("renders an accessible combobox in its idle state", async () => {
    const { container } = render(
      <AddressAutocomplete value="" onChange={() => {}} onPlaceSelect={() => {}} />,
    );
    const input = screen.getByRole("combobox");
    expect(input).toHaveAttribute("aria-expanded", "false");
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("exposes an accessible listbox of suggestions", async () => {
    geocodeAddress.mockResolvedValue([DB_HIT, OSM_HIT]);
    const { container } = render(
      <AddressAutocomplete value="Harare venue" onChange={() => {}} onPlaceSelect={() => {}} />,
    );
    const listbox = await screen.findByRole("listbox");
    expect(listbox).toBeInTheDocument();
    expect(screen.getAllByRole("option")).toHaveLength(2);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});

describe("AddressAutocomplete behavior", () => {
  it("debounces then queries the geocoder and lists DB hits above OSM hits", async () => {
    geocodeAddress.mockResolvedValue([DB_HIT, OSM_HIT]);
    render(<AddressAutocomplete value="Rainbow" onChange={() => {}} onPlaceSelect={() => {}} />);
    await waitFor(() => expect(geocodeAddress).toHaveBeenCalledWith("Rainbow"));
    const options = await screen.findAllByRole("option");
    expect(options[0]).toHaveTextContent("In catalogue");
    expect(options[1]).toHaveTextContent("OpenStreetMap");
  });

  it("does not query for queries shorter than 3 characters", async () => {
    render(<AddressAutocomplete value="ab" onChange={() => {}} onPlaceSelect={() => {}} />);
    await new Promise((r) => setTimeout(r, 600));
    expect(geocodeAddress).not.toHaveBeenCalled();
  });

  it("emits address components (with coordinates) on select", async () => {
    geocodeAddress.mockResolvedValue([DB_HIT]);
    const onPlaceSelect = vi.fn();
    const onChange = vi.fn();
    render(
      <AddressAutocomplete value="Rainbow" onChange={onChange} onPlaceSelect={onPlaceSelect} />,
    );
    const option = await screen.findByRole("option");
    fireEvent.mouseDown(option);
    expect(onPlaceSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        venue: "Rainbow Towers",
        city: "Harare",
        country: "Zimbabwe",
        placeId: "place-1",
        latitude: -17.83,
        longitude: 31.05,
      }),
    );
    expect(onChange).toHaveBeenCalledWith(DB_HIT.displayName);
  });
});
