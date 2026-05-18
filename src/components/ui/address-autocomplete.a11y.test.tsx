import { render } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { axe } from "vitest-axe";
import { AddressAutocomplete } from "./address-autocomplete";

describe("AddressAutocomplete accessibility", () => {
  // The component renders a degraded "Google Places not configured" panel
  // when NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is missing. The test environment
  // does not set this, so we exercise that fallback path — no network,
  // no <script> injection, just the message UI.
  it("renders accessibly when Google Places is not configured", async () => {
    const { container } = render(
      <AddressAutocomplete value="" onChange={() => {}} onPlaceSelect={() => {}} />
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("surfaces the not-configured copy as readable text", () => {
    const { getByText } = render(
      <AddressAutocomplete value="" onChange={() => {}} onPlaceSelect={() => {}} />
    );
    expect(getByText(/Google Places not configured/i)).toBeInTheDocument();
  });
});
