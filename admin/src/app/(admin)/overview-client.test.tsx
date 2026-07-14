/**
 * Overview client — renders the SSR-provided stats (including the
 * empty-degradation shape the page falls back to without Mongo).
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import OverviewClient from "./overview-client";
import type { DashboardStats } from "@/lib/mongo/admin-types";

const STATS: DashboardStats = {
  totalUsers: 1234,
  totalEvents: 56,
  totalRegistrations: 789,
  activeEvents: 12,
  totalEntities: 34,
  totalCircles: 7,
  totalCalendars: 3,
  userGrowth: 0,
  eventGrowth: 0,
  recentViews: 0,
  viewsGrowth: 0,
};

const EMPTY: DashboardStats = {
  ...STATS,
  totalUsers: 0,
  totalEvents: 0,
  totalRegistrations: 0,
  activeEvents: 0,
  totalEntities: 0,
  totalCircles: 0,
  totalCalendars: 0,
};

describe("OverviewClient", () => {
  it("renders the hero stat and the mineral stat tiles", () => {
    render(
      <OverviewClient stats={STATS} recentEvents={[]} recentUsers={[]} tickets={[]} />,
    );

    expect(screen.getByText("Overview")).toBeInTheDocument();
    expect(screen.getAllByText("Total RSVPs").length).toBeGreaterThan(0);
    expect(screen.getByText("1,234")).toBeInTheDocument(); // users
    expect(screen.getByText("Host Entities")).toBeInTheDocument();
    expect(screen.getByText("Circles")).toBeInTheDocument();
    expect(screen.getByText("Calendars")).toBeInTheDocument();
  });

  it("degrades to empty states without data (no-Mongo SSR fallback)", () => {
    render(
      <OverviewClient stats={EMPTY} recentEvents={[]} recentUsers={[]} tickets={[]} />,
    );

    expect(screen.getByText("No events found")).toBeInTheDocument();
    expect(screen.getByText("No users found")).toBeInTheDocument();
    expect(screen.getByText("All tickets resolved")).toBeInTheDocument();
  });
});
