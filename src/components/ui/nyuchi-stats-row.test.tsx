import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { Users, Calendar, Eye } from "lucide-react";
import { NyuchiStatsRow } from "./nyuchi-stats-row";

afterEach(() => {
  cleanup();
  Object.defineProperty(window, "matchMedia", { writable: true, configurable: true, value: undefined });
});

function row() {
  return document.querySelector('[data-slot="nyuchi-stats-row"]');
}

const stats = [
  { icon: Users, label: "Members", value: "2.8K", trend: "+12%" },
  { icon: Calendar, label: "Events", value: 42 },
  { icon: Eye, label: "Views", value: "1.2K", trend: "-3%" },
];

describe("NyuchiStatsRow", () => {
  it("renders the inline layout by default with all stat values", () => {
    const { getByText } = render(<NyuchiStatsRow stats={stats} />);
    expect(row()?.getAttribute("data-layout")).toBe("inline");
    expect(getByText("2.8K")).toBeTruthy();
    expect(getByText("42")).toBeTruthy();
    expect(getByText("Members")).toBeTruthy();
  });

  it("colours positive and negative trends distinctly", () => {
    const { getByText } = render(<NyuchiStatsRow stats={stats} />);
    expect(getByText("+12%").className).toContain("text-emerald-400");
    expect(getByText("-3%").className).toContain("text-red-400");
  });

  it("renders the grid layout with the requested columns", () => {
    render(<NyuchiStatsRow stats={stats} layout="grid" columns={3} />);
    const el = row();
    expect(el?.getAttribute("data-layout")).toBe("grid");
    expect(el?.className).toContain("grid-cols-3");
  });

  it("renders a stat block as a link when href is set", () => {
    render(<NyuchiStatsRow stats={[{ icon: Users, label: "Members", value: 10, href: "/admin/users" }]} layout="grid" />);
    const link = document.querySelector('a[href="/admin/users"]');
    expect(link).toBeTruthy();
    expect(link?.textContent).toContain("Members");
  });

  it("renders a loading skeleton", () => {
    render(<NyuchiStatsRow stats={stats} loading />);
    const el = row();
    expect(el?.hasAttribute("data-loading")).toBe(true);
    expect(el?.getAttribute("aria-busy")).toBe("true");
    expect(el?.className).toContain("animate-pulse");
  });
});
