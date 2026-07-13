import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { NyuchiProfileHeader } from "./nyuchi-profile-header";

afterEach(cleanup);

const el = () => document.querySelector('[data-slot="nyuchi-profile-header"]');

describe("NyuchiProfileHeader", () => {
  it("renders name, bio, badge and stats", () => {
    const { getByText } = render(
      <NyuchiProfileHeader
        name="Tendai Moyo"
        bio="Community advocate"
        badge={<span>V</span>}
        stats={[{ label: "Events", value: 12 }]}
      />,
    );
    expect(getByText("Tendai Moyo")).toBeTruthy();
    expect(getByText("Community advocate")).toBeTruthy();
    expect(getByText("V")).toBeTruthy();
    expect(getByText("Events")).toBeTruthy();
  });

  it("falls back to initials without an avatar", () => {
    const { getByText } = render(<NyuchiProfileHeader name="Tendai Moyo" />);
    expect(getByText("TM")).toBeTruthy();
  });

  it("renders a skeleton while loading", () => {
    render(<NyuchiProfileHeader name="X" loading />);
    expect(el()?.hasAttribute("data-loading")).toBe(true);
  });
});
