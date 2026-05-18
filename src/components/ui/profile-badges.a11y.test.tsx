import { render, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { axe } from "vitest-axe";
import { ProfileBadges } from "./profile-badges";

// Mock the supabase browser client so the component renders without
// making network calls. We seed one earned badge and one locked badge
// so axe sees both visual paths.
const mockEarnedQuery = vi.fn();
const mockBadgesQuery = vi.fn();

vi.mock("@/lib/supabase/client", () => ({
  getSupabaseBrowserClient: () => ({
    schema: () => ({
      from: (table: string) => ({
        select: () => ({
          eq: () => mockEarnedQuery(),
          limit: () => (table === "badges" ? mockBadgesQuery() : Promise.resolve({ data: [] })),
        }),
      }),
    }),
  }),
}));

describe("ProfileBadges accessibility", () => {
  beforeEach(() => {
    mockEarnedQuery.mockResolvedValue({
      data: [
        { badge_id: "first-event", earned_at: "2024-01-01T00:00:00Z", nft_minted: true },
      ],
    });
    mockBadgesQuery.mockResolvedValue({
      data: [
        {
          id: "first-event",
          name: "First Event",
          description: "Hosted first event",
          icon: "🎉",
          badge_type: "host",
          is_nft_badge: true,
        },
        {
          id: "ten-events",
          name: "Ten Events",
          description: "Hosted ten events",
          icon: "🏆",
          badge_type: "host",
          is_nft_badge: false,
        },
      ],
    });
  });

  it("has no a11y violations once badges load", async () => {
    const { container, queryByText } = render(<ProfileBadges personId="person-1" />);
    await waitFor(() => {
      expect(queryByText("Badges")).toBeInTheDocument();
    });
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("renders nothing without a personId", () => {
    const { container } = render(<ProfileBadges personId="" />);
    // Component bails before rendering the section; container should be empty.
    expect(container.firstChild).toBeNull();
  });
});
