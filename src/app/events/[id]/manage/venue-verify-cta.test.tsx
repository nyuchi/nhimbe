import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PlaceDetail } from "@/app/actions/places";

// The CTA reads the venue's Kweli tier through the getPlaceById server
// action; mock it so the component can be exercised without Mongo.
const getPlaceById = vi.fn<(id: string) => Promise<PlaceDetail | null>>();
vi.mock("@/app/actions/places", () => ({
  getPlaceById: (id: string) => getPlaceById(id),
}));

import { VenueVerifyCta } from "./venue-verify-cta";

function placeWithTier(verificationTier: number): PlaceDetail {
  return {
    id: "place-1",
    name: "Rainbow Towers",
    slug: null,
    description: null,
    latitude: null,
    longitude: null,
    elevation: null,
    addressLocality: null,
    addressRegion: null,
    streetAddress: null,
    postalCode: null,
    website: null,
    coverImage: null,
    image: null,
    openingHoursText: null,
    accessibilityFeature: null,
    tourismType: null,
    activity: null,
    aggregateRatingValue: null,
    aggregateRatingCount: null,
    verificationTier,
    osmContributed: false,
    osmChangesetId: null,
    osmContributedAt: null,
    dataOrigin: null,
    dataConfidence: null,
    communityConfirmations: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("VenueVerifyCta", () => {
  it("links an unverified venue to the Kweli gateway", async () => {
    getPlaceById.mockResolvedValue(placeWithTier(0));
    render(<VenueVerifyCta placeId="place-1" />);

    const link = await screen.findByRole("link", { name: /verify this venue on kweli/i });
    expect(link).toHaveAttribute(
      "href",
      "https://kweli.mukoko.com/en/verify?place=place-1&source=nhimbe",
    );
  });

  it("renders nothing for a verified venue", async () => {
    getPlaceById.mockResolvedValue(placeWithTier(2));
    const { container } = render(<VenueVerifyCta placeId="place-1" />);

    await waitFor(() => expect(getPlaceById).toHaveBeenCalledWith("place-1"));
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing without a placeId and never hits the action", () => {
    const { container } = render(<VenueVerifyCta placeId={null} />);
    expect(container).toBeEmptyDOMElement();
    expect(getPlaceById).not.toHaveBeenCalled();
  });

  it("renders nothing when the place read fails (best-effort)", async () => {
    getPlaceById.mockRejectedValue(new Error("boom"));
    const { container } = render(<VenueVerifyCta placeId="place-1" />);

    await waitFor(() => expect(getPlaceById).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});
