import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { NyuchiBadgeDisplay, type BadgeItem } from "./nyuchi-badge-display";

afterEach(cleanup);

const badges: BadgeItem[] = [
  { id: "1", name: "First Event", rarity: "common" },
  { id: "2", name: "Connector", rarity: "rare" },
  { id: "3", name: "Legend", rarity: "legendary", locked: true },
];

describe("NyuchiBadgeDisplay", () => {
  it("renders each badge in the grid layout as a list", () => {
    const { getByText, container } = render(<NyuchiBadgeDisplay badges={badges} />);
    expect(container.querySelector('[data-slot="nyuchi-badge-display"]')?.getAttribute("role")).toBe("list");
    expect(getByText("First Event")).toBeTruthy();
    expect(getByText("Legend")).toBeTruthy();
  });

  it("limits to maxVisible and shows a remainder in strip layout", () => {
    const { getByText } = render(<NyuchiBadgeDisplay badges={badges} layout="strip" maxVisible={2} />);
    expect(getByText("+1")).toBeTruthy();
  });

  it("renders a skeleton while loading", () => {
    render(<NyuchiBadgeDisplay badges={[]} loading />);
    expect(document.querySelector('[data-slot="nyuchi-badge-display"]')?.hasAttribute("data-loading")).toBe(true);
  });
});
