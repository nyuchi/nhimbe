import { render, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { axe } from "vitest-axe";
import { CommunityInsights, CommunityInsightsCompact } from "./community-insights";

const mockGetCommunityStats = vi.fn();

// community-insights reads through the discovery server action now (not the
// worker-era @/lib/api helper), so mock that — importing the real action would
// pull in `server-only` and blow up in jsdom.
vi.mock("@/app/actions/discovery", () => ({
  getCommunityStatsAction: (...args: unknown[]) => mockGetCommunityStats(...args),
}));

describe("CommunityInsights accessibility", () => {
  beforeEach(() => {
    mockGetCommunityStats.mockResolvedValue({
      totalEvents: 42,
      totalAttendees: 1234,
      trendingCategories: [
        { category: "Music", change: 25, events: 12 },
        { category: "Tech", change: -5, events: 8 },
      ],
      popularVenues: [
        { venue: "Harare Gardens", events: 5 },
        { venue: "Eastgate", events: 3 },
      ],
      peakTime: "Friday 18:00",
    });
  });

  it("full version has no a11y violations after data loads", async () => {
    const { container, queryByText } = render(<CommunityInsights city="Harare" />);
    await waitFor(() => {
      expect(queryByText("Community Insights")).toBeInTheDocument();
    });
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("compact version has no a11y violations after data loads", async () => {
    const { container, queryByText } = render(<CommunityInsightsCompact city="Harare" />);
    await waitFor(() => {
      expect(queryByText(/What's Trending/i)).toBeInTheDocument();
    });
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
